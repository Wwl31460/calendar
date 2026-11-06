/**
 * 真实网络下的「检查更新」端到端验证：
 * 不打桩、不 mock，直接让 App 请求 GitHub Releases API，确认能读到远端发布信息。
 */
import { chromium } from 'playwright';

const PROXY = process.env.SANDBOX_PROXY || 'http://127.0.0.1:62262';
const CHROME = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';

const browser = await chromium.launch({
  executablePath: CHROME,
  proxy: { server: PROXY }
});

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai'
});

const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));

// 记录 App 真正发出的 GitHub 请求
const calls = [];
page.on('response', async res => {
  const url = res.url();
  if (url.includes('api.github.com') || url.includes('releases')) {
    calls.push(`${res.status()} ${url.slice(0, 90)}`);
  }
});

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/70-app-home.png' });

await page.evaluate(() => { const b = document.querySelector('#cal-settings'); if (b) b.click(); });

await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/71-settings.png' });

// 找到「检查更新」行
const updRow = page.locator('[data-row="update"]');
const rowCount = await updRow.count();
console.log('检查更新入口数量:', rowCount);
if (!rowCount) {
  console.log('!! 设置页没有 update 行');
  await browser.close();
  process.exit(1);
}

await page.evaluate(() => {
  const el = document.querySelector('[data-row="update"]');
  if (el) el.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/72-update-checking.png' });

// 等结果（真实网络，最多 20 秒）
let title = '';
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(800);
  const hero = await page.locator('.upd-hero-txt b').first().textContent().catch(() => '');
  if (hero && !/检查中|正在检查/.test(hero)) { title = hero.trim(); break; }
}
await page.screenshot({ path: 'shots/73-update-result.png' });

const sheetText = await page.locator('.sheet-body').first().innerText().catch(() => '(读取失败)');
console.log('\n=== 网络请求 ===');
console.log(calls.length ? calls.join('\n') : '(无 GitHub 请求)');
console.log('\n=== 弹层文案 ===');
console.log(sheetText.replace(/\n{2,}/g, '\n').slice(0, 600));
console.log('\n=== 结论 ===', title || '(未取到标题)');
console.log('\n=== 控制台 ===');
console.log(logs.filter(l => !/favicon/.test(l)).slice(0, 12).join('\n') || '(无)');

await browser.close();
