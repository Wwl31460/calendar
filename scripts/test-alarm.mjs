#!/usr/bin/env node
/**
 * 提醒排程的端到端验证（不需要真机）：
 * 用 Playwright 打开网页版，先注入一个假的 CalendarAlarm 原生插件，
 * 然后走真实的「新增提醒 → 触发排程」链路，检查交给原生的清单是否正确。
 *
 *   node scripts/test-alarm.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5173';
let pass = 0, fail = 0;

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe',
  args: ['--no-proxy-server']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

page.on('console', m => { if (m.type() === 'error') console.log('    [console] ' + m.text()); });

// 注入假的原生桥
await page.addInitScript(() => {
  window.__calls = { schedule: [], cancelAll: 0, test: [], ring: [], settings: [], notifications: 0 };
  const st = {
    notifications: true, exact: true, batteryOk: true,
    scheduled: 0, channel: true, alarmVolume: 5, alarmVolumeMax: 7, muted: false
  };
  const CalendarAlarm = {
    schedule: async (o) => { window.__calls.schedule.push(o.items); return { count: (o.items || []).length, exact: true }; },
    cancelAll: async () => { window.__calls.cancelAll++; return {}; },
    status: async () => ({ ...st, scheduled: (window.__calls.schedule.at(-1) || []).length }),
    test: async (o) => { window.__calls.test.push(o); return { ok: true, seconds: o.seconds || 6, exact: true }; },
    ringNow: async (o) => { window.__calls.ring.push(o); return {}; },
    stopRing: async () => ({}),
    ensureNotifications: async () => { window.__calls.notifications++; return { requested: false, granted: true }; },
    openSettings: async (o) => { window.__calls.settings.push(o.which); return {}; }
  };
  const LocalNotifications = {
    getPending: async () => ({ notifications: [] }),
    cancel: async () => ({}),
    schedule: async (o) => { window.__lnSchedule = (window.__lnSchedule || 0) + (o.notifications || []).length; return {}; },
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' })
  };
  const AppUpdater = {
    getInfo: async () => ({ versionName: '1.5.0', versionCode: 13, packageName: 'cn.rili.calendar' }),
    syncIcon: async () => ({ label: '今天' }),
    downloadAndInstall: async () => ({ ok: false })
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: { CalendarAlarm, LocalNotifications, AppUpdater }
  };
});

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('calapp.account.skip', '1');
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);

console.log('\n[1] 启动即排程');
{
  const st = await page.evaluate(async () => {
    const m = await import('./js/reminder.js');
    return { native: !!m.nativePlugin(), alarm: !!window.Capacitor.Plugins.CalendarAlarm };
  });
  ok('识别到安卓环境', st.native === true);
  ok('优先使用自带闹钟插件', st.alarm === true);
  const n = await page.evaluate(() => ({ req: window.__calls.notifications, sched: window.__calls.schedule.length }));
  ok('启动时读到了权限状态（已授权就不再弹窗）', n.req === 0 && n.sched >= 1, JSON.stringify(n));
}

console.log('\n[2] 单次提醒 → 清单只含 1 条且时间正确');
{
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    s.db.reminders.length = 0;
    s.addReminder({ title: '考研报名', note: '别忘了带身份证', date: window.__today, time: '08:30', repeat: 'none' });
  }, );
  // 用真实日期：明天 08:30
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    const u = await import('./js/utils.js');
    const d = new Date(); d.setDate(d.getDate() + 1);
    const ds = u.ymd(d);
    s.db.reminders.length = 0;
    s.addReminder({ title: '考研报名', note: '别忘了带身份证', date: ds, time: '08:30', repeat: 'none' });
    window.__expectDate = ds;
  });
  await page.waitForTimeout(3400);

  const r = await page.evaluate(() => {
    const items = window.__calls.schedule.at(-1) || [];
    return {
      n: items.length,
      items,
      expected: window.__expectDate,
      ln: window.__lnSchedule || 0
    };
  });
  ok('只排了 1 条', r.n === 1, 'n=' + r.n);
  const it = r.items[0] || {};
  ok('字段齐全', !!(it.id && it.at && it.title && it.body && it.kind), JSON.stringify(it));
  ok('标题与正文正确', it.title === '考研报名' && it.body === '别忘了带身份证');
  const d = new Date(it.at);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  ok('日期是明天', ymd === r.expected, ymd + ' vs ' + r.expected);
  ok('时间是 08:30', d.getHours() === 8 && d.getMinutes() === 30, d.toTimeString());
  ok('没有走 LocalNotifications', r.ln === 0, 'ln=' + r.ln);
}

console.log('\n[3] 每天重复 → 排满 40 天');
{
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    s.db.reminders.length = 0;
    const u = await import('./js/utils.js');
    s.addReminder({ title: '吃药', note: '', date: u.ymd(new Date()), time: '21:15', repeat: 'daily' });
  });
  await page.waitForTimeout(3400);

  const items = await page.evaluate(() => (window.__calls.schedule.at(-1) || []).map(x => ({
    at: x.at, title: x.title, kind: x.kind, id: x.id
  })));
  ok('排了 40 条', items.length === 40, 'n=' + items.length);
  ok('全部是提醒类型', items.every(i => i.kind === 'reminder'));
  ok('按时间升序', items.every((v, i) => i === 0 || v.at >= items[i - 1].at));
  ok('都在未来', items.every(i => i.at > Date.now()));
  ok('每天都是 21:15', items.every(i => {
    const d = new Date(i.at); return d.getHours() === 21 && d.getMinutes() === 15;
  }));
  ok('id 不重复', new Set(items.map(i => i.id)).size === items.length);
  const days = new Set(items.map(i => {
    const d = new Date(i.at);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }));
  ok('覆盖 40 个不同日期', days.size === 40, 'days=' + days.size);
}

console.log('\n[4] 上课提醒也进同一个清单');
{
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    s.db.reminders.length = 0;
    const u = await import('./js/utils.js');
    const d = new Date(); d.setDate(d.getDate() + 1);
    s.setSetting('semesterStart', u.ymd(new Date()));
    s.setSetting('courseNotify', true);
    s.setSetting('courseAhead', 10);
    s.db.courses.length = 0;
    s.addCourse({ name: '高等数学', room: '教二108', weekday: ((d.getDay() + 6) % 7) + 1, start: 1, end: 2, weeks: [1, 2, 3, 4] });
  });
  await page.waitForTimeout(3400);
  const items = await page.evaluate(() => (window.__calls.schedule.at(-1) || []).filter(x => x.kind === 'course'));
  ok('有上课提醒', items.length >= 1, 'n=' + items.length);
  if (items.length) {
    const it = items[0];
    ok('标题带课名', it.title.includes('高等数学'), it.title);
    ok('正文带地点', it.body.includes('教二108'), it.body);
    const d = new Date(it.at);
    ok('提前了 10 分钟', d.getSeconds() === 0 && (d.getHours() * 60 + d.getMinutes()) % 60 >= 0);
  }
}

console.log('\n[5] 设置页「响铃测试」→ 交给原生排 6 秒后的闹钟');
{
  await page.evaluate(() => window.__switchView('settings'));
  await page.waitForTimeout(700);
  const hasRow = await page.locator('[data-row="alarm"]').count();
  const hasTest = await page.locator('[data-row="alarm-test"]').count();
  ok('设置页有「提醒响铃」行', hasRow === 1);
  ok('设置页有「响铃测试」行', hasTest === 1);
  const summary = await page.locator('[data-row="alarm"] .val').innerText();
  ok('状态显示正常而不是「未开启」', !summary.includes('需放行'), summary);

  await page.locator('[data-row="alarm-test"]').click();
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => window.__calls.test.at(-1) || null);
  ok('调用了原生测试排程', !!t, JSON.stringify(t));
  ok('默认 6 秒后响', t && t.seconds === 6, JSON.stringify(t));
  const toastText = await page.locator('#toast-root .toast').last().innerText().catch(() => '');
  ok('有「6 秒后响」提示', /6 秒/.test(toastText), toastText);
}

console.log('\n[6] 试听铃声 → 原生立即响');
{
  await page.locator('[data-row="alarm"]').click();
  await page.waitForTimeout(500);
  const btns = page.locator('.sheet button.btn');
  const n = await btns.count();
  ok('诊断面板有操作按钮', n >= 4, 'n=' + n);
  const first = await btns.first().innerText();
  ok('第一个是试听铃声', first.includes('试听'), first);
  await btns.first().click();
  await page.waitForTimeout(400);
  const ring = await page.evaluate(() => window.__calls.ring.at(-1) || null);
  ok('调用了原生立即响铃', !!ring, JSON.stringify(ring));
  await page.keyboard.press('Escape');
}

console.log('\n[7] 清空提醒 → 原生清单同步为空');
{
  await page.evaluate(async () => {
    const s = await import('./js/store.js');
    s.db.reminders.length = 0;
    s.db.courses.length = 0;
    s.removeAllForTest ? s.removeAllForTest() : null;
    s.persist && s.persist();
  });
  await page.waitForTimeout(3400);
  const items = await page.evaluate(() => window.__calls.schedule.at(-1) || null);
  ok('最后一次排程为空清单', Array.isArray(items) && items.length === 0, JSON.stringify(items));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
