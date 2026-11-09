/* ---------- 本地数据层（localStorage 单键存储 + 变更订阅） ---------- */
import { uid } from './utils.js';

const KEY = 'calapp.v2';

const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function seq(start, count, duration, gap) {
  const [h, m] = start.split(':').map(Number);
  let cur = h * 60 + m;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ start: hm(cur), end: hm(cur + duration) });
    cur += duration + gap;
  }
  return out;
}

/** 生成默认作息（上午 4 节 / 下午 4 节 / 晚上 4 节） */
export function buildPeriodTimes(opts = {}) {
  const { morning = '08:00', afternoon = '14:00', evening = '19:00', duration = 45, gap = 10, total = 12 } = opts;
  const blocks = [morning, afternoon, evening];
  const out = [];
  for (let b = 0; b < 3; b++) {
    const count = b < 2 ? 4 : Math.max(0, total - 8);
    out.push(...seq(blocks[b], count, duration, gap));
  }
  return out.slice(0, total);
}

export const DEFAULT_SETTINGS = {
  semesterStart: '',        // 学期第 1 周周一，'YYYY-MM-DD'
  totalWeeks: 20,           // 默认 20 周
  totalPeriods: 12,         // 每天节数
  periodTimes: buildPeriodTimes({ total: 12 }),
  courseNotify: true,       // 上课提醒开关
  courseAhead: 10,          // 提前 N 分钟
  weekStart: 1,             // 1 = 周一
  theme: 'auto',
  lunarFirst: false,        // 农历为主显示
  notifyEnabled: false
};

function defaults() {
  return {
    reminders: [],
    notes: [],
    courses: [],
    settings: { ...DEFAULT_SETTINGS },
    settingsUpdatedAt: 0,  // 用户改过设置的时刻（默认值不算，避免覆盖云端）
    tombstones: {},        // 已删除项：'kind:recId' -> 删除时刻，用于云端同步
    fired: {},   // 已触发的提醒 key
    meta: { createdAt: Date.now() }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    const d = defaults();
    return {
      ...d,
      ...data,
      settings: { ...d.settings, ...(data.settings || {}) },
      reminders: Array.isArray(data.reminders) ? data.reminders : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      courses: Array.isArray(data.courses) ? data.courses : [],
      settingsUpdatedAt: Number(data.settingsUpdatedAt) || 0,
      tombstones: data.tombstones && typeof data.tombstones === 'object' ? data.tombstones : {},
      fired: data.fired || {}
    };
  } catch (e) {
    console.warn('数据解析失败，使用空数据', e);
    return defaults();
  }
}

export const db = load();

const listeners = new Set();
let timer = null;

export function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.error('保存失败', e);
    }
  }, 60);
  listeners.forEach(fn => { try { fn(db); } catch (e) { console.error(e); } });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function saveNow() {
  clearTimeout(timer);
  localStorage.setItem(KEY, JSON.stringify(db));
}

/* ---------- 同步辅助 ---------- */
/** 记录删除时刻，供云端同步判断「是删了」而不是「还没上传」 */
function markDeleted(kind, id) {
  db.tombstones[`${kind}:${id}`] = Date.now();
}
export function clearTombstones() {
  db.tombstones = {};
  persist();
}
export function resetTombstones(obj) {
  db.tombstones = obj && typeof obj === 'object' ? obj : {};
}

/* ---------- 提醒 ---------- */
export function addReminder(data) {
  const now = Date.now();
  const r = {
    id: uid('r_'),
    title: '提醒',
    note: '',
    date: '',
    time: '09:00',
    repeat: 'none',           // none | daily | yearly | lunar
    lunar: null,              // { m, d, isLeap }
    enabled: true,
    color: 'blue',
    createdAt: now,
    updatedAt: now,
    ...data
  };
  delete db.tombstones[`reminder:${r.id}`];
  db.reminders.push(r);
  persist();
  return r;
}

export function updateReminder(id, patch) {
  const i = db.reminders.findIndex(r => r.id === id);
  if (i < 0) return;
  db.reminders[i] = { ...db.reminders[i], ...patch, updatedAt: Date.now() };
  persist();
}

export function removeReminder(id) {
  db.reminders = db.reminders.filter(r => r.id !== id);
  markDeleted('reminder', id);
  persist();
}

/* ---------- 日志 ---------- */
export function addNote({ date, time, title = '', text = '', images = [] }) {
  const now = new Date();
  const n = {
    id: uid('n_'),
    date,
    time,
    title,
    text,
    images,
    createdAt: now.getTime(),
    updatedAt: now.getTime()
  };
  db.notes.push(n);
  delete db.tombstones[`note:${n.id}`];
  persist();
  return n;
}

/** 列表里展示的标题：没有标题时退回正文首行 */
export function noteTitle(n) {
  const t = (n && n.title ? String(n.title) : '').trim();
  if (t) return t;
  const first = (n && n.text ? String(n.text) : '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
  return first ? first.slice(0, 40) : '无标题';
}

export function updateNote(id, patch) {
  const i = db.notes.findIndex(n => n.id === id);
  if (i < 0) return;
  db.notes[i] = { ...db.notes[i], ...patch, updatedAt: Date.now() };
  persist();
}

export function removeNote(id) {
  db.notes = db.notes.filter(n => n.id !== id);
  markDeleted('note', id);
  persist();
}

/* ---------- 课程 ---------- */
export function addCourse(data) {
  const now = Date.now();
  const c = {
    id: uid('c_'),
    name: '',
    teacher: '',
    room: '',
    className: '',
    weekday: 1,     // 1..7
    start: 1,       // 起始节
    end: 2,         // 结束节
    weeks: [],      // [1,2,3...]
    color: 0,
    createdAt: now,
    updatedAt: now,
    ...data
  };
  delete db.tombstones[`course:${c.id}`];
  db.courses.push(c);
  persist();
  return c;
}

export function updateCourse(id, patch) {
  const i = db.courses.findIndex(c => c.id === id);
  if (i < 0) return;
  db.courses[i] = { ...db.courses[i], ...patch, updatedAt: Date.now() };
  persist();
}

export function removeCourse(id) {
  db.courses = db.courses.filter(c => c.id !== id);
  markDeleted('course', id);
  persist();
}

/* ---------- 设置 ---------- */
export function setSetting(key, value) {
  db.settings[key] = value;
  db.settingsUpdatedAt = Date.now();
  persist();
}

/** 云端拉下来的设置：不发时间戳，避免回写成「本地刚改过」 */
export function applyRemoteSettings(settings, rev) {
  db.settings = { ...db.settings, ...(settings || {}) };
  db.settingsUpdatedAt = Number(rev) || 0;
}

export function exportAll() {
  return JSON.stringify({ ...db, exportedAt: new Date().toISOString(), app: 'calendar-app', version: 2 }, null, 2);
}

export function importAll(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
  const d = defaults();
  db.reminders = Array.isArray(data.reminders) ? data.reminders : [];
  db.notes = Array.isArray(data.notes) ? data.notes : [];
  db.courses = Array.isArray(data.courses) ? data.courses : [];
  db.settings = { ...d.settings, ...(data.settings || {}) };
  db.fired = data.fired || {};
  // 恢复的是整份快照：清空墓碑，并让本地设置成为最新
  db.tombstones = data.tombstones && typeof data.tombstones === 'object' ? data.tombstones : {};
  db.settingsUpdatedAt = Date.now();
  persist();
}

export function clearAll() {
  // 已登录时云端也要一起清掉，否则下次同步会把数据拉回来
  for (const n of db.notes) markDeleted('note', n.id);
  for (const r of db.reminders) markDeleted('reminder', r.id);
  for (const c of db.courses) markDeleted('course', c.id);
  db.reminders = [];
  db.notes = [];
  db.courses = [];
  db.settings = { ...DEFAULT_SETTINGS };
  db.settingsUpdatedAt = Date.now();
  db.fired = {};
  persist();
}
