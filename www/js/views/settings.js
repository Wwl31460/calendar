/* ---------- 设置页 ---------- */
import { buildPeriodTimes, clearAll, db, exportAll, importAll, setSetting } from '../store.js';
import { ensurePermission, notify, permissionState } from '../reminder.js';
import { $, confirmSheet, h, icon, openSheet, segmented, toast } from '../ui.js';
import { openSemesterSheet } from './timetable.js';
import { setTheme, applyTheme } from '../theme.js';
import { downloadICS } from '../ics.js';
import { APP_VERSION, isNativeApp, lastCheckedAt, openCheckSheet, fmtDate } from '../updater.js';
import { esc, todayStr, weekdayCn } from '../utils.js';
import { periodTime } from '../schedule.js';
import { changePassword, isLoggedIn, logout, username } from '../account.js';
import { syncNow, syncSummary, subscribeSync } from '../sync.js';
import { openLogin } from '../login.js';

let syncBound = false;

function row(id, iconName, label, value, extra = '') {
  return `<div class="row" data-row="${id}">
    ${icon(iconName, 'ico')}
    <div class="grow">${label}</div>
    <span class="val">${esc(value)}</span>
    ${extra || icon('right', 'chev')}
  </div>`;
}

/** 图标上应该显示的日期，用来和桌面实际显示的对一下 */
function todayIconLabel() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayCn(todayStr())}`;
}

export function render() {
  const s = db.settings;
  const perm = permissionState();
  const permText = { granted: '已允许', denied: '已拒绝', unsupported: '不支持', default: '未开启' }[perm] || '未开启';
  const themeText = { auto: '跟随系统', light: '浅色', dark: '深色' }[s.theme || 'auto'];

  const logged = isLoggedIn();
  const uname = username();
  const accountCard = `
    <div class="list-card acct-card" data-row="account">
      <div class="row" style="padding:15px 16px">
        <div class="acct-avatar">${logged ? esc(uname.slice(0, 1)) : icon('settings', '')}</div>
        <div class="grow" style="margin-left:12px">
          <div class="acct-name">${logged ? esc(uname) : '登录账号'}</div>
          <div class="acct-sub">${logged ? esc(syncSummary()) : '登录后日志、提醒、课表会同步到云端'}</div>
        </div>
        ${icon('right', 'chev')}
      </div>
    </div>`;

  $('#settings-body').innerHTML = `
    ${accountCard}
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

    <div class="section-label">桌面</div>
    <div class="list-card">
      ${row('widget', 'grid', '桌面小组件', isNativeApp() ? '显示今日星期与日期' : '仅安卓版')}
      ${row('icon-sync', 'calendar', '桌面图标', isNativeApp() ? todayIconLabel() : '仅安卓版')}
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
        ${logged ? '已开启云端同步，换设备登录同一账号即可恢复。' : '数据保存在本机；登录账号后可在设备间同步。'}<br>
        农历支持 1900-2100 年，法定节假日内置 2024-2027 官方安排。
      </div></div>
    </div>
    <div style="height:20px"></div>`;

  bindRows();
}

function bindRows() {
  const body = $('#settings-body');

  if (!syncBound) {
    syncBound = true;
    subscribeSync(() => {
      const v = $('#view-settings');
      if (v && v.classList.contains('active')) render();
    });
  }

  body.querySelector('[data-row="account"]').addEventListener('click', () => {
    if (!isLoggedIn()) {
      openLogin({ onDone: () => render() });
      return;
    }
    openAccountSheet();
  });

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

  body.querySelector('[data-row="widget"]').addEventListener('click', () => {
    const wrap = h(`<div style="font-size:13.5px;line-height:1.9;color:var(--text-2)">
      <p style="margin:0 0 12px">桌面上有个和图标同款的 2×2 卡片，显示今天的<b>星期</b>、<b>日期</b>和<b>农历</b>，每天零点自动翻页。</p>
      <p style="margin:0 0 6px;font-weight:600;color:var(--text)">添加方法</p>
      <p style="margin:0 0 4px">1. 回到手机桌面，长按空白处</p>
      <p style="margin:0 0 4px">2. 选择「小组件 / 添加工具」</p>
      <p style="margin:0">3. 找到「日历」，拖到桌面即可</p>
    </div>`);
    openSheet({ title: '桌面小组件', body: wrap, actions: [{ text: '知道了', onClick: c => c() }] });
  });

  // 桌面图标：显示今天应为哪张，点一下让系统立即刷新
  body.querySelector('[data-row="icon-sync"]').addEventListener('click', async () => {
    const P = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdater) || null;
    if (!P) { toast('网页版没有桌面图标，装安卓版才能用'); return; }
    try {
      const r = await P.syncIcon();
      const label = (r && r.label) || todayIconLabel();
      toast(`已刷新为「${label}」`, 2600);
      openSheet({
        title: '桌面图标',
        body: `<div style="font-size:13.5px;line-height:1.85;color:var(--text-2)">
          <p style="margin:0 0 10px">图标上应该是：<b style="color:var(--text)">${esc(label)}</b></p>
          <p style="margin:0 0 6px;font-weight:600;color:var(--text)">如果桌面显示的日期不对</p>
          <p style="margin:0 0 4px">1. 长按桌面图标 → 移除</p>
          <p style="margin:0 0 4px">2. 从「应用列表」把它拖回桌面</p>
          <p style="margin:0">3. 还没变就重启一次手机（桌面会重新读取图标）</p>
        </div>`,
        actions: [{ text: '知道了', onClick: c => c() }]
      });
    } catch (e) {
      toast('刷新失败，请重启手机后再试');
    }
  });

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

function openAccountSheet() {
  const wrap = h(`<div>
    <div style="display:flex;align-items:center;gap:12px;padding:2px 0 16px">
      <div class="acct-avatar">${esc(username().slice(0, 1))}</div>
      <div style="min-width:0">
        <div class="acct-name" style="font-size:16px">${esc(username())}</div>
        <div class="acct-sub">${esc(syncSummary())}</div>
      </div>
    </div>
    <div class="list-card" style="box-shadow:none;background:var(--surface-2);margin-bottom:0">
      <div class="row" data-act="sync">${icon('repeat', 'ico')}<div class="grow">立即同步</div>${icon('right', 'chev')}</div>
      <div class="row" data-act="pwd">${icon('pen', 'ico')}<div class="grow">修改密码</div>${icon('right', 'chev')}</div>
      <div class="row" data-act="logout">${icon('trash', 'ico')}<div class="grow" style="color:var(--red)">退出登录</div></div>
    </div>
    <p class="hint" style="margin-top:12px">退出登录只清除本机的登录状态，数据仍保留在云端和本机。</p>
  </div>`);

  const sheet = openSheet({ title: '账号', body: wrap });

  wrap.querySelector('[data-act="sync"]').addEventListener('click', async () => {
    toast('正在同步…', 1200);
    try {
      const r = await syncNow('manual');
      toast(`同步完成 · 上传 ${r.pushed} 条／接收 ${r.pulled} 条`, 2800);
      render();
      sheet.close();
    } catch (e) {
      toast((e && e.message) || '同步失败，请检查网络');
    }
  });

  wrap.querySelector('[data-act="pwd"]').addEventListener('click', () => {
    sheet.close();
    openChangePasswordSheet();
  });

  wrap.querySelector('[data-act="logout"]').addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: '退出登录',
      message: '退出后本机数据仍然保留，重新登录可以继续同步。',
      okText: '退出',
      danger: true
    });
    if (!ok) return;
    sheet.close();
    await logout();
    render();
    toast('已退出登录');
  });
}

function openChangePasswordSheet() {
  const body = h(`<div>
    <div class="field"><label>原密码</label><input class="input" type="password" id="cp-old" autocomplete="current-password" /></div>
    <div class="field"><label>新密码</label><input class="input" type="password" id="cp-new" autocomplete="new-password" placeholder="至少 6 位" /></div>
    <div class="field"><label>确认新密码</label><input class="input" type="password" id="cp-new2" autocomplete="new-password" /></div>
    <p class="hint" id="cp-err"></p>
  </div>`);

  openSheet({
    title: '修改密码',
    body,
    actions: [
      { text: '取消', variant: 'secondary', onClick: c => c() },
      {
        text: '保存', onClick: async c => {
          const oldPwd = body.querySelector('#cp-old').value;
          const n1 = body.querySelector('#cp-new').value;
          const n2 = body.querySelector('#cp-new2').value;
          const err = body.querySelector('#cp-err');
          if (!oldPwd) { err.textContent = '请输入原密码'; return; }
          if (n1.length < 6) { err.textContent = '新密码至少 6 位'; return; }
          if (n1 !== n2) { err.textContent = '两次输入的新密码不一致'; return; }
          err.textContent = '';
          try {
            await changePassword(oldPwd, n1);
            c();
            toast('密码已修改');
          } catch (e) {
            err.textContent = (e && e.message) || '修改失败';
          }
        }
      }
    ]
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
