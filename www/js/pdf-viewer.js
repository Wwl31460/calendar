/* ---------- 课表 PDF 原图阅读器（不依赖文字层） ---------- */
import { ensurePdfJs } from './pdf-parse.js';

/**
 * 全屏查看 PDF 原文件
 * @param {{data: ArrayBuffer, name?: string}} opts
 */
export async function openPdfViewer({ data, name = '课表.pdf' }) {
  const el = document.createElement('div');
  el.className = 'pdfv';
  el.innerHTML = `
    <div class="pdfv-head">
      <button class="pdfv-btn" data-act="close" aria-label="关闭"><svg><use href="#i-x"/></svg></button>
      <div class="name"></div>
      <span class="pg"></span>
      <button class="pdfv-btn" data-act="out" aria-label="缩小">−</button>
      <button class="pdfv-btn" data-act="in" aria-label="放大">+</button>
    </div>
    <div class="pdfv-body"><div class="pdfv-tip">正在渲染…</div></div>`;

  el.querySelector('.name').textContent = name;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const body = el.querySelector('.pdfv-body');
  const pgEl = el.querySelector('.pg');

  let closed = false;
  let doc = null;
  let zoom = 1;
  let busy = false;

  function close() {
    if (closed) return;
    closed = true;
    el.style.transition = 'opacity .18s';
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      document.body.style.overflow = '';
      try { doc && doc.destroy && doc.destroy(); } catch (e) {}
    }, 190);
  }

  el.querySelector('[data-act="close"]').addEventListener('click', close);
  el.querySelector('[data-act="in"]').addEventListener('click', () => setZoom(zoom + 0.25));
  el.querySelector('[data-act="out"]').addEventListener('click', () => setZoom(zoom - 0.25));

  function setZoom(z) {
    const next = Math.min(3, Math.max(1, Math.round(z * 100) / 100));
    if (next === zoom) return;
    zoom = next;
    draw();
  }

  try {
    const pdfjs = await ensurePdfJs();
    doc = await pdfjs.getDocument({ data }).promise;
    pgEl.textContent = `${doc.numPages} 页`;
    draw();
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="pdfv-tip">这个 PDF 无法渲染：${String(err.message || err)}</div>`;
  }

  async function draw() {
    if (!doc || busy || closed) return;
    busy = true;
    body.innerHTML = '';
    const baseW = Math.max(240, body.clientWidth - 16);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    for (let p = 1; p <= doc.numPages; p++) {
      if (closed) break;
      const page = await doc.getPage(p);
      const v0 = page.getViewport({ scale: 1 });
      const scale = (baseW * zoom / v0.width) * dpr;
      const vp = page.getViewport({ scale });

      const wrap = document.createElement('div');
      wrap.className = 'pdfv-page';
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      wrap.appendChild(canvas);
      body.appendChild(wrap);

      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      } catch (e) { console.error(e); }
    }
    busy = false;
    body.scrollTop = 0;
  }
}
