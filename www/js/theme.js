/* ---------- 主题 ---------- */
import { db, setSetting } from './store.js';

export function applyTheme() {
  const t = db.settings.theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1117' : '#f4f6fb');
}

export function initTheme() {
  applyTheme();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => { if ((db.settings.theme || 'auto') === 'auto') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}

export function setTheme(v) {
  setSetting('theme', v);
  applyTheme();
}
