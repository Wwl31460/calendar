/* ---------- 应用入口 ---------- */
import { db, subscribe } from './store.js';
import * as calendar from './views/calendar.js';
import * as timetable from './views/timetable.js';
import * as notes from './views/notes.js';
import * as reminders from './views/reminders.js';
import * as settingsView from './views/settings.js';
import { ensurePermission, isNative, startEngine, syncNativeSchedule } from './reminder.js';
import { applyTheme, initTheme } from './theme.js';
import { autoCheck } from './updater.js';
import { $, $$, closeTopSheet, sheetCount, toast } from './ui.js';

const views = {
  calendar,
  timetable,
  notes,
  reminders,
  settings: settingsView
};

let current = 'calendar';
/* 全屏覆盖层（PDF/图片阅读器）的关闭函数 */
let overlayClose = null;
export function setOverlayCloser(fn) { overlayClose = fn; syncBackState(); }
window.__setOverlayCloser = setOverlayCloser;

/** 当前"可以返回上一级"的层数：弹层 / 覆盖层 / 设置页各算一层 */
function backDepth() {
  let n = sheetCount();
  if (overlayClose) n += 1;
  if (current === 'settings') n += 1;
  return n;
}

/** 告知原生层：>0 时返回键交给网页处理，=0 时才退出 App */
function syncBackState() {
  try {
    const depth = backDepth();
    if (window.AppBack && window.AppBack.setDepth) window.AppBack.setDepth(depth);
  } catch (e) { /* 非原生环境 */ }
}
window.__syncBackState = syncBackState;

/** 原生返回键 → 逐级退回，而不是直接退出应用 */
window.__handleBack = () => {
  if (overlayClose) {
    const fn = overlayClose;
    overlayClose = null;
    try { fn(); } catch (e) { /* ignore */ }
    syncBackState();
    return true;
  }
  if (closeTopSheet()) { syncBackState(); return true; }
  if (current === 'settings') { switchView('calendar'); return true; }
  syncBackState();
  return false;
};

export function switchView(name) {
  if (!views[name]) return;
  current = name;
  document.body.classList.toggle('in-settings', name === 'settings');
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  views[name].render && views[name].render();
  window.scrollTo({ top: 0 });
  syncBackState();
}

function init() {
  initTheme();

  // 各视图事件绑定
  calendar.bind();
  timetable.bind();
  notes.bind();
  reminders.bind();

  // 底部导航
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.tab));
  });

  // 设置页入口
  $('#cal-settings').addEventListener('click', () => switchView('settings'));
  $('#set-back').addEventListener('click', () => switchView('calendar'));

  // 数据变更 → 重绘当前视图
  let pending = false;
  const rerender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (views[current].render) views[current].render();
    });
  };
  let syncTimer = null;
  const scheduleSync = () => {
    if (!isNative()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNativeSchedule(), 2500);
  };
  subscribe(() => { rerender(); scheduleSync(); });

  // 首次渲染
  calendar.render();
  switchView('calendar');

  startEngine();
  if (isNative()) {
    ensurePermission().then(() => syncNativeSchedule());
  }

  // 每天自动检查一次更新（失败静默）
  setTimeout(() => { autoCheck().catch(() => {}); }, 3000);

  // 提醒触发反馈
  document.addEventListener('reminder-fired', e => {
    const d = e.detail || {};
    if (d.type === 'reminder') toast(`🔔 ${d.reminder.title}`);
    else if (d.type === 'course') toast(`📚 ${d.course.name} 即将开始`);
    rerender();
  });

  document.addEventListener('reminder-missed', e => {
    const d = e.detail || {};
    toast(`有 ${d.count} 条提醒已错过：${d.names}`);
  });

  // 切回前台刷新
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) rerender();
  });

  // Service Worker（仅网页版需要；APK 内资源已内置，避免缓存旧版本）
  const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if ('serviceWorker' in navigator && !inApp && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 注册失败', err));
    });
  }

  // 首次使用的通知权限引导（延迟，避免打断）
  if ('Notification' in window && Notification.permission === 'default' && db.reminders.length > 0) {
    setTimeout(() => ensurePermission(), 2500);
  }
}

/* 供表单等模块调用 */
window.__refresh = () => { if (views[current].render) views[current].render(); };
window.__switchView = switchView;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInit);
else tryInit();

function tryInit() {
  try {
    init();
  } catch (err) {
    console.error(err);
    document.title = 'ERR ' + (err && err.message);
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#fee;color:#900;font-size:11px;padding:8px;white-space:pre-wrap';
    pre.textContent = '启动失败：' + (err && (err.stack || err.message));
    document.body.appendChild(pre);
  }
}

/* 演示数据（?demo=1） */
if (location.search.includes('demo=1')) {
  import('./demo.js').then(m => m.seed && m.seed());
}
