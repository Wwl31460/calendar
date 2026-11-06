/* ---------- 导出 iCalendar (.ics) ---------- */
import { db } from './store.js';
import { addDays, pad2, ymd } from './utils.js';
import { occurrenceOnDay, repeatLabel } from './reminder.js';
import { coursesOnDate } from './schedule.js';
import { lunar2solar } from './lunar.js';

const escICS = s => String(s == null ? '' : s)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const stamp = (d) => {
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 19).replace(/[-:]/g, '') .replace('T', 'T'); // YYYYMMDDTHHMMSS
};

const stampUTC = (d) => new Date(d.getTime()).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

const localDT = (dateStr, timeStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = String(timeStr || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0);
};

function fold(line) {
  if (line.length <= 60) return line;
  const chars = Array.from(line);
  const out = [];
  for (let i = 0; i < chars.length; i += 60) {
    out.push((i === 0 ? '' : ' ') + chars.slice(i, i + 60).join(''));
  }
  return out.join('\r\n');
}

function event({ uid, start, end, summary, description, rrule }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}@calendar-app`,
    `DTSTAMP:${stampUTC(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escICS(summary)}`,
    `DESCRIPTION:${escICS(description || '')}`
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escICS(summary)}`,
    'END:VALARM',
    'END:VEVENT'
  );
  return lines.map(fold).join('\r\n');
}

/** 生成未来一段时间内的提醒 + 课程日历 */
export function buildICS() {
  const now = new Date();
  const parts = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//日历 App//CN//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:我的提醒与课表'
  ];

  db.reminders.forEach(r => {
    if (!r.enabled) return;
    const summary = r.title || '提醒';
    const desc = [repeatLabel(r), r.note].filter(Boolean).join(' · ');

    if (r.repeat === 'none' || r.repeat === 'daily' || r.repeat === 'yearly') {
      const start = localDT(r.date, r.time);
      if (r.repeat === 'none' && start < now) return;
      const end = new Date(start.getTime() + 5 * 60000);
      const rrule = r.repeat === 'daily' ? 'FREQ=DAILY' : r.repeat === 'yearly' ? 'FREQ=YEARLY' : '';
      parts.push(event({ uid: r.id, start, end, summary, description: desc, rrule }));
      return;
    }

    if (r.repeat === 'lunar' && r.lunar) {
      // 农历按未来 12 年逐个展开
      for (let i = 0; i < 12; i++) {
        const y = now.getFullYear() + i;
        const s = lunar2solar(y, r.lunar.m, r.lunar.d, false);
        if (!s) continue;
        const ds = `${s.y}-${pad2(s.m)}-${pad2(s.d)}`;
        const start = localDT(ds, r.time);
        if (start < now) continue;
        const end = new Date(start.getTime() + 5 * 60000);
        parts.push(event({
          uid: `${r.id}-${y}`, start, end, summary,
          description: desc
        }));
      }
    }
  });

  // 课程：未来 10 周
  if (db.settings.semesterStart) {
    for (let i = 0; i < 70; i++) {
      const day = addDays(now, i);
      const ds = ymd(day);
      for (const c of coursesOnDate(day)) {
        if (!/^\d{2}:\d{2}$/.test(c.startTime)) continue;
        const start = localDT(ds, c.startTime);
        const end = localDT(ds, c.endTime || c.startTime);
        if (end <= start) end.setTime(start.getTime() + 45 * 60000);
        parts.push(event({
          uid: `${c.id}-${ds}`,
          start, end,
          summary: c.name,
          description: [c.teacher, c.room].filter(Boolean).join(' · ')
        }));
      }
    }
  }

  parts.push('END:VCALENDAR');
  return parts.join('\r\n');
}

export function downloadICS() {
  const text = buildICS();
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `提醒日历-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
