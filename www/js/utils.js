/* ---------- 通用工具 ---------- */
export const pad2 = n => (n < 10 ? '0' + n : '' + n);

export const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr() { return ymd(new Date()); }

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

export function daysBetween(a, b) {
  const A = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const B = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
}

/** 周一为一周开始 */
export function startOfWeek(date, weekStart = 1) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const wd = d.getDay();
  const diff = (wd - weekStart + 7) % 7;
  return addDays(d, -diff);
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

export const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/** 今天 / 明天 / 昨天 / 10月3日 */
export function friendlyDate(dateStr) {
  const t = parseYmd(todayStr());
  const d = parseYmd(dateStr);
  const diff = daysBetween(t, d);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff === 2) return '后天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayCn(dateStr) { return '周' + WEEK_NAMES[parseYmd(dateStr).getDay()]; }

/** "2026-11-06" + "08:30" -> Date */
export function at(dateStr, timeStr) {
  const d = parseYmd(dateStr);
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** 分钟数 -> "1小时30分钟后" */
export function humanDelta(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return '即将';
  if (min < 60) return `${min} 分钟后`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h} 小时 ${m} 分钟后` : `${h} 小时后`;
  return `${Math.floor(h / 24)} 天后`;
}

export function vibrate(pattern = [180, 90, 180]) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}
