/* ---------- 云端同步：按 updatedAt 做「后写覆盖」的双向合并 ---------- */
import { apiPull, apiPush, CloudError } from './cloud.js';
import { applyRemoteSettings, db, persist } from './store.js';
import { invalidate, isLoggedIn, token, username } from './account.js';

const KINDS = ['note', 'reminder', 'course'];
const LABEL = { note: '日志', reminder: '提醒', course: '课程' };

let running = null;
let timer = null;
let state = { status: 'idle', at: 0, error: '', pushed: 0, pulled: 0 };
const listeners = new Set();

export function subscribeSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function syncState() { return { ...state }; }
export function isSyncing() { return !!running; }

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
}

function listOf(kind) {
  if (kind === 'note') return db.notes;
  if (kind === 'reminder') return db.reminders;
  if (kind === 'course') return db.courses;
  return null;
}

function revOf(item) {
  return Number(item && (item.updatedAt || item.createdAt)) || 0;
}

/** 数据改完 2.5 秒后自动推一次，避免频繁请求 */
export function scheduleSync(delay = 2500) {
  if (!isLoggedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow('auto').catch(() => {}); }, delay);
}

/**
 * 双向同步。
 * 规则：同一条记录谁的 updatedAt 更新就用谁的；本地有云端没有的全部补传；
 * 本地删掉的（墓碑）也当作一次更新推上去，避免换设备后又「复活」。
 */
export function syncNow(reason = 'manual') {
  if (!isLoggedIn()) return Promise.resolve({ skipped: true });
  if (running) return running;

  running = (async () => {
    setState({ status: 'syncing', error: '' });
    try {
      const rows = await apiPull(token());
      const remote = new Map();
      for (const r of rows) {
        if (r && r.kind && r.recId) remote.set(`${r.kind}:${r.recId}`, r);
      }

      const push = [];
      let changed = false;

      /* 1. 云端比本地新的，落到本地 */
      for (const r of rows) {
        if (!r || !r.kind || !r.recId) continue;
        const key = `${r.kind}:${r.recId}`;
        const rRev = Number(r.rev) || 0;

        if (r.kind === 'setting') {
          if (rRev > (Number(db.settingsUpdatedAt) || 0)) {
            applyRemoteSettings(r.payload, rRev);
            changed = true;
          }
          continue;
        }

        const list = listOf(r.kind);
        if (!list) continue;

        const idx = list.findIndex(x => x && x.id === r.recId);
        const localRev = idx >= 0 ? revOf(list[idx]) : (Number(db.tombstones[key]) || 0);
        if (rRev <= localRev) continue;

        if (r.deleted) {
          if (idx >= 0) list.splice(idx, 1);
          db.tombstones[key] = rRev;
        } else {
          const obj = { ...(r.payload || {}), id: r.recId };
          if (idx >= 0) list[idx] = obj;
          else list.push(obj);
          delete db.tombstones[key];
        }
        changed = true;
      }

      /* 2. 本地比云端新的，收集待推送 */
      for (const kind of KINDS) {
        for (const item of listOf(kind)) {
          if (!item || !item.id) continue;
          const key = `${kind}:${item.id}`;
          const r = remote.get(key);
          const rev = revOf(item);
          if (!r || rev > (Number(r.rev) || 0)) {
            push.push({ kind, recId: item.id, payload: item, rev, deleted: false });
          }
        }
      }

      /* 3. 本地删掉的 */
      for (const [key, ts] of Object.entries(db.tombstones || {})) {
        const i = key.indexOf(':');
        if (i < 0) continue;
        const kind = key.slice(0, i);
        const recId = key.slice(i + 1);
        if (!KINDS.includes(kind) || !recId) continue;
        const r = remote.get(key);
        if (r && (Number(r.rev) || 0) >= ts) continue;
        push.push({ kind, recId, payload: {}, rev: Number(ts) || 0, deleted: true });
      }

      /* 4. 设置 */
      const sRemote = remote.get('setting:app');
      if (!sRemote && rows.length === 0) {
        // 首次建立基线：把本机现在这套设置一起传上去（老版本没有 settingsUpdatedAt）
        push.push({ kind: 'setting', recId: 'app', payload: db.settings, rev: Date.now(), deleted: false });
      } else if ((Number(db.settingsUpdatedAt) || 0) > (Number(sRemote && sRemote.rev) || 0)) {
        push.push({ kind: 'setting', recId: 'app', payload: db.settings, rev: db.settingsUpdatedAt, deleted: false });
      }

      if (push.length) await apiPush(token(), push);
      if (changed) persist();

      setState({ status: 'ok', at: Date.now(), pushed: push.length, pulled: rows.length, error: '' });
      return { pushed: push.length, pulled: rows.length, reason };
    } catch (e) {
      if (e instanceof CloudError && e.code === 'AUTH') {
        invalidate();
        setState({ status: 'error', error: '登录已过期，请重新登录' });
        throw e;
      }
      setState({ status: 'error', error: (e && e.message) || '同步失败' });
      throw e;
    } finally {
      running = null;
    }
  })();

  return running;
}

/** 设置页展示用的一句话 */
export function syncSummary() {
  if (!isLoggedIn()) return '未登录';
  if (state.status === 'syncing') return '正在同步…';
  if (state.status === 'error') return state.error || '同步失败';
  if (!state.at) return '已登录 · 等待同步';
  const d = new Date(state.at);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return `已同步 · ${sameDay ? '今天 ' + hm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm}`;
}

export function syncLabelOf(kind) { return LABEL[kind] || kind; }
export function accountName() { return username(); }

/* 调试/自动化用 */
window.__syncNow = reason => syncNow(reason || 'debug');
window.__syncState = syncState;
