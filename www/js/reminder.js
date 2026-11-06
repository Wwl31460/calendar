/* ---------- 提醒调度引擎（含农历/公历每年重复、课程提醒） ---------- */
import { db, persist } from './store.js';
import { addDays, at, pad2, parseYmd, ymd } from './utils.js';
import { solar2lunar, lunar2solar } from './lunar.js';
import { coursesOnDate, weekOf } from './schedule.js';

const WINDOW_MS = 90 * 1000;        // 触发容差（容忍后台节流）
const CATCHUP_MS = 12 * 3600 * 1000; // 启动时补发窗口

/* ---------- 重复规则 ---------- */
export function repeatLabel(r) {
  switch (r.repeat) {
    case 'daily': return '每天';
    case 'yearly': {
      const d = parseYmd(r.date);
      return `每年 ${d.getMonth() + 1}月${d.getDate()}日`;
    }
    case 'lunar': {
      const m = r.lunar || {};
      return `每年农历${lunarMonthCn(m.m)}${lunarDayCn(m.d)}`;
    }
    default: return '仅一次';
  }
}

const LUNAR_M_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_D_CN = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
export const lunarMonthCn = m => (LUNAR_M_CN[(m || 1) - 1] || '正') + '月';
export const lunarDayCn = d => LUNAR_D_CN[(d || 1) - 1] || '初一';

/** 某天内该提醒的触发时刻，无则 null */
export function occurrenceOnDay(r, dateStr) {
  if (!r.enabled || !r.time) return null;
  const d = parseYmd(dateStr);
  if (r.repeat === 'none') return r.date === dateStr ? at(dateStr, r.time) : null;
  if (r.repeat === 'daily') return at(dateStr, r.time);
  if (r.repeat === 'yearly') {
    const sd = parseYmd(r.date);
    return sd.getMonth() === d.getMonth() && sd.getDate() === d.getDate() ? at(dateStr, r.time) : null;
  }
  if (r.repeat === 'lunar') {
    const lm = r.lunar;
    if (!lm) return null;
    const L = solar2lunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (!L) return null;
    return L.lMonth === lm.m && L.lDay === lm.d && !L.isLeap ? at(dateStr, r.time) : null;
  }
  return null;
}

/** 下一次触发时间（Date）或 null */
export function nextOccurrence(r, from = new Date()) {
  if (!r.enabled) return null;
  if (r.repeat === 'none') {
    const t = at(r.date, r.time);
    return t.getTime() >= from.getTime() ? t : null;
  }
  if (r.repeat === 'daily') {
    let t = at(ymd(from), r.time);
    if (t.getTime() < from.getTime()) t = at(ymd(addDays(from, 1)), r.time);
    return t;
  }
  if (r.repeat === 'yearly') {
    const sd = parseYmd(r.date);
    for (let i = 0; i < 8; i++) {
      const y = from.getFullYear() + i;
      const d = new Date(y, sd.getMonth(), sd.getDate());
      if (d.getMonth() !== sd.getMonth()) continue; // 2/29 等无效日期跳过
      const t = at(ymd(d), r.time);
      if (t.getTime() >= from.getTime()) return t;
    }
    return null;
  }
  if (r.repeat === 'lunar') {
    const lm = r.lunar;
    if (!lm) return null;
    const L = solar2lunar(from.getFullYear(), from.getMonth() + 1, from.getDate());
    if (!L) return null;
    for (let i = 0; i < 4; i++) {
      const s = lunar2solar(L.lYear + i, lm.m, lm.d, false);
      if (!s) continue;
      const t = at(`${s.y}-${pad2(s.m)}-${pad2(s.d)}`, r.time);
      if (t.getTime() >= from.getTime()) return t;
    }
    return null;
  }
  return null;
}

/** "3 小时后" 之类的相对描述 */
export function relativeTo(t, now = new Date()) {
  const diff = t.getTime() - now.getTime();
  const dayDiff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const hhmm = `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  if (dayDiff === 0) {
    const min = Math.round(diff / 60000);
    if (min <= 0) return `已到时间 · ${hhmm}`;
    if (min < 60) return `${min} 分钟后 · ${hhmm}`;
    return `今天 ${hhmm}`;
  }
  if (dayDiff === 1) return `明天 ${hhmm}`;
  if (dayDiff === 2) return `后天 ${hhmm}`;
  if (dayDiff < 7) return `${dayDiff} 天后 ${hhmm}`;
  const sameYear = t.getFullYear() === now.getFullYear();
  if (!sameYear) return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${hhmm}`;
  return `${t.getMonth() + 1}月${t.getDate()}日 ${hhmm}`;
}

/* ---------- 原生（Capacitor / APK）能力 ---------- */
export function nativePlugin() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  } catch (e) { return null; }
}

export const isNative = () => !!nativePlugin();

/** 当前权限状态（同步，供 UI 显示） */
export function permissionState() {
  if (nativePlugin()) return window.__nativePerm || 'default';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * 在原生环境下，把未来 40 天的提醒与上课提醒一次性排入系统任务队列，
 * 这样即使 App 被划掉，系统也能准时弹通知。
 */
export async function syncNativeSchedule() {
  const LN = nativePlugin();
  if (!LN) return false;
  try {
    const pending = await LN.getPending();
    const old = (pending && pending.notifications) || [];
    if (old.length) await LN.cancel({ notifications: old.map(n => ({ id: n.id })) });
  } catch (e) { /* ignore */ }

  const now = new Date();
  const list = [];
  for (let i = 0; i < 40; i++) {
    const day = addDays(now, i);
    const ds = ymd(day);
    for (const r of db.reminders) {
      if (!r.enabled) continue;
      const t = occurrenceOnDay(r, ds);
      if (t && t.getTime() > now.getTime() + 5000) {
        list.push({ title: r.title || '提醒', body: r.note || repeatLabel(r), at: t });
      }
    }
    if (db.settings.courseNotify && db.settings.semesterStart) {
      for (const c of coursesOnDate(day)) {
        if (!/^\d{2}:\d{2}$/.test(c.startTime)) continue;
        const start = at(ds, c.startTime);
        const remindAt = new Date(start.getTime() - (Number(db.settings.courseAhead) || 0) * 60000);
        if (remindAt.getTime() > now.getTime() + 5000) {
          list.push({
            title: `上课提醒 · ${c.name}`,
            body: `${c.startTime} 开始${c.room ? ' · ' + c.room : ''}`,
            at: remindAt
          });
        }
      }
    }
  }

  const notifications = list.slice(0, 400).map((n, i) => ({
    id: 1000 + i,
    title: n.title,
    body: n.body,
    schedule: { at: n.at, allowWhileIdle: true },
    channelId: 'reminders',
    autoCancel: true
  }));

  try {
    if (notifications.length) await LN.schedule({ notifications });
    return true;
  } catch (e) {
    console.warn('原生排程失败', e);
    return false;
  }
}

/* ---------- 通知 ---------- */
export async function ensurePermission() {
  const LN = nativePlugin();
  if (LN) {
    try {
      let p = await LN.checkPermissions();
      if (p.display !== 'granted') p = await LN.requestPermissions();
      window.__nativePerm = p.display === 'granted' ? 'granted' : 'denied';
      if (window.__nativePerm === 'granted') syncNativeSchedule();
      return window.__nativePerm;
    } catch (e) {
      return 'denied';
    }
  }
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const p = await Notification.requestPermission();
    return p;
  } catch (e) {
    return 'denied';
  }
}

export async function notify(title, body, tag) {
  // Capacitor 原生环境优先
  const LP = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  if (LP) {
    try {
      await LP.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 100000),
          title, body,
          schedule: { at: new Date(Date.now() + 600) }
        }]
      });
      return;
    } catch (e) { /* 回落到 Web 通知 */ }
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body,
    tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [220, 100, 220, 100, 220],
    requireInteraction: true,
    data: { url: location.href }
  };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
  } catch (e) { /* ignore */ }
  try { new Notification(title, opts); } catch (e) { /* ignore */ }
}

function beep() {
  if (document.hidden) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.22, 0.44].forEach((off, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.exponentialRampToValueAtTime(0.09, now + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(now + off); o.stop(now + off + 0.2);
    });
    setTimeout(() => ctx.close(), 900);
  } catch (e) { /* ignore */ }
}

function vibrateFire() {
  try { navigator.vibrate && navigator.vibrate([240, 110, 240, 110, 240]); } catch (e) { /* ignore */ }
}

/* ---------- 触发记录清理 ---------- */
function cleanupFired() {
  const keys = Object.keys(db.fired || {});
  const cutoff = Date.now() - 5 * 86400000;
  let changed = false;
  for (const k of keys) {
    if ((db.fired[k] || 0) < cutoff) { delete db.fired[k]; changed = true; }
  }
  if (keys.length > 400) {
    keys.sort((a, b) => db.fired[a] - db.fired[b]).slice(0, keys.length - 300).forEach(k => { delete db.fired[k]; changed = true; });
  }
  return changed;
}

async function fire(title, body, key, payload) {
  db.fired[key] = Date.now();
  persist();
  await notify(title, body, key);
  beep();
  vibrateFire();
  document.dispatchEvent(new CustomEvent('reminder-fired', { detail: payload }));
}

/* ---------- 主循环 ---------- */
let timer = null;
let started = false;

function checkOnce(catchUp = false) {
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(addDays(now, -1));
  let changed = false;

  for (const r of db.reminders) {
    if (!r.enabled) continue;
    for (const ds of [today, yesterday]) {
      const t = occurrenceOnDay(r, ds);
      if (!t) continue;
      const diff = now.getTime() - t.getTime();
      const key = `${r.id}@${ds}T${r.time}`;
      if (db.fired[key]) continue;
      if (diff >= 0 && diff < WINDOW_MS) {
        fire(r.title || '提醒', r.note || repeatLabel(r), key, { type: 'reminder', reminder: r, at: t });
        changed = true;
      } else if (catchUp && diff >= WINDOW_MS && diff < CATCHUP_MS) {
        db.fired[key] = Date.now();
        changed = true;
        missed.push({ reminder: r, at: t });
      }
    }
  }

  // 课程提醒
  if (db.settings.courseNotify && db.settings.semesterStart) {
    const list = coursesOnDate(now);
    for (const c of list) {
      const key = `course:${c.id}:${today}`;
      if (db.fired[key]) continue;
      const startTime = c.startTime;
      if (!/^\d{2}:\d{2}$/.test(startTime)) continue;
      const t = at(today, startTime);
      const remindAt = t.getTime() - (Number(db.settings.courseAhead) || 0) * 60000;
      const diff = now.getTime() - remindAt;
      if (diff >= 0 && diff < WINDOW_MS) {
        fire(
          `上课提醒 · ${c.name}`,
          `${c.startTime} 开始${c.room ? ' · ' + c.room : ''}${c.teacher ? ' · ' + c.teacher : ''}`,
          key,
          { type: 'course', course: c }
        );
        changed = true;
      }
    }
  }

  if (cleanupFired()) changed = true;
  if (changed) persist();
}

export const missed = [];

export function startEngine() {
  if (started) return;
  started = true;
  missed.length = 0;
  checkOnce(true);
  if (missed.length) {
    const names = missed.map(m => m.reminder.title).slice(0, 2).join('、');
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('reminder-missed', { detail: { count: missed.length, names } }));
    }, 1200);
  }
  timer = setInterval(() => checkOnce(false), 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOnce(true);
  });
  window.addEventListener('focus', () => checkOnce(false));
}

export function stopEngine() { clearInterval(timer); started = false; }

/** 未来 7 天内即将发生的提醒（用于列表排序） */
export function upcoming(limit = 100) {
  const now = new Date();
  return db.reminders
    .filter(r => r.enabled)
    .map(r => ({ r, next: nextOccurrence(r, now) }))
    .filter(x => x.next)
    .sort((a, b) => a.next - b.next)
    .slice(0, limit);
}

/** 当日提醒（日历日程面板用） */
export function remindersOn(dateStr) {
  return db.reminders
    .filter(r => r.enabled && occurrenceOnDay(r, dateStr))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export const _internal = { weekOf };
