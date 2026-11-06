/* ---------- 设置页 ---------- */
import { buildPeriodTimes, clearAll, db, exportAll, importAll, setSetting } from '../store.js';
import { ensurePermission, notify, permissionState } from '../reminder.js';
import { $, confirmSheet, h, icon, openSheet, segmented, toast } from '../ui.js';
import { openSemesterSheet } from './timetable.js';
import { setTheme, applyTheme } from '../theme.js';
import { downloadICS } from '../ics.js';
import { APP_VERSION, isNativeApp, lastCheckedAt, openCheckSheet, fmtDate } from '../updater.js';
import { esc } from '../utils.js';
import { periodTime } from '../schedule.js';

function row(id, iconName, label, value, extra = '') {
  return `<div class="row" data-row="${id}">
    ${icon(iconName, 'ico')}
    <div class="grow">${label}</div>
    <span class="val">${esc(value)}</span>
    ${extra || icon('right', 'chev')}
  </div>`;
}

export function render() {
  const s = db.settings;
  const perm = permissionState();
  const permText = { granted: '已允许', denied: '已拒绝', unsupported: '不支持', default: '未开启' }[perm] || '未开启';
  const themeText = { auto: '跟随系统', light: '浅色', dark: '深色' }[s.theme || 'auto'];

  $('#settings-body').innerHTML = `
    <div class="section-label">提醒</div>
    <div class="list-card">
      ${row('perm', 'bell', '通知权限', permText)}
      ${row('test', 'info', '发送一条测试通知', '')}
      ${row('course-notify', 'clock', '上课提醒', s.courseNotify ? `提前 ${s.courseAhead} 分钟` : '已关闭')}
      ${row('ics', 'calendar', '导出到系统日历', '.ics')}
    </div>

    <div class="section-label">课表</div>
    <div class="list-card">
      ${row('semester', 'calendar', '学期开始日期', s.semesterStart || '未设置')}
      ${row('weeks', 'grid', '学期总周数', `${s.totalWeeks || 20} 周`)}
      ${row('periods', 'clock', '每日节次与作息', `${s.totalPeriods || 12} 节 · ${periodTime(0).start} 开始`)}
    </div>

    <div class="section-label">外观</div>
    <div class="list-card">
      ${row('theme', 'sun', '主题模式', themeText)}
    </div>

    <div class="section-label">数据</div>
    <div class="list-card">
      ${row('export', 'download', '导出备份', 'JSON')}
      ${row('import', 'upload', '从备份恢复', '')}
      ${row('clear', 'trash', '清空所有数据', '')}
    </div>

    <div class="section-label">关于</div>
    <div class="list-card">
      ${row('update', 'download', '检查更新', lastCheckedAt() ? fmtDate(new Date(lastCheckedAt()).toISOString()) + ' 已检查' : 'v' + APP_VERSION)}
      <div class="row"><div class="grow" style="font-size:13px;color:var(--text-2);line-height:1.65">
        日历 · ${isNativeApp() ? '安卓版' : '网页版'} v${esc(APP_VERSION)}<br>
        数据全部保存在本机，不上传云端。<br>
        农历支持 1900-2100 年，法定节假日内置 2025-2026 官方安排。
      </div></div>
    </div>
    <div style="height:20px"></div>`;

  bindRows();
}

function bindRows() {
  const body = $('#settings-body');

  body.querySelector('[data-row="perm"]').addEventListener('click', async () => {
    const res = await ensurePermission();
    if (res === 'granted') { toast('通知权限已开启'); render(); }
    else if (res === 'denied') toast('已被拒绝，请到系统设置中允许通知');
    else if (res === 'unsupported') toast('当前环境不支持通知');
    else toast('未获得权限');
  });

  body.querySelector('[data-row="test"]').addEventListener('click', async () => {
    await notify('测试提醒', '通知正常工作，到点会像这样提醒你 🎉', 'test-' + Date.now());
    toast('已发送测试通知');
  });

  body.querySelector('[data-row="course-notify"]').addEventListener('click', openCourseNotifySheet);
  body.querySelector('[data-row="ics"]').addEventListener('click', () => {
    downloadICS();
    toast('已导出，导入手机日历后可获得系统级闹钟提醒', 3200);
  });
  body.querySelector('[data-row="semester"]').addEventListener('click', () => { openSemesterSheet(); });
  body.querySelector('[data-row="weeks"]').addEventListener('click', () => { openSemesterSheet(); });
  body.querySelector('[data-row="update"]').addEventListener('click', openCheckSheet);
  body.querySelector('[data-row="periods"]').addEventListener('click', openPeriodSheet);

  body.querySelector('[data-row="theme"]').addEventListener('click', () => {
    const wrap = h('<div></div>');
    wrap.appendChild(segmented([
      { label: '跟随系统', value: 'auto' },
      { label: '浅色', value: 'light' },
      { label: '深色', value: 'dark' }
    ], db.settings.theme || 'auto', v => { setTheme(v); }));
    openSheet({ title: '主题模式', body: wrap, actions: [{ text: '完成', onClick: c => { c(); render(); } }] });
  });

  body.querySelector('[data-row="export"]').addEventListener('click', () => {
    const data = exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `日历备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('备份已导出');
  });

  body.querySelector('[data-row="import"]').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        importAll(text);
        applyTheme();
        render();
        toast('数据已恢复');
      } catch (e) {
        toast('恢复失败：文件格式不正确');
      }
    };
    input.click();
  });

  body.querySelector('[data-row="clear"]').addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '清空所有数据',
      message: '将删除全部提醒、日志与课程，且无法恢复。建议先导出备份。',
      okText: '确认清空',
      danger: true
    });
    if (!ok) return;
    clearAll();
    applyTheme();
    render();
    toast('已清空');
  });
}

function openCourseNotifySheet() {
  const s = db.settings;
  let enabled = !!s.courseNotify;
  let ahead = Number(s.courseAhead) || 10;

  const body = h(`<div>
    <div class="row" style="padding:0 0 14px;border:0">
      <div class="grow">上课提醒</div>
      <label class="switch"><input type="checkbox" id="cn-on" ${enabled ? 'checked' : ''}/><i></i></label>
    </div>
    <div class="field" id="cn-ahead-wrap">
      <label>提前多久提醒</label>
      <div id="cn-ahead"></div>
    </div>
    <p class="hint">按课表与作息时间自动推算每节课的开始时刻，到点弹出通知。</p>
  </div>`);

  const aheadSlot = body.querySelector('#cn-ahead');
  const drawAhead = () => {
    aheadSlot.innerHTML = '';
    aheadSlot.appendChild(segmented([
      { label: '5 分钟', value: '5' },
      { label: '10 分钟', value: '10' },
      { label: '20 分钟', value: '20' },
      { label: '30 分钟', value: '30' }
    ], String(ahead), v => { ahead = Number(v); }));
  };
  drawAhead();

  body.querySelector('#cn-on').addEventListener('change', e => {
    enabled = e.target.checked;
    body.querySelector('#cn-ahead-wrap').style.opacity = enabled ? '1' : '.45';
  });
  body.querySelector('#cn-ahead-wrap').style.opacity = enabled ? '1' : '.45';

  openSheet({
    title: '上课提醒',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: c => {
          setSetting('courseNotify', enabled);
          setSetting('courseAhead', ahead);
          c();
          render();
          toast('已保存');
        }
      }
    ]
  });
}

function openPeriodSheet() {
  const s = db.settings;
  const times = s.periodTimes || buildPeriodTimes({ total: 12 });
  const get = i => (times[i] ? times[i].start : '08:00');
  let total = s.totalPeriods || 12;

  const body = h(`<div>
    <div class="row2">
      <div class="field"><label>上午第一节</label><input class="input" type="time" id="pt-m" value="${esc(get(0))}" /></div>
      <div class="field"><label>下午第一节</label><input class="input" type="time" id="pt-a" value="${esc(get(4))}" /></div>
    </div>
    <div class="row2">
      <div class="field"><label>晚上第一节</label><input class="input" type="time" id="pt-e" value="${esc(get(8))}" /></div>
      <div class="field"><label>每天节数</label><input class="input" type="number" id="pt-n" min="4" max="16" value="${total}" /></div>
    </div>
    <div class="row2">
      <div class="field"><label>每节时长（分钟）</label><input class="input" type="number" id="pt-d" min="30" max="120" value="45" /></div>
      <div class="field"><label>课间（分钟）</label><input class="input" type="number" id="pt-g" min="0" max="60" value="10" /></div>
    </div>
    <p class="hint">修改后所有课程时间与上课提醒都会按新作息计算。</p>
  </div>`);

  openSheet({
    title: '作息时间',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: c => {
          const n = Math.min(16, Math.max(4, Number(body.querySelector('#pt-n').value) || 12));
          const arr = buildPeriodTimes({
            morning: body.querySelector('#pt-m').value || '08:00',
            afternoon: body.querySelector('#pt-a').value || '14:00',
            evening: body.querySelector('#pt-e').value || '19:00',
            duration: Number(body.querySelector('#pt-d').value) || 45,
            gap: Number(body.querySelector('#pt-g').value) || 10,
            total: n
          });
          setSetting('totalPeriods', n);
          setSetting('periodTimes', arr);
          c();
          render();
          toast('作息已更新');
        }
      }
    ]
  });
}
