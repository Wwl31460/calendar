/* ---------- 课表视图 ---------- */
import { addCourse, db, persist, removeCourse, setSetting } from '../store.js';
import { COURSE_COLORS, currentWeek, formatRange, guessSemesterStart, periodTime, weekDates, weeksLabel } from '../schedule.js';
import { $, confirmSheet, emptyState, h, icon, openSheet, toast } from '../ui.js';
import { openCourseForm } from '../forms.js';
import { parseLooseText, parsePdfFile } from '../pdf-parse.js';
import { esc, startOfWeek, todayStr, ymd } from '../utils.js';

let viewWeek = null;
const WD = ['一', '二', '三', '四', '五', '六', '日'];

function ensureWeek() {
  const total = db.settings.totalWeeks || 20;
  if (!viewWeek) viewWeek = currentWeek();
  viewWeek = Math.min(total, Math.max(1, viewWeek));
  return viewWeek;
}

function setupEmpty() {
  return `<div class="tt-empty">
    ${emptyState('📚', '还没有课表。设置学期开始日期后即可按周排布课程')}
    <div style="display:flex;gap:10px;padding:0 16px;max-width:340px;margin:0 auto">
      <button class="btn secondary" id="tt-empty-import">导入 PDF</button>
      <button class="btn" id="tt-empty-sem">设置学期</button>
    </div>
  </div>`;
}

export function render() {
  const total = db.settings.totalWeeks || 20;
  const week = ensureWeek();
  const dates = weekDates(week);
  const wrap = $('#tt-wrap');

  if (!db.settings.semesterStart) {
    $('#tt-week').textContent = '课表';
    $('#tt-range').textContent = '未设置学期';
    $('#tt-legend').innerHTML = '';
    wrap.innerHTML = setupEmpty();
    $('#tt-empty-import').addEventListener('click', openImportSheet);
    $('#tt-empty-sem').addEventListener('click', openSemesterSheet);
    return;
  }

  if (!wrap.querySelector('#tt-grid')) wrap.innerHTML = '<div class="tt-grid" id="tt-grid"></div>';
  const g = wrap.querySelector('#tt-grid');
  g.style.display = '';

  $('#tt-week').textContent = `第${week}周`;
  $('#tt-range').textContent = `${formatRange(dates)}${week === currentWeek() ? ' · 本周' : ''}`;

  const totalPeriods = db.settings.totalPeriods || 12;
  const maxUsed = db.courses.length ? Math.max(...db.courses.map(c => c.end || 1)) : totalPeriods;
  const rowsToShow = Math.min(totalPeriods, Math.max(9, maxUsed));
  const today = todayStr();
  const active = db.courses.filter(c => !c.weeks || !c.weeks.length || c.weeks.includes(week));
  const occupied = new Set(active.map(c => `${c.weekday}|${c.start}|${c.end}`));

  let html = '<div class="tt-head" style="grid-column:1;grid-row:1"></div>';
  dates.forEach((d, i) => {
    const isToday = ymd(d) === today;
    html += `<div class="tt-head ${isToday ? 'today' : ''}" style="grid-column:${i + 2};grid-row:1">
      <b>${WD[i]}</b><span>${d.getMonth() + 1}/${d.getDate()}</span></div>`;
  });

  for (let p = 1; p <= rowsToShow; p++) {
    const t = periodTime(p - 1);
    html += `<div class="tt-time" style="grid-column:1;grid-row:${p + 1}"><b>${p}</b><span>${esc(t.start)}</span></div>`;
  }

  // 空档（可点击添加）
  for (let wd = 1; wd <= 7; wd++) {
    for (let p = 1; p <= rowsToShow; p++) {
      const covered = active.some(c => c.weekday === wd && p >= c.start && p <= c.end);
      if (covered) continue;
      html += `<div class="course empty-slot" data-wd="${wd}" data-p="${p}" style="grid-column:${wd + 1};grid-row:${p + 1}"></div>`;
    }
  }

  active.forEach(c => {
    const span = Math.max(1, c.end - c.start + 1);
    html += `<div class="course" data-id="${c.id}" style="--c:${COURSE_COLORS[c.color || 0]};grid-column:${c.weekday + 1};grid-row:${c.start + 1} / span ${span}">
      <b>${esc(c.name)}</b>
      ${c.room ? `<span>${esc(c.room)}</span>` : ''}
    </div>`;
  });

  g.innerHTML = html;

  g.querySelectorAll('.course[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const c = db.courses.find(x => x.id === el.dataset.id);
      if (c) openCourseForm({ course: c });
    });
  });
  g.querySelectorAll('.empty-slot').forEach(el => {
    el.addEventListener('click', () => openCourseForm({ weekday: Number(el.dataset.wd) }));
  });

  // 本周概览
  const names = new Set(active.map(c => c.name));
  $('#tt-legend').innerHTML = active.length
    ? `<div class="tt-sum">本周 ${active.length} 节课 · ${names.size} 门课程${week === currentWeek() ? ' · 点击课程可编辑' : ''}</div>`
    : `<div class="tt-sum">本周没有课程安排</div>`;
}

/* ---------------- 学期设置 ---------------- */
export function openSemesterSheet() {
  const cur = db.settings.semesterStart || ymd(guessSemesterStart());
  const body = h(`<div>
    <div class="field">
      <label>学期开始日期（第 1 周的周一）</label>
      <input class="input" type="date" id="s-start" value="${esc(cur)}" />
    </div>
    <div class="field">
      <label>学期总周数</label>
      <input class="input" type="number" id="s-weeks" min="1" max="30" value="${db.settings.totalWeeks || 20}" />
    </div>
    <p class="hint">导入课表时按此日期推算每周日期，可在设置中修改每日节次时间。</p>
  </div>`);
  openSheet({
    title: '学期设置',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: c => {
          const start = body.querySelector('#s-start').value;
          const weeks = Number(body.querySelector('#s-weeks').value) || 20;
          if (!start) { toast('请选择开始日期'); return; }
          setSetting('semesterStart', ymd(startOfWeek(new Date(start.replace(/-/g, '/')), 1)));
          setSetting('totalWeeks', Math.min(30, Math.max(1, weeks)));
          viewWeek = currentWeek();
          c();
          render();
          toast('学期设置已保存');
        }
      }
    ]
  });
}

/* ---------------- 导入 ---------------- */
export function openImportSheet() {
  const body = h(`<div>
    <p class="hint" style="margin-top:0">支持教务系统导出的 PDF 课表，自动识别星期、节次和周次；也可直接粘贴文字。</p>
    <button class="btn" id="pick-pdf" style="width:100%;margin-top:14px">${icon('file')}&nbsp;选择 PDF 文件</button>
    <button class="btn secondary" id="paste-text" style="width:100%;margin-top:10px">${icon('pen')}&nbsp;粘贴文字课表</button>
    <input type="file" accept="application/pdf,.pdf,application/octet-stream" id="pdf-input" hidden />
    <p class="hint" style="margin-top:14px">识别效果取决于 PDF 是否为文字版（图片扫描件无法识别）。导入后可随时点课程块修改。</p>
  </div>`);

  const sheet = openSheet({ title: '导入课表', body });

  body.querySelector('#pick-pdf').addEventListener('click', () => body.querySelector('#pdf-input').click());

  body.querySelector('#pdf-input').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    toast('正在解析 PDF…', 2500);
    try {
      const result = await parsePdfFile(file);
      sheet.close();
      if (!result.courses || !result.courses.length) {
        openTextFallback('未能从 PDF 中识别出课程结构，可改用粘贴文字导入。');
      } else {
        openPreview(result.courses, result.mode);
      }
    } catch (err) {
      console.error(err);
      toast('解析失败：' + (err.message || '文件无法读取'));
    }
  });

  body.querySelector('#paste-text').addEventListener('click', () => {
    sheet.close();
    openTextFallback();
  });
}

function openTextFallback(tip = '') {
  const body = h(`<div>
    ${tip ? `<div class="banner warn">${icon('warn')}<div>${esc(tip)}</div></div>` : ''}
    <p class="hint" style="margin-top:0">每行一门课，格式示例：<br>
      <code style="font-size:11.5px;color:var(--text-2)">高等数学 周一 1-2节 1-16周 A305</code><br>
      也支持直接粘贴从 PDF 复制的课表文字。</p>
    <textarea class="input" id="t-text" style="min-height:150px;margin-top:10px" placeholder="高等数学 周一 1-2节 1-16周 A305&#10;大学英语 周三 3-4节 1-16周 B201"></textarea>
  </div>`);
  const sheet = openSheet({
    title: '粘贴文字课表',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '解析', onClick: c => {
          const txt = body.querySelector('#t-text').value.trim();
          if (!txt) { toast('请先粘贴内容'); return; }
          const courses = parseLooseText(txt);
          if (!courses.length) { toast('没有识别到课程，请检查格式（需包含"周一"等字样）'); return; }
          c();
          openPreview(courses, 'text');
        }
      }
    ]
  });
  return sheet;
}

function openPreview(courses, mode) {
  let list = courses.map(c => ({ ...c, on: true }));
  const defaultStart = db.settings.semesterStart || ymd(guessSemesterStart());

  const body = h(`<div>
    <div class="banner">${icon('check')}<div>识别到 <b>${list.length}</b> 门课程安排${mode === 'text' ? '（文字模式）' : '（表格模式）'}，请核对后导入。</div></div>
    <div class="row2">
      <div class="field"><label>学期开始（第1周周一）</label><input class="input" type="date" id="p-start" value="${esc(defaultStart)}" /></div>
      <div class="field"><label>总周数</label><input class="input" type="number" id="p-weeks" min="1" max="30" value="${db.settings.totalWeeks || 20}" /></div>
    </div>
    <div style="max-height:38dvh;overflow:auto;padding-right:2px" id="p-list"></div>
  </div>`);

  const listEl = body.querySelector('#p-list');
  const draw = () => {
    listEl.innerHTML = list.map((c, i) => `
      <div class="parse-item" style="${c.on ? '' : 'opacity:.4'}">
        <label class="switch"><input type="checkbox" data-i="${i}" ${c.on ? 'checked' : ''}/><i></i></label>
        <div class="pi-main">
          <div class="pi-name">${esc(c.name)}</div>
          <div class="pi-meta">${esc('周' + WD[c.weekday - 1])} 第 ${c.start}-${c.end} 节 · ${esc(weeksLabel(c.weeks))}${c.room ? ' · ' + esc(c.room) : ''}${c.teacher ? ' · ' + esc(c.teacher) : ''}</div>
        </div>
      </div>`).join('');
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        list[Number(cb.dataset.i)].on = cb.checked;
        draw();
      });
    });
  };
  draw();

  openSheet({
    title: '确认导入',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '导入课表', onClick: async c => {
          const chosen = list.filter(x => x.on);
          if (!chosen.length) { toast('请至少选择一门课程'); return; }
          if (db.courses.length) {
            const ok = await confirmSheet({
              title: '替换现有课表',
              message: `当前已有 ${db.courses.length} 条课程安排，导入会替换它们，是否继续？`,
              okText: '替换导入'
            });
            if (!ok) return;
            db.courses = [];
          }
          const start = body.querySelector('#p-start').value;
          const weeks = Number(body.querySelector('#p-weeks').value) || 20;
          if (start) setSetting('semesterStart', ymd(startOfWeek(new Date(start.replace(/-/g, '/')), 1)));
          setSetting('totalWeeks', Math.min(30, Math.max(1, weeks)));

          chosen.forEach((c, i) => {
            addCourse({
              name: c.name,
              teacher: c.teacher || '',
              room: c.room || '',
              weekday: c.weekday,
              start: c.start,
              end: c.end,
              weeks: c.weeks && c.weeks.length ? c.weeks : Array.from({ length: weeks }, (_, k) => k + 1),
              color: i % COURSE_COLORS.length
            });
          });
          persist();
          viewWeek = currentWeek();
          c();
          render();
          toast(`已导入 ${chosen.length} 门课程`);
        }
      }
    ]
  });
}

/* ---------------- 绑定 ---------------- */
export function bind() {
  $('#tt-prev').addEventListener('click', () => {
    ensureWeek();
    if (viewWeek <= 1) { toast('已经是第 1 周'); return; }
    viewWeek -= 1;
    render();
  });
  $('#tt-next').addEventListener('click', () => {
    ensureWeek();
    if (viewWeek >= (db.settings.totalWeeks || 20)) { toast('已经是最后一周'); return; }
    viewWeek += 1;
    render();
  });
  $('#tt-week').addEventListener('click', () => {
    viewWeek = currentWeek();
    render();
    toast('已回到本周');
  });
  $('#tt-week').style.cursor = 'pointer';

  $('#tt-import').addEventListener('click', openImportSheet);
  $('#tt-add').addEventListener('click', () => {
    if (!db.settings.semesterStart) { openSemesterSheet(); return; }
    openCourseForm({ weekday: 1 });
  });
}
