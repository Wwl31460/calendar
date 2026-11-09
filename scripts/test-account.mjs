import { chromium } from 'playwright';

const EXE = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';
const URL = 'http://localhost:5173/index.html';
const errors = [];
let pass = 0, fail = 0;

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

const dump = (page, key) => page.evaluate(k => {
  const raw = localStorage.getItem('calapp.v2');
  return raw ? JSON.parse(raw)[k] : null;
}, key);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });

async function newDevice(tag) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(tag + ' ' + m.text()); });
  page.on('pageerror', e => errors.push(tag + ' pageerror ' + e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return page;
}

async function signIn(page, user = '吴文林', pass = '123456') {
  await page.evaluate(() => localStorage.removeItem('calapp.account.skip'));
  if (await page.locator('#auth-screen').isHidden()) {
    await page.evaluate(async () => { const l = await import('./js/login.js'); l.openLogin(); });
    await page.waitForTimeout(400);
  }
  await page.fill('#auth-user', user);
  await page.fill('#auth-pass', pass);
  await page.click('#auth-submit');
  await page.waitForTimeout(4200);
}

/* ================= 设备 A：建数据 + 上传 ================= */
console.log('\n[设备 A] 登录 / 新建日志·提醒·课程 / 上传');
const A = await newDevice('[A]');

ok('启动弹出登录页', await A.locator('#auth-screen').isVisible());
ok('SDK 已加载', await A.evaluate(() => !!window.WorkBuddyCloud));

await A.click('#auth-hint');
ok('一键填入初始账号', (await A.inputValue('#auth-user')) === '吴文林');
await A.click('#auth-submit');
await A.waitForTimeout(4200);
ok('登录成功（登录页关闭）', !(await A.locator('#auth-screen').isVisible()));

const acct = await A.evaluate(() => JSON.parse(localStorage.getItem('calapp.account.v1') || 'null'));
ok('本地保存了登录票据', !!(acct && acct.token));
ok('用户名正确', acct && acct.username === '吴文林');

// 日志
await A.evaluate(() => window.__switchView('notes'));
await A.waitForTimeout(300);
await A.click('#notes-add');
await A.waitForTimeout(500);
await A.fill('#n-title', '同步测试日志');
await A.fill('#n-text', '换设备后应该还能看到这条。');
await A.click('.sheet-actions .btn:last-child');
await A.waitForTimeout(700);

// 提醒
await A.evaluate(() => window.__switchView('reminders'));
await A.waitForTimeout(300);
await A.click('#rem-add');
await A.waitForTimeout(500);
await A.fill('#f-title', '同步测试提醒');
await A.click('.sheet-actions .btn:last-child');
await A.waitForTimeout(700);

// 课程（没有学期日期时新增入口会先要求设学期，这里直接建一条，同步链路一致）
await A.evaluate(async () => {
  const s = await import('./js/store.js');
  s.addCourse({ name: '同步测试课', room: '教A305', weekday: 2, start: 1, end: 2, weeks: [1, 2, 3] });
});
await A.waitForTimeout(600);

// 记下本次新建三条记录的 id，后面按 id 精确断言，避免历史数据干扰
const ids = await A.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('calapp.v2'));
  const note = [...d.notes].reverse().find(n => n.title === '同步测试日志');
  const rem = [...d.reminders].reverse().find(r => r.title === '同步测试提醒');
  const course = [...d.courses].reverse().find(c => c.name === '同步测试课');
  return { note: note && note.id, rem: rem && rem.id, course: course && course.id };
});
ok('三条记录都已建好', !!(ids.note && ids.rem && ids.course), JSON.stringify(ids));

await A.evaluate(async () => { await window.__syncNow(); });
await A.waitForTimeout(1200);
const st = await A.evaluate(() => window.__syncState());
ok('同步成功', st.status === 'ok', JSON.stringify(st));

/* ================= 设备 B：新设备恢复 ================= */
console.log('\n[设备 B] 新设备登录后恢复三类数据');
const B = await newDevice('[B]');
await B.evaluate(() => localStorage.clear());
await B.reload({ waitUntil: 'load' });
await B.waitForTimeout(800);

ok('新设备也弹登录页', await B.locator('#auth-screen').isVisible());
await signIn(B);

ok('恢复了日志', (await dump(B, 'notes')).some(n => n.id === ids.note));
ok('恢复了提醒', (await dump(B, 'reminders')).some(r => r.id === ids.rem));
ok('恢复了课表', (await dump(B, 'courses')).some(c => c.id === ids.course));

/* ================= 删除同步 ================= */
console.log('\n[设备 B] 删除日志 → 设备 A 同步后也应消失');
await B.evaluate(async id => {
  const s = await import('./js/store.js');
  s.removeNote(id);
}, ids.note);
await B.waitForTimeout(500);
ok('设备 B 已删除', !(await dump(B, 'notes')).some(n => n.id === ids.note));
ok('设备 B 留下删除标记', Object.keys(await dump(B, 'tombstones') || {}).includes('note:' + ids.note));

await B.evaluate(async () => { await window.__syncNow(); });
await B.waitForTimeout(1000);
await A.evaluate(async () => { await window.__syncNow(); });
await A.waitForTimeout(1500);

ok('设备 A 同步后日志也消失', !(await dump(A, 'notes')).some(n => n.id === ids.note),
  JSON.stringify((await dump(A, 'notes')).map(n => n.title)));
ok('设备 A 的提醒还在', (await dump(A, 'reminders')).some(r => r.id === ids.rem));
ok('设备 A 的课表还在', (await dump(A, 'courses')).some(c => c.id === ids.course));

/* ================= 设置同步 ================= */
console.log('\n[设置] 改设置 → 另一台设备跟随');
await B.evaluate(async () => {
  const s = await import('./js/store.js');
  s.setSetting('totalWeeks', 18);
});
await B.waitForTimeout(300);
await B.evaluate(async () => { await window.__syncNow(); });
await B.waitForTimeout(900);
await A.evaluate(async () => { await window.__syncNow(); });
await A.waitForTimeout(1200);
const weeks = (await dump(A, 'settings')).totalWeeks;
ok('设备 A 收到总周数 18', weeks === 18, 'weeks=' + weeks);

/* ================= 错误路径 ================= */
console.log('\n[错误路径]');
const badPass = await B.evaluate(async () => {
  const a = await import('./js/account.js');
  try { await a.login('吴文林', '000000'); return 'no-error'; } catch (e) { return e.message; }
});
ok('错误密码提示', /密码不正确/.test(badPass), badPass);

const noUser = await B.evaluate(async () => {
  const a = await import('./js/account.js');
  try { await a.login('查无此人', '123456'); return 'no-error'; } catch (e) { return e.message; }
});
ok('不存在账号提示', /账号不存在/.test(noUser), noUser);

const dupReg = await B.evaluate(async () => {
  const a = await import('./js/account.js');
  try { await a.register('吴文林', '123456'); return 'no-error'; } catch (e) { return e.message; }
});
ok('重复注册提示', /已经被注册/.test(dupReg), dupReg);

const shortReg = await B.evaluate(async () => {
  const a = await import('./js/account.js');
  try { await a.register('临时账号xyz', '123'); return 'no-error'; } catch (e) { return e.message; }
});
ok('密码太短提示', /至少 6 位/.test(shortReg), shortReg);

console.log('\n控制台错误：' + (errors.length ? JSON.stringify(errors, null, 1) : '无'));
ok('控制台无报错', errors.length === 0);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);
