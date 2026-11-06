/* ---------- 课表原文件阅读器：PDF / 图片，支持双指缩放、旋转、横屏适配 ---------- */
import { ensurePdfJs } from './pdf-parse.js';

/**
 * 全屏查看课表原文件
 * @param {{kind?:'pdf'|'image', data?:ArrayBuffer, blob?:Blob, name?:string}} opts
 */
export async function openDocViewer({ kind = 'pdf', data, blob, name = '课表' }) {
  const el = document.createElement('div');
  el.className = 'pdfv';
  el.innerHTML = `
    <div class="pdfv-head">
      <button class="pdfv-btn" data-act="close" aria-label="关闭"><svg><use href="#i-x"/></svg></button>
      <div class="name"></div>
      <span class="pg"></span>
      <button class="pdfv-btn" data-act="rot" aria-label="旋转">⟳</button>
      <button class="pdfv-btn" data-act="out" aria-label="缩小">−</button>
      <button class="pdfv-btn" data-act="in" aria-label="放大">+</button>
    </div>
    <div class="pdfv-body"><div class="pdfv-pages"><div class="pdfv-tip">正在渲染…</div></div></div>`;

  el.querySelector('.name').textContent = name;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const body = el.querySelector('.pdfv-body');
  const pages = el.querySelector('.pdfv-pages');
  const pgEl = el.querySelector('.pg');

  let closed = false;
  let doc = null;
  let img = null;
  let zoom = 1;
  let userRot = null;      // 用户手动旋转的角度；null 表示跟随屏幕方向自动判断
  let busy = false;
  let pending = false;
  let timer = null;

  function close() {
    if (closed) return;
    closed = true;
    if (window.__setOverlayCloser) window.__setOverlayCloser(null);
    el.style.transition = 'opacity .18s';
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      document.body.style.overflow = '';
      try { doc && doc.destroy && doc.destroy(); } catch (e) { /* ignore */ }
      if (img && img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }, 190);
  }
  if (window.__setOverlayCloser) window.__setOverlayCloser(close);

  el.querySelector('[data-act="close"]').addEventListener('click', close);
  el.querySelector('[data-act="in"]').addEventListener('click', () => setZoom(zoom + 0.25));
  el.querySelector('[data-act="out"]').addEventListener('click', () => setZoom(zoom - 0.25));
  el.querySelector('[data-act="rot"]').addEventListener('click', () => {
    const cur = userRot == null ? 0 : userRot;
    userRot = (cur + 90) % 360;
    draw();
  });

  function setZoom(z) {
    zoom = Math.min(4, Math.max(1, Math.round(z * 100) / 100));
    draw();
  }

  /* ---------- 双指缩放 ---------- */
  let pinchStart = 0, pinchZoom0 = 1, pinchBasePx = 0, zooming = false;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  body.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinchStart = dist(e.touches);
      pinchZoom0 = zoom;
      // 记录「每 1 倍缩放对应的像素宽度」，手势过程中按它线性放大
      const w = pages.getBoundingClientRect().width || 1;
      pinchBasePx = w / (zoom || 1);
      zooming = true;
    }
  }, { passive: true });

  body.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinchStart > 0) {
      e.preventDefault();
      const d = dist(e.touches);
      const next = Math.min(4, Math.max(1, pinchZoom0 * (d / pinchStart)));
      zoom = next;
      // 手势过程中只做等比缩放，松手后再重绘成清晰版本
      pages.style.width = `${pinchBasePx * next}px`;
    }
  }, { passive: false });

  body.addEventListener('touchend', e => {
    if (e.touches.length < 2 && zooming) {
      zooming = false;
      pinchStart = 0;
      zoom = Math.min(4, Math.max(1, Math.round(zoom * 100) / 100));
      clearTimeout(timer);
      timer = setTimeout(draw, 180);
    }
  });

  // 双击放大 / 还原
  let lastTap = 0;
  body.addEventListener('touchend', e => {
    if (e.touches.length) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      setZoom(zoom > 1.2 ? 1 : 2);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  function onResize() {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!closed) draw(); }, 260);
  }

  /* ---------- 渲染 ---------- */
  // 旋转只由用户手动控制：自动旋转会让文字横躺，反而更难读
  function rotationFor() {
    return userRot == null ? 0 : userRot;
  }

  async function draw() {
    if (closed) return;
    if (busy) { pending = true; return; }
    busy = true;
    try {
      if (kind === 'pdf') await drawPdf();
      else drawImage();
    } catch (err) {
      console.error(err);
      pages.innerHTML = `<div class="pdfv-tip">无法显示：${String(err.message || err)}</div>`;
    } finally {
      busy = false;
      if (pending) { pending = false; draw(); }
    }
  }

  /* 计算展示尺寸：默认整页塞进屏幕（超长图除外，按宽度铺满便于上下滚动） */
  function layout(natW, natH, rot) {
    const swapped = Math.abs(rot) % 180 !== 0;
    const boxW = swapped ? natH : natW;
    const boxH = swapped ? natW : natH;
    const availW = Math.max(220, body.clientWidth - 16);
    const availH = Math.max(220, body.clientHeight - 20);
    const fitW = availW / boxW;
    const fitH = availH / boxH;
    const veryTall = boxH / boxW > 2.2;
    const fit = veryTall ? fitW : Math.min(fitW, fitH);
    const k = fit * zoom;
    return { box: [boxW * k, boxH * k], nat: [natW * k, natH * k], k, rot };
  }

  function makeWrap(L) {
    const wrap = document.createElement('div');
    wrap.className = 'pdfv-page';
    wrap.style.width = `${Math.round(L.box[0])}px`;
    wrap.style.height = `${Math.round(L.box[1])}px`;
    return wrap;
  }

  /* 把「原方向」的媒体元素放进 wrap 并旋转：尺寸与坐标系完全由 CSS 决定，避免渲染偏移 */
  function place(wrap, node, L) {
    node.style.position = 'absolute';
    node.style.left = '50%';
    node.style.top = '50%';
    node.style.width = `${L.nat[0]}px`;
    node.style.height = `${L.nat[1]}px`;
    node.style.display = 'block';
    node.style.transform = `translate(-50%, -50%) rotate(${L.rot}deg)`;
    wrap.appendChild(node);
  }

  async function drawPdf() {
    if (!doc) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const frag = document.createDocumentFragment();
    let maxW = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      if (closed) return;
      const page = await doc.getPage(p);
      const v1 = page.getViewport({ scale: 1 });
      const L = layout(v1.width, v1.height, rotationFor());
      // 始终按页面原始方向渲染，旋转交给 CSS
      const vp = page.getViewport({ scale: L.k * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const wrap = makeWrap(L);
      place(wrap, canvas, L);
      frag.appendChild(wrap);
      maxW = Math.max(maxW, L.box[0]);

      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      } catch (e) { console.error(e); }
    }

    if (closed) return;
    pages.style.width = `${Math.round(maxW)}px`;
    pages.replaceChildren(frag);
  }

  function drawImage() {
    if (!img) return;
    const rot = rotationFor();
    const L = layout(img.naturalWidth, img.naturalHeight, rot);
    const wrap = makeWrap(L);
    place(wrap, img, L);
    pages.style.width = `${Math.round(L.box[0])}px`;
    pages.replaceChildren(wrap);
  }

  try {
    if (kind === 'pdf') {
      const pdfjs = await ensurePdfJs();
      doc = await pdfjs.getDocument({ data }).promise;
      pgEl.textContent = `${doc.numPages} 页`;
    } else {
      const url = URL.createObjectURL(blob);
      img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('图片无法解码'));
        im.src = url;
      });
      pgEl.textContent = '图片';
    }
    await draw();
  } catch (err) {
    console.error(err);
    pages.innerHTML = `<div class="pdfv-tip">这个文件无法显示：${String(err.message || err)}</div>`;
  }
}

/* 兼容旧调用 */
export const openPdfViewer = opts => openDocViewer({ ...opts, kind: 'pdf' });
