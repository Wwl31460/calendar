/* ---------- 日志视图 ---------- */
import { db } from '../store.js';
import { daysBetween, esc, parseYmd, todayStr, weekdayCn } from '../utils.js';
import { $, emptyState, icon } from '../ui.js';
import { openNoteEditor } from '../forms.js';
import { solar2lunar } from '../lunar.js';

let query = '';
let searchOpen = false;

function noteHTML(n) {
  const d = parseYmd(n.date);
  const L = solar2lunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `
    <div class="note" data-id="${n.id}">
      <div class="nt">${esc(n.text)}</div>
      <div class="nf">
        <span>${esc(n.time)}${L ? ' · 农历' + L.monthName + L.dayName : ''}</span>
        ${n.updatedAt && n.updatedAt - n.createdAt > 60000 ? '<span>已编辑</span>' : ''}
      </div>
    </div>`;
}

function groupHTML(notes) {
  const map = new Map();
  notes.forEach(n => {
    if (!map.has(n.date)) map.set(n.date, []);
    map.get(n.date).push(n);
  });
  const dates = [...map.keys()].sort((a, b) => b.localeCompare(a));
  const today = parseYmd(todayStr());
  return dates.map(date => {
    const list = map.get(date).sort((a, b) => b.time.localeCompare(a.time));
    const d = parseYmd(date);
    const diff = daysBetween(today, d);
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    let title = md, sub = `${weekdayCn(date)}`;
    if (diff === 0) { title = '今天'; sub = `${md} · ${weekdayCn(date)}`; }
    else if (diff === -1) { title = '昨天'; sub = `${md} · ${weekdayCn(date)}`; }
    else if (diff === -2) { title = '前天'; sub = `${md} · ${weekdayCn(date)}`; }
    else sub = `${weekdayCn(date)} · ${-diff} 天前`;
    return `
      <div class="date-group">
        <div class="dg-head">
          <b>${esc(title)}</b>
          <span>${esc(sub)}</span>
        </div>
        ${list.map(noteHTML).join('')}
      </div>`;
  }).join('');
}

export function render() {
  const all = [...db.notes];
  $('#notes-sub').textContent = all.length ? `共 ${all.length} 条记录` : '还没有记录';

  let list = all;
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = all.filter(n => (n.text || '').toLowerCase().includes(q) || (n.date || '').includes(q));
  }

  const box = $('#notes-list');
  if (!list.length) {
    box.innerHTML = query.trim()
      ? emptyState('🔍', '没有找到相关日志')
      : emptyState('📖', '还没有日志，点击右上角 + 记录此刻');
    return;
  }
  box.innerHTML = groupHTML(list);

  box.querySelectorAll('.note').forEach(el => {
    el.addEventListener('click', () => {
      const note = db.notes.find(n => n.id === el.dataset.id);
      if (note) openNoteEditor({ note });
    });
  });
}

export function bind() {
  $('#notes-add').addEventListener('click', () => openNoteEditor({ date: todayStr() }));

  const tools = $('#notes-tools');
  const input = $('#notes-search');

  $('#notes-search-btn').addEventListener('click', () => {
    searchOpen = !searchOpen;
    tools.hidden = !searchOpen;
    if (searchOpen) setTimeout(() => input.focus(), 60);
    else { query = ''; input.value = ''; render(); }
  });

  $('#notes-search-close').addEventListener('click', () => {
    searchOpen = false;
    tools.hidden = true;
    query = '';
    input.value = '';
    render();
  });

  input.addEventListener('input', e => {
    query = e.target.value;
    render();
  });
}
