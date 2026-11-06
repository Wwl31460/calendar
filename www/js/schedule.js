/* ---------- 学期 / 课表时间计算 ---------- */
import { db } from './store.js';
import { addDays, daysBetween, parseYmd, startOfWeek, ymd } from './utils.js';

export const COURSE_COLORS = [
  '#5B7CFA', '#25B37F', '#F08A3C', '#EC5A72',
  '#8A6CF5', '#23A6C4', '#D6A218', '#8292A8'
];

export const WEEK_LABEL = ['一', '二', '三', '四', '五', '六', '日'];

/** 学期第 1 周的周一 */
export function semesterMonday() {
  const s = db.settings.semesterStart;
  if (!s) return null;
  const d = parseYmd(s);
  return startOfWeek(d, 1);
}

/** 推测学期开始（秋季 9 月初 / 春季 2 月下旬，取当周周一） */
export function guessSemesterStart(now = new Date()) {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const base = m >= 8 ? new Date(y, 8, 1) : new Date(y, 1, 20);
  return startOfWeek(base, 1);
}

/** 指定日期属于第几周（1 起），超出返回 null */
export function weekOf(date) {
  const mon = semesterMonday();
  if (!mon) return null;
  const week = Math.floor(daysBetween(mon, date) / 7) + 1;
  if (week < 1) return null;
  if (week > db.settings.totalWeeks) return null;
  return week;
}

export function currentWeek() {
  const w = weekOf(new Date());
  return w || 1;
}

/** 第 week 周的 7 天日期数组（周一 → 周日） */
export function weekDates(week) {
  const mon = semesterMonday();
  if (!mon) return [];
  const base = addDays(mon, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(base, i));
}

export function formatRange(dates) {
  if (!dates.length) return '';
  const a = dates[0], b = dates[6];
  return `${a.getMonth() + 1}月${a.getDate()}日 - ${b.getMonth() + 1}月${b.getDate()}日`;
}

/** 星期几（周一=1 … 周日=7） */
export function weekdayIndex(date) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function periodTime(i) {
  const t = db.settings.periodTimes[i];
  return t || { start: '--:--', end: '--:--' };
}

/** 某天的课程（含时间），按开始节次排序 */
export function coursesOnDate(date) {
  const week = weekOf(date);
  if (!week) return [];
  const wd = weekdayIndex(date);
  return db.courses
    .filter(c => c.weekday === wd && (!c.weeks || !c.weeks.length || c.weeks.includes(week)))
    .sort((a, b) => a.start - b.start)
    .map(c => ({
      ...c,
      week,
      startTime: periodTime(c.start - 1).start,
      endTime: periodTime(c.end - 1).end
    }));
}

/** 周次描述：1-16周 / 1-16周(单) */
export function weeksLabel(weeks) {
  if (!weeks || !weeks.length) return '每周';
  const sorted = [...weeks].sort((a, b) => a - b);
  const ranges = [];
  let s = sorted[0], p = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === p + 1) { p = sorted[i]; continue; }
    ranges.push([s, p]); s = sorted[i]; p = sorted[i];
  }
  ranges.push([s, p]);
  const odd = sorted.every(w => w % 2 === 1);
  const even = sorted.every(w => w % 2 === 0);
  if (sorted.length > 2 && (odd || even)) {
    let stepOk = true;
    for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 2) stepOk = false;
    if (stepOk) return `${sorted[0]}-${sorted[sorted.length - 1]}周(${odd ? '单' : '双'})`;
  }
  const txt = ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
  if (sorted.length > 2 && odd) return `${txt}周(单)`;
  if (sorted.length > 2 && even) return `${txt}周(双)`;
  return `${txt}周`;
}

/** 解析 "1-16周(单)" / "3-5,7-9周" / "1-16单周" → 周次数组 */
export function parseWeeks(text, maxWeek = 30) {
  const s = String(text || '').replace(/\s|周/g, '');
  if (!s) return [];
  const isOdd = /单/.test(s);
  const isEven = /双/.test(s);
  const out = new Set();
  const clean = s.replace(/[()（）单双]/g, '');
  clean.split(/[,，、]/).forEach(seg => {
    const m = seg.match(/^(\d{1,2})(?:[-~—–](\d{1,2}))?$/);
    if (!m) return;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.max(1, Math.min(a, b)); i <= Math.min(maxWeek, Math.max(a, b)); i++) out.add(i);
  });
  let arr = [...out].sort((a, b) => a - b);
  if (isOdd) arr = arr.filter(w => w % 2 === 1);
  if (isEven) arr = arr.filter(w => w % 2 === 0);
  return arr;
}
