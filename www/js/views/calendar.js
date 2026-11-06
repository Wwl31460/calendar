/* ---------- 日历视图 ---------- */
import { cellLabel, dayInfo, weekCn, xingzuo } from '../lunar.js';
import { db } from '../store.js';
import { addDays, esc, parseYmd, todayStr, ymd } from '../utils.js';
import { openCourseForm, openNoteEditor, openReminderForm } from '../forms.js';
import { remindersOn, repeatLabel } from '../reminder.js';
import { COURSE_COLORS, coursesOnDate, weekOf } from '../schedule.js';
import { $, emptyState, icon } from '../ui.js';

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selected = todayStr();

export function getSelected() { return selected; }

export function selectDate(ds, { navigate = true } = {}) {
  selected = ds;
  const d = parseYmd(ds);
  if (navigate && (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth)) {
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }
  render();
}

export function goToday() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  selected = todayStr();
  render('none');
}

function renderHeader() {
  $('#cal-ym').textContent = `${viewYear}年${viewMonth + 1}月`;
  const monthMid = new Date(viewYear, viewMonth, 15);
  const L = dayInfo(monthMid.getFullYear(), monthMid.getMonth() + 1, 15).lunar;
  $('#cal-lunar').textContent = L ? `${L.gzYear}${L.animal}年 · 农历${L.monthName}` : '';
}

function renderWeekbar() {
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  $('#weekbar').innerHTML = names.map((n, i) => `<span class="${i >= 5 ? 'we' : ''}">${n}</span>`).join('');
}

function renderGrid(dir = 'none') {
  const grid = $('#month-grid');
  const first = new Date(viewYear, viewMonth, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为第一天
  const start = addDays(first, -offset);
  const today = todayStr();
  const html = [];

  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const info = dayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const label = cellLabel(info);
    const other = d.getMonth() !== viewMonth;
    const cls = ['cell'];
    if (other) cls.push('other');
    if (ds === today && !other) cls.push('today');
    if (ds === selected) cls.push('sel');
    if (info.holiday && info.holiday.type === 'off') cls.push('off');
    if (info.festivals.length) cls.push('fest');
    else if (info.term) cls.push('term');

    const badge = info.holiday
      ? `<i class="tag ${info.holiday.type === 'off' ? 'off' : 'work'}">${info.holiday.type === 'off' ? '休' : '班'}</i>`
      : '';

    html.push(`<div class="${cls.join(' ')}" data-date="${ds}">
      ${badge}
      <div class="num">${d.getDate()}</div>
      <div class="lbl">${esc(label)}</div>
    </div>`);
  }

  grid.innerHTML = html.join('');
  if (dir !== 'none') {
    grid.classList.remove('anim');
    grid.style.setProperty('--dx', dir === 'next' ? '14px' : '-14px');
    void grid.offsetWidth;
    grid.classList.add('anim');
  }
}

function agendaHTML() {
  const ds = selected;
  const d = parseYmd(ds);
  const info = dayInfo(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const L = info.lunar;
  const rems = remindersOn(ds);
  const courses = coursesOnDate(d);
  const notes = db.notes.filter(n => n.date === ds).sort((a, b) => b.time.localeCompare(a.time));
  const isToday = ds === todayStr();

  const chips = [];
  const hd = info.holiday;
  if (hd && hd.type === 'off') chips.push(`<span class="chip red">休 · ${esc(hd.name)}</span>`);
  else if (hd && hd.type === 'work') chips.push('<span class="chip">调休上班</span>');
  info.festivals.forEach(f => {
    if (hd && hd.name && hd.name.includes(f)) return;
    chips.push(`<span class="chip red">${esc(f)}</span>`);
  });
  if (info.term) chips.push(`<span class="chip blue">${esc(info.term)}</span>`);
  const wk = weekOf(d);
  if (wk) chips.push(`<span class="chip green">第${wk}周</span>`);

  let sections = '';

  if (courses.length) {
    sections += `<div class="sec-title">${icon('grid')}课程</div>` + courses.map(c => `
      <div class="item" data-act="course" data-id="${c.id}">
        <span class="bar" style="background:${COURSE_COLORS[c.color || 0]}"></span>
        <div class="grow">
          <div class="t1">${esc(c.name)}</div>
          <div class="t2">${esc([c.room, c.teacher].filter(Boolean).join(' · ') || '—')}</div>
        </div>
        <div class="time" style="font-size:12px">${esc(c.startTime)}<br>${esc(c.endTime)}</div>
      </div>`).join('');
  }

  if (rems.length) {
    sections += `<div class="sec-title">${icon('bell')}提醒</div>` + rems.map(r => `
      <div class="item" data-act="reminder" data-id="${r.id}">
        <span class="bar ${r.repeat === 'none' ? '' : 'amber'}"></span>
        <div class="grow">
          <div class="t1">${esc(r.title)}</div>
          <div class="t2">${esc(repeatLabel(r))}${r.note ? ' · ' + esc(r.note) : ''}</div>
        </div>
        <div class="time">${esc(r.time)}</div>
      </div>`).join('');
  }

  if (notes.length) {
    sections += `<div class="sec-title">${icon('book2')}日志</div>` + notes.map(n => `
      <div class="item" data-act="note" data-id="${n.id}">
        <span class="bar green"></span>
        <div class="grow">
          <div class="t1" style="font-weight:400">${esc(n.text).slice(0, 60)}</div>
          <div class="t2">${esc(n.time)}</div>
        </div>
      </div>`).join('');
  }

  if (!sections) {
    sections = emptyState('🌿', isToday ? '今天还没有安排' : '这一天还没有安排');
  }

  return `
    <div class="ag-head">
      <div>
        <div class="ag-title">${d.getMonth() + 1}月${d.getDate()}日<span class="wk">${weekCn(d.getDay())}</span></div>
        <div class="ag-sub">${L ? `农历${L.monthName}${L.dayName} · ${L.gzYear}${L.animal}年` : ''} · ${xingzuo(d.getMonth() + 1, d.getDate())}</div>
      </div>
      <div class="ag-tags">${chips.slice(0, 3).join('')}</div>
    </div>
    <div class="quick-row">
      <button class="quick-btn" data-act="add-reminder">${icon('plus')}添加提醒</button>
      <button class="quick-btn" data-act="add-note">${icon('pen')}写日志</button>
    </div>
    ${sections}`;
}

export function render(dir = 'none') {
  renderHeader();
  renderWeekbar();
  renderGrid(dir);
  $('#agenda').innerHTML = agendaHTML();
  bindAgenda();
}

function bindAgenda() {
  const wrap = $('#agenda');
  wrap.onclick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === 'add-reminder') return openReminderForm({ date: selected });
    if (act === 'add-note') return openNoteEditor({ date: selected });
    if (act === 'reminder') return openReminderForm({ reminder: db.reminders.find(r => r.id === id), date: selected });
    if (act === 'note') return openNoteEditor({ note: db.notes.find(n => n.id === id), date: selected });
    if (act === 'course') return openCourseForm({ course: db.courses.find(c => c.id === id) });
  };
}

export function bind() {
  $('#cal-prev').addEventListener('click', () => changeMonth(-1));
  $('#cal-next').addEventListener('click', () => changeMonth(1));
  $('#cal-today').addEventListener('click', goToday);

  $('#month-grid').addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    selectDate(cell.dataset.date);
  });

  // 左右滑动换月
  const wrap = $('#month-wrap');
  let sx = 0, sy = 0, tracking = false;
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      changeMonth(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

function changeMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  render(delta > 0 ? 'next' : 'prev');
}
