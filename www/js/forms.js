/* ---------- 业务表单：提醒 / 日志 / 课程 ---------- */
import {
  addCourse, addNote, addReminder, db, persist, removeCourse, removeNote,
  removeReminder, updateCourse, updateNote, updateReminder
} from './store.js';
import { confirmSheet, h, openSheet, segmented, toast } from './ui.js';
import { solar2lunar, lunar2solar } from './lunar.js';
import { lunarDayCn, lunarMonthCn } from './reminder.js';
import { COURSE_COLORS, parseWeeks, weeksLabel } from './schedule.js';
import { esc, pad2, todayStr, ymd, parseYmd } from './utils.js';

const LUNAR_MONTHS = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, t: lunarMonthCn(i + 1) }));
const LUNAR_DAYS = Array.from({ length: 30 }, (_, i) => ({ v: i + 1, t: lunarDayCn(i + 1) }));

const opts = (list, value) => list.map(o => `<option value="${o.v}" ${String(o.v) === String(value) ? 'selected' : ''}>${esc(o.t)}</option>`).join('');

/* ==================== 提醒 ==================== */
export function openReminderForm({ reminder = null, date = todayStr() } = {}) {
  const isEdit = !!reminder;
  const r = reminder || {
    title: '', note: '', date, time: '09:00', repeat: 'none', lunar: null, enabled: true
  };
  const baseDate = parseYmd(r.date || todayStr());
  const lunarBase = solar2lunar(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate());
  const lm = (r.lunar && r.lunar.m) || (lunarBase && lunarBase.lMonth) || 1;
  const ld = (r.lunar && r.lunar.d) || (lunarBase && lunarBase.lDay) || 1;
  let repeat = r.repeat || 'none';

  const body = h(`
    <div>
      <div class="field">
        <label>提醒内容</label>
        <input class="input" id="f-title" maxlength="40" placeholder="例如：开会、吃药、家人生日" value="${esc(r.title)}" />
      </div>
      <div class="row2">
        <div class="field"><label>日期</label><input class="input" type="date" id="f-date" value="${esc(r.date)}" /></div>
        <div class="field"><label>时间</label><input class="input" type="time" id="f-time" value="${esc(r.time)}" /></div>
      </div>
      <div class="field"><label>重复</label><div id="f-seg"></div></div>
      <div id="f-lunar" style="display:none">
        <div class="row2">
          <div class="field"><label>农历月份</label><select class="input" id="f-lm">${opts(LUNAR_MONTHS, lm)}</select></div>
          <div class="field"><label>农历日期</label><select class="input" id="f-ld">${opts(LUNAR_DAYS, ld)}</select></div>
        </div>
        <p class="hint" style="margin-top:-6px">适合农历生日、祭日等，每年按农历日期重复（闰月不重复）。</p>
      </div>
      <div class="field" style="margin-top:13px">
        <label>备注（可选）</label>
        <textarea class="input" id="f-note" maxlength="200" placeholder="补充说明">${esc(r.note)}</textarea>
      </div>
      ${isEdit ? '<button class="btn danger sm" id="f-del" style="width:100%;margin-top:2px">删除此提醒</button>' : ''}
    </div>`);

  const segSlot = body.querySelector('#f-seg');
  const lunarSlot = body.querySelector('#f-lunar');
  segSlot.appendChild(segmented([
    { label: '不重复', value: 'none' },
    { label: '每天', value: 'daily' },
    { label: '每年', value: 'yearly' },
    { label: '农历年', value: 'lunar' }
  ], repeat, v => {
    repeat = v;
    lunarSlot.style.display = v === 'lunar' ? '' : 'none';
  }));
  lunarSlot.style.display = repeat === 'lunar' ? '' : 'none';

  const sheet = openSheet({
    title: isEdit ? '编辑提醒' : '新建提醒',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: close => {
          const title = body.querySelector('#f-title').value.trim() || '提醒';
          const date = body.querySelector('#f-date').value;
          const time = body.querySelector('#f-time').value || '09:00';
          const note = body.querySelector('#f-note').value.trim();
          if (!date) { toast('请选择日期'); return; }
          let lunar = null;
          if (repeat === 'lunar') {
            const m = Number(body.querySelector('#f-lm').value);
            const d = Number(body.querySelector('#f-ld').value);
            lunar = { m, d };
            const check = lunar2solar(new Date().getFullYear(), m, d, false);
            if (!check) { toast('该农历日期今年不存在，请调整'); return; }
          }
          const data = { title, date, time, note, repeat, lunar, enabled: true };
          if (isEdit) updateReminder(r.id, data);
          else addReminder(data);
          close();
          toast(isEdit ? '提醒已更新' : '提醒已创建');
        }
      }
    ]
  });

  if (isEdit) {
    body.querySelector('#f-del').addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '删除提醒', message: `确定删除「${r.title}」吗？`, okText: '删除', danger: true });
      if (!ok) return;
      removeReminder(r.id);
      sheet.close();
      toast('已删除');
    });
  }
  setTimeout(() => body.querySelector('#f-title').focus({ preventScroll: true }), 260);
  return sheet;
}

/* ==================== 日志 ==================== */
export function openNoteEditor({ note = null, date = todayStr() } = {}) {
  const isEdit = !!note;
  const now = new Date();
  const n = note || { date, time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`, text: '' };

  const body = h(`
    <div>
      <div class="row2">
        <div class="field"><label>日期</label><input class="input" type="date" id="n-date" value="${esc(n.date)}" /></div>
        <div class="field"><label>时间</label><input class="input" type="time" id="n-time" value="${esc(n.time)}" /></div>
      </div>
      <div class="field">
        <label>内容</label>
        <textarea class="input" id="n-text" style="min-height:150px" maxlength="5000" placeholder="记点什么…">${esc(n.text)}</textarea>
      </div>
      ${isEdit ? '<button class="btn danger sm" id="n-del" style="width:100%">删除这条日志</button>' : ''}
    </div>`);

  const sheet = openSheet({
    title: isEdit ? '编辑日志' : '写日志',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: close => {
          const text = body.querySelector('#n-text').value.trim();
          const date = body.querySelector('#n-date').value;
          const time = body.querySelector('#n-time').value || '00:00';
          if (!text) { toast('内容不能为空'); return; }
          if (!date) { toast('请选择日期'); return; }
          if (isEdit) updateNote(note.id, { text, date, time });
          else addNote({ text, date, time });
          close();
          toast('已保存');
        }
      }
    ]
  });

  if (isEdit) {
    body.querySelector('#n-del').addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '删除日志', message: '删除后不可恢复，确定吗？', okText: '删除', danger: true });
      if (!ok) return;
      removeNote(note.id);
      sheet.close();
      toast('已删除');
    });
  }
  setTimeout(() => body.querySelector('#n-text').focus({ preventScroll: true }), 260);
  return sheet;
}

/* ==================== 课程 ==================== */
export function openCourseForm({ course = null, weekday = 1 } = {}) {
  const isEdit = !!course;
  const total = db.settings.totalPeriods || 12;
  const c = course || {
    name: '', teacher: '', room: '', weekday, start: 1, end: 2, weeks: [], color: 0
  };
  let color = c.color || 0;
  let weeks = (c.weeks && c.weeks.length) ? [...c.weeks] : Array.from({ length: db.settings.totalWeeks || 20 }, (_, i) => i + 1);

  const periodOpts = Array.from({ length: total }, (_, i) => ({ v: i + 1, t: `第 ${i + 1} 节` }));

  const body = h(`
    <div>
      <div class="field">
        <label>课程名称</label>
        <input class="input" id="c-name" maxlength="30" placeholder="例如：高等数学" value="${esc(c.name)}" />
      </div>
      <div class="row2">
        <div class="field"><label>任课教师</label><input class="input" id="c-teacher" maxlength="20" placeholder="选填" value="${esc(c.teacher || '')}" /></div>
        <div class="field"><label>上课地点</label><input class="input" id="c-room" maxlength="24" placeholder="选填" value="${esc(c.room || '')}" /></div>
      </div>
      <div class="field"><label>星期</label><div id="c-weekday"></div></div>
      <div class="row2">
        <div class="field"><label>开始节次</label><select class="input" id="c-start">${opts(periodOpts, c.start)}</select></div>
        <div class="field"><label>结束节次</label><select class="input" id="c-end">${opts(periodOpts, c.end)}</select></div>
      </div>
      <div class="field">
        <label>上课周次</label>
        <input class="input" id="c-weeks" placeholder="例如 1-16 或 1-16单" value="${weeksLabel(weeks).replace('周', '')}" />
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button type="button" class="week-chip" data-w="1-16">1-16周</button>
          <button type="button" class="week-chip" data-w="1-8">1-8周</button>
          <button type="button" class="week-chip" data-w="1-16单">单周</button>
          <button type="button" class="week-chip" data-w="1-16双">双周</button>
        </div>
      </div>
      <div class="field"><label>颜色</label><div id="c-colors" style="display:flex;gap:9px;flex-wrap:wrap"></div></div>
      ${isEdit ? '<button class="btn danger sm" id="c-del" style="width:100%">删除课程</button>' : ''}
    </div>`);

  body.querySelector('#c-weekday').appendChild(segmented(
    ['一', '二', '三', '四', '五', '六', '日'].map((l, i) => ({ label: l, value: String(i + 1) })),
    String(c.weekday),
    () => {}
  ));
  let wd = c.weekday;

  const colorWrap = body.querySelector('#c-colors');
  COURSE_COLORS.forEach((col, i) => {
    const dot = h(`<button type="button" style="width:26px;height:26px;border-radius:9px;border:2px solid ${i === color ? 'var(--text)' : 'transparent'};background:${col}"></button>`);
    dot.addEventListener('click', () => {
      color = i;
      Array.from(colorWrap.children).forEach((el, idx) => {
        el.style.borderColor = idx === i ? 'var(--text)' : 'transparent';
      });
    });
    colorWrap.appendChild(dot);
  });

  body.querySelectorAll('.week-chip').forEach(b => {
    b.addEventListener('click', () => { body.querySelector('#c-weeks').value = b.dataset.w; });
  });

  const sheet = openSheet({
    title: isEdit ? '编辑课程' : '添加课程',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c2 => c2() },
      {
        text: '保存', onClick: close => {
          const name = body.querySelector('#c-name').value.trim();
          if (!name) { toast('请填写课程名称'); return; }
          const start = Number(body.querySelector('#c-start').value);
          const end = Number(body.querySelector('#c-end').value);
          if (end < start) { toast('结束节次不能早于开始节次'); return; }
          const weeksArr = parseWeeks(body.querySelector('#c-weeks').value, db.settings.totalWeeks || 20);
          const wdBtn = body.querySelector('#c-weekday .seg button.active');
          wd = Number(wdBtn ? wdBtn.dataset.v : wd);
          const data = {
            name,
            teacher: body.querySelector('#c-teacher').value.trim(),
            room: body.querySelector('#c-room').value.trim(),
            weekday: wd, start, end,
            weeks: weeksArr.length ? weeksArr : weeks,
            color
          };
          if (isEdit) updateCourse(c.id, data);
          else addCourse(data);
          close();
          toast(isEdit ? '课程已更新' : '课程已添加');
        }
      }
    ]
  });

  if (isEdit) {
    body.querySelector('#c-del').addEventListener('click', async () => {
      const ok = await confirmSheet({ title: '删除课程', message: `确定删除「${c.name}」吗？`, okText: '删除', danger: true });
      if (!ok) return;
      removeCourse(c.id);
      sheet.close();
      toast('已删除');
    });
  }
  return sheet;
}

/* ==================== 快速选择日期（提醒列表用） ==================== */
export function pickDate(current, onPick) {
  const body = h(`<div><input class="input" type="date" id="p-date" value="${esc(current || todayStr())}" /></div>`);
  const sheet = openSheet({
    title: '选择日期',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      { text: '确定', onClick: c => { onPick(body.querySelector('#p-date').value); c(); } }
    ]
  });
  return sheet;
}
