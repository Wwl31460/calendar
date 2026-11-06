import { chromium } from 'playwright';

const EXE = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  permissions: ['notifications']
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1) 注入一条 25 秒后触发的提醒
const target = await page.evaluate(() => {
  const now = new Date(Date.now() + 25000);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const db = JSON.parse(localStorage.getItem('calapp.v2') || '{"reminders":[],"notes":[],"courses":[]}');
  db.reminders.push({
    id: 'r_test', title: '测试提醒', note: '引擎自检', date, time: `${hh}:${mm}`,
    repeat: 'none', lunar: null, enabled: true, color: 'blue', createdAt: Date.now()
  });
  localStorage.setItem('calapp.v2', JSON.stringify(db));
  return `${date} ${hh}:${mm}`;
});
console.log('目标触发时间:', target);

await page.reload({ waitUntil: 'networkidle' });
const perm = await page.evaluate(() => Notification.permission);
console.log('通知权限:', perm);

// 等待引擎触发（20s 轮询 + 容差）
await page.waitForTimeout(50000);
const fired = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('calapp.v2') || '{"reminders":[],"notes":[],"courses":[]}');
  return Object.keys(db.fired || {});
});
console.log('已触发记录:', JSON.stringify(fired));

// 2) Service Worker 离线能力
const swReg = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? (reg.active ? 'active' : reg.installing ? 'installing' : 'waiting') : 'none';
});
console.log('Service Worker:', swReg);

await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(e => console.log('离线重载异常:', e.message));
await page.waitForTimeout(1200);
const offlineOK = await page.evaluate(() => ({
  cells: document.querySelectorAll('.cell').length,
  title: document.querySelector('#cal-ym')?.textContent
}));
console.log('离线渲染:', JSON.stringify(offlineOK));
await page.screenshot({ path: 'shots/30-offline.png' });
await ctx.setOffline(false);

console.log('\n=== ERRORS ===\n' + (errors.length ? errors.join('\n') : '(none)'));
await browser.close();
