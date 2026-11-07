/* ---------- 图片全屏查看：双指缩放 / 双击放大 / 左右切换 ---------- */

/**
 * @param {string[]} urls 图片地址（dataURL 或 blobURL）
 * @param {number} start  从第几张开始
 */
export function openImageLightbox(urls, start = 0) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;

  let idx = Math.min(Math.max(0, start), list.length - 1);
  let scale = 1;
  let tx = 0;
  let ty = 0;

  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `
    <div class="lb-head">
      <span class="lb-count"></span>
      <button class="pdfv-btn" data-act="close" aria-label="关闭">
        <svg><use href="#i-x"/></svg>
      </button>
    </div>
    <div class="lb-stage">
      <img class="lb-img" alt="" draggable="false" />
    </div>
    ${list.length > 1 ? `
    <button class="lb-nav prev" data-act="prev" aria-label="上一张">‹</button>
    <button class="lb-nav next" data-act="next" aria-label="下一张">›</button>` : ''}`;

  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';

  const stage = el.querySelector('.lb-stage');
  const img = el.querySelector('.lb-img');
  const count = el.querySelector('.lb-count');

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    if (window.__setOverlayCloser) window.__setOverlayCloser(null);
    el.style.transition = 'opacity .16s';
    el.style.opacity = '0';
    setTimeout(() => {
      el.remove();
      document.body.style.overflow = '';
    }, 170);
  }
  if (window.__setOverlayCloser) window.__setOverlayCloser(close);

  function apply(animate = false) {
    img.style.transition = animate ? 'transform .18s ease' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    el.classList.toggle('zoomed', scale > 1.02);
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
    apply(true);
  }

  function show(i) {
    idx = (i + list.length) % list.length;
    img.src = list[idx];
    count.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
    reset();
  }

  /** 把缩放限制在「图片不会被拖出屏幕」的范围内 */
  function clampPan() {
    const r = stage.getBoundingClientRect();
    const w = img.offsetWidth * scale;
    const h = img.offsetHeight * scale;
    const maxX = Math.max(0, (w - r.width) / 2);
    const maxY = Math.max(0, (h - r.height) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  img.addEventListener('load', () => { reset(); });

  /* ---------- 手势 ---------- */
  let mode = null;          // 'pan' | 'pinch' | 'swipe'
  let startX = 0, startY = 0;
  let baseTx = 0, baseTy = 0;
  let pinchStart = 0, pinchScale0 = 1;
  let lastTap = 0;

  stage.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      mode = 'pinch';
      pinchStart = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY) || 1;
      pinchScale0 = scale;
      img.style.transition = 'none';
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    baseTx = tx;
    baseTy = ty;
    mode = scale > 1.02 ? 'pan' : 'swipe';
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    if (mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY) || 1;
      scale = Math.min(5, Math.max(1, pinchScale0 * (d / pinchStart)));
      if (scale <= 1.02) { tx = 0; ty = 0; }
      apply(false);
      return;
    }
    if (mode === 'pan') {
      e.preventDefault();
      tx = baseTx + (e.touches[0].clientX - startX);
      ty = baseTy + (e.touches[0].clientY - startY);
      clampPan();
      apply(false);
      return;
    }
    if (mode === 'swipe') {
      const dx = e.touches[0].clientX - startX;
      if (Math.abs(dx) > 8) {
        img.style.transition = 'none';
        img.style.transform = `translate(${dx}px, 0) scale(1)`;
      }
    }
  }, { passive: false });

  stage.addEventListener('touchend', e => {
    if (mode === 'pinch') {
      if (e.touches.length === 0) {
        if (scale < 1.05) { scale = 1; tx = 0; ty = 0; }
        clampPan();
        apply(true);
        mode = null;
      }
      return;
    }

    if (mode === 'pan') {
      clampPan();
      apply(true);
      mode = null;
      return;
    }

    if (mode === 'swipe') {
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      const dt = Date.now() - lastTap;

      if (Math.abs(dx) > 60 && list.length > 1) {
        show(idx + (dx < 0 ? 1 : -1));
        mode = null;
        return;
      }
      img.style.transition = 'transform .16s ease';
      img.style.transform = 'translate(0,0) scale(1)';

      // 双击放大 / 还原
      if (Math.abs(dx) < 12) {
        if (dt < 300) {
          lastTap = 0;
          if (scale > 1.02) { scale = 1; tx = 0; ty = 0; apply(true); }
          else { scale = 2.5; apply(true); }
        } else {
          lastTap = Date.now();
        }
      }
      mode = null;
    }
  });

  el.querySelector('[data-act="close"]').addEventListener('click', close);
  const prevBtn = el.querySelector('[data-act="prev"]');
  const nextBtn = el.querySelector('[data-act="next"]');
  if (prevBtn) prevBtn.addEventListener('click', () => show(idx - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => show(idx + 1));

  // 桌面/预览环境：键盘切换与关闭
  function onKey(e) {
    if (closed) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' && list.length > 1) show(idx - 1);
    else if (e.key === 'ArrowRight' && list.length > 1) show(idx + 1);
  }
  document.addEventListener('keydown', onKey);

  show(idx);
}
