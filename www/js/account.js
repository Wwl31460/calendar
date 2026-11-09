/* ---------- 账号状态（本地保存登录票据） ---------- */
import { apiChangePassword, apiLogin, apiLogout, apiRegister } from './cloud.js';

const AUTH_KEY = 'calapp.account.v1';
const SKIP_KEY = 'calapp.account.skip';

let state = read();
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.token ? v : null;
  } catch (e) {
    return null;
  }
}

function write(next) {
  state = next;
  try {
    if (next) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    else localStorage.removeItem(AUTH_KEY);
  } catch (e) { /* 存储满时不影响本次会话 */ }
  listeners.forEach(fn => { try { fn(state); } catch (err) { console.error(err); } });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function account() { return state; }
export function isLoggedIn() { return !!(state && state.token); }
export function token() { return state ? state.token : ''; }
export function username() { return state ? state.username : ''; }

/** 用户点过「先不登录」就不再每次启动都拦一道 */
export function skippedLogin() {
  try { return localStorage.getItem(SKIP_KEY) === '1'; } catch (e) { return false; }
}
export function skipLogin() {
  try { localStorage.setItem(SKIP_KEY, '1'); } catch (e) { /* ignore */ }
}
export function clearSkip() {
  try { localStorage.removeItem(SKIP_KEY); } catch (e) { /* ignore */ }
}

export async function login(name, password) {
  const r = await apiLogin(String(name || '').trim(), password);
  write({ token: r.token, username: r.username, at: Date.now() });
  clearSkip();
  return r;
}

export async function register(name, password) {
  const r = await apiRegister(String(name || '').trim(), password);
  write({ token: r.token, username: r.username, at: Date.now() });
  clearSkip();
  return r;
}

export async function changePassword(oldPwd, newPwd) {
  if (!state) throw new Error('请先登录');
  return apiChangePassword(state.token, oldPwd, newPwd);
}

/** 退出登录：只清本地票据，本机数据保留 */
export async function logout() {
  const t = state && state.token;
  write(null);
  if (t) await apiLogout(t);
}

/** 票据失效（云端说 AUTH）时清掉，让界面回到未登录 */
export function invalidate() {
  write(null);
}
