/* ---------- UI 基础组件：弹层 / Toast / 图标 ---------- */
import { esc } from './utils.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const root = $('#toast-root');
  const el = h(`<div class="toast">${esc(msg)}</div>`);
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

let openCount = 0;

/** 立即收起所有提示（用于长任务完成后不再压住弹层） */
export function hideToast() {
  const root = $('#toast-root');
  if (!root) return;
  [...root.children].forEach(el => {
    el.style.transition = 'opacity .18s, transform .18s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  });
}

/**
 * 底部弹层
 * @param {{title?:string, subtitle?:string, body?:string|Element, actions?:Array, onMount?:Function, onClose?:Function}} opts
 */
export function openSheet(opts) {
  const { title = '', subtitle = '', body = '', actions = [], onMount, onClose } = opts;
  const root = $('#sheet-root');
  const el = h(`
    <div class="sheet">
      <div class="sheet-mask"></div>
      <div class="sheet-panel">
        <div class="sheet-grip"></div>
        ${title ? `<div class="sheet-head"><h2>${esc(title)}</h2></div>` : ''}
        ${subtitle ? `<p style="margin:-8px 0 14px;font-size:12.5px;color:var(--text-3);line-height:1.6">${subtitle}</p>` : ''}
        <div class="sheet-body"></div>
      </div>
    </div>`);

  const bodyEl = el.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  if (actions.length) {
    const bar = h('<div class="sheet-actions"></div>');
    actions.forEach(a => {
      const b = h(`<button class="btn ${a.variant === 'secondary' ? 'secondary' : a.variant === 'danger' ? 'danger' : ''}">${esc(a.text)}</button>`);
      b.addEventListener('click', () => a.onClick && a.onClick(close));
      bar.appendChild(b);
    });
    bodyEl.appendChild(bar);
  }

  root.appendChild(el);
  openCount++;
  document.body.style.overflow = 'hidden';

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    el.classList.add('closing');
    setTimeout(() => {
      el.remove();
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = '';
    }, 220);
    onClose && onClose();
  }

  el.querySelector('.sheet-mask').addEventListener('click', close);

  // 顶部下拉关闭
  let startY = null;
  const panel = el.querySelector('.sheet-panel');
  panel.addEventListener('touchstart', e => {
    if (panel.scrollTop <= 0) startY = e.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && panel.scrollTop <= 0) panel.style.transform = `translateY(${Math.min(dy * .5, 90)}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', e => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    panel.style.transform = '';
    if (dy > 110) close();
    startY = null;
  });

  onMount && onMount(el, close);
  return { el, body: bodyEl, close };
}

/** 确认弹层 */
export function confirmSheet({ title = '确认', message = '', okText = '确定', cancelText = '取消', danger = false }) {
  return new Promise(resolve => {
    openSheet({
      title,
      body: `<p style="margin:0;color:var(--text-2);font-size:14px;line-height:1.65">${esc(message)}</p>`,
      actions: [
        { text: cancelText, variant: 'secondary', onClick: c => { c(); resolve(false); } },
        { text: okText, variant: danger ? 'danger' : 'primary', onClick: c => { c(); resolve(true); } }
      ],
      onClose: () => resolve(false)
    });
  });
}

/** 开关元素 */
export function switchEl(checked, onChange) {
  const el = h(`<label class="switch"><input type="checkbox" ${checked ? 'checked' : ''}><i></i></label>`);
  el.querySelector('input').addEventListener('change', e => onChange(e.target.checked));
  return el;
}

/** 分段选择器 */
export function segmented(options, value, onChange) {
  const el = h(`<div class="seg">${options.map(o => `<button type="button" data-v="${esc(o.value)}" class="${o.value === value ? 'active' : ''}">${esc(o.label)}</button>`).join('')}</div>`);
  el.addEventListener('click', e => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    Array.from(el.children).forEach(b => b.classList.toggle('active', b === btn));
    onChange(btn.dataset.v);
  });
  return el;
}

export function emptyState(emoji, text) {
  return `<div class="empty"><div class="emoji">${emoji}</div><p>${esc(text)}</p></div>`;
}
