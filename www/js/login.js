/* ---------- 登录 / 注册 ---------- */
import { cloudReady } from './cloud.js';
import { isLoggedIn, login, register, skipLogin, clearSkip } from './account.js';
import { syncNow } from './sync.js';
import { $, toast } from './ui.js';

let mode = 'login';       // login | register
let busy = false;
let onDone = null;

const el = id => document.getElementById(id);

export function loginVisible() {
  const box = el('auth-screen');
  return !!box && !box.hidden;
}

export function openLogin(opts = {}) {
  const box = el('auth-screen');
  if (!box) return;
  onDone = opts.onDone || null;
  box.hidden = false;
  document.body.classList.add('auth-open');
  setMode('login');
  el('auth-err').textContent = '';
  el('auth-pass').value = '';
  setTimeout(() => {
    const u = el('auth-user');
    if (u && !u.value) u.focus();
    else el('auth-pass').focus();
  }, 260);
}

export function closeLogin() {
  const box = el('auth-screen');
  if (!box) return;
  box.hidden = true;
  document.body.classList.remove('auth-open');
  const fn = onDone;
  onDone = null;
  if (fn) fn();
}

function setMode(next) {
  mode = next;
  const isLogin = mode === 'login';
  el('auth-title').textContent = isLogin ? '登录' : '创建账号';
  el('auth-sub').textContent = isLogin
    ? '换设备登录同一账号，日志、提醒、课表都还在'
    : '记一个用户名和密码，数据会存到云端';
  el('auth-submit').textContent = isLogin ? '登录' : '注册并登录';
  el('auth-toggle').textContent = isLogin ? '还没有账号？注册一个' : '已有账号？直接登录';
  el('auth-pass').autocomplete = isLogin ? 'current-password' : 'new-password';
  el('auth-err').textContent = '';
}

function setBusy(v) {
  busy = v;
  const btn = el('auth-submit');
  btn.disabled = v;
  btn.textContent = v ? (mode === 'login' ? '正在登录…' : '正在注册…') : (mode === 'login' ? '登录' : '注册并登录');
}

function showError(msg) {
  el('auth-err').textContent = msg || '';
}

async function submit(e) {
  if (e) e.preventDefault();
  if (busy) return;

  const name = (el('auth-user').value || '').trim();
  const pass = el('auth-pass').value || '';

  if (!name) { showError('请输入用户名'); el('auth-user').focus(); return; }
  if (!pass) { showError('请输入密码'); el('auth-pass').focus(); return; }

  if (!cloudReady()) {
    showError('云端组件没加载出来，请检查网络后重开 App');
    return;
  }

  showError('');
  setBusy(true);
  try {
    if (mode === 'login') await login(name, pass);
    else await register(name, pass);

    toast(mode === 'login' ? `欢迎回来，${name}` : '账号已创建，正在同步');
    setBusy(false);
    closeLogin();

    // 登录后立刻双向同步一次：本地有的传上去，云端有的拉下来
    try {
      const r = await syncNow('login');
      if (r && (r.pushed || r.pulled)) {
        toast(`已同步 · 上传 ${r.pushed} 条／接收 ${r.pulled} 条`, 2600);
      }
    } catch (err) {
      toast('已登录，但同步没成功，可稍后在设置里重试', 3000);
    }
    window.__refresh && window.__refresh();
  } catch (err) {
    setBusy(false);
    showError((err && err.message) || '登录失败，请重试');
  }
}

function bind() {
  const form = el('auth-form');
  if (!form) return;
  form.addEventListener('submit', submit);
  el('auth-toggle').addEventListener('click', () => {
    setMode(mode === 'login' ? 'register' : 'login');
  });
  el('auth-skip').addEventListener('click', () => {
    skipLogin();
    closeLogin();
  });
  el('auth-hint').addEventListener('click', () => {
    el('auth-user').value = '吴文林';
    el('auth-pass').value = '123456';
    clearSkip();
    showError('');
  });
  ['auth-user', 'auth-pass'].forEach(id => {
    el(id).addEventListener('input', () => { if (el('auth-err').textContent) showError(''); });
  });
}

/** 启动时判断要不要拦一道登录页 */
export function maybeShowLogin() {
  if (isLoggedIn()) return false;
  return true;
}

bind();

/* 供设置页调用 */
window.__openLogin = openLogin;
