/* ---------- 云端接入（WorkBuddy Cloud Service） ----------
 * 只用 RPC：客户端拿不到任何表的直接读写权限，
 * 所有校验都在 SECURITY DEFINER 函数里做，凭 token 定位用户。
 */

export const CLOUD_CONFIG = {
  endpoint: 'https://calendar-apk-download.app.workbuddy.host',
  publishableKey: 'wbpk_1a2X5x6jj5r4XtiJgnmm9e_XlRvHnqLwkld6fe6lM5rALe83Lc7ehD2'
};

let client = null;
let lastError = null;

/** 懒初始化；SDK 未加载时抛错，由调用方给出明确提示 */
export function cloud() {
  if (client) return client;
  const W = window.WorkBuddyCloud;
  if (!W || typeof W.createWorkBuddyCloud !== 'function') {
    throw new Error('SDK_MISSING');
  }
  client = W.createWorkBuddyCloud({
    endpoint: CLOUD_CONFIG.endpoint,
    publishableKey: CLOUD_CONFIG.publishableKey
  });
  return client;
}

export function cloudReady() {
  try { cloud(); return true; } catch (e) { return false; }
}

const MESSAGES = {
  NO_USER: '账号不存在',
  BAD_PASS: '密码不正确',
  EMPTY: '请输入账号和密码',
  EXISTS: '这个用户名已经被注册了',
  BAD_NAME: '用户名至少 2 个字',
  BAD_PASSWORD: '密码至少 6 位',
  AUTH: '登录已过期，请重新登录',
  BAD_INPUT: '数据格式不对'
};

export class CloudError extends Error {
  constructor(code, message) {
    super(message || MESSAGES[code] || '云端请求失败');
    this.code = code;
  }
}

function normalize(err) {
  if (!err) return new CloudError('UNKNOWN');
  if (typeof err === 'string') return new CloudError('UNKNOWN', err);
  const msg = err.message || err.error_description || err.details || '';
  if (/invalid_client|access_denied|not allowed/i.test(msg)) {
    return new CloudError('BLOCKED', '当前设备无法连接云端');
  }
  return new CloudError('NETWORK', msg || '网络不太顺畅，请稍后再试');
}

/** 调用云端 RPC，返回 JSON 结果 */
export async function rpc(fn, args) {
  let res;
  try {
    res = await cloud().database.rpc(fn, args);
  } catch (e) {
    lastError = normalize(e);
    throw lastError;
  }
  if (res && res.error) {
    lastError = normalize(res.error);
    throw lastError;
  }
  lastError = null;
  return res ? res.data : null;
}

export function lastCloudError() { return lastError; }

/** 统一把函数返回的 {ok:false,error} 变成异常 */
function unwrap(payload) {
  if (!payload) throw new CloudError('EMPTY_RESPONSE', '云端没有返回数据');
  if (payload.ok === false) throw new CloudError(payload.error);
  return payload;
}

/* ---------- 账号 ---------- */
export async function apiLogin(username, password) {
  return unwrap(await rpc('cal_login', { p_username: username, p_password: password }));
}

export async function apiRegister(username, password) {
  return unwrap(await rpc('cal_register', { p_username: username, p_password: password }));
}

export async function apiMe(token) {
  return unwrap(await rpc('cal_me', { p_token: token }));
}

export async function apiChangePassword(token, oldPwd, newPwd) {
  return unwrap(await rpc('cal_change_password', { p_token: token, p_old: oldPwd, p_new: newPwd }));
}

export async function apiLogout(token) {
  try { await rpc('cal_logout', { p_token: token }); } catch (e) { /* 本地登出优先 */ }
}

/* ---------- 数据 ---------- */
export async function apiPull(token) {
  const r = unwrap(await rpc('cal_pull', { p_token: token }));
  return Array.isArray(r.rows) ? r.rows : [];
}

export async function apiPush(token, rows) {
  if (!rows || !rows.length) return { count: 0 };
  return unwrap(await rpc('cal_push', { p_token: token, p_rows: rows }));
}
