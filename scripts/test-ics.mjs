import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

await page.goto('http://127.0.0.1:5173/index.html?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.click('#cal-settings');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/40-settings-v2.png' });

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 8000 }),
  page.click('[data-row="ics"]')
]);
const path = 'samples/export-test.ics';
await download.saveAs(path);
const text = fs.readFileSync(path, 'utf8');
console.log('文件大小:', text.length, '字节');
console.log('VEVENT 数量:', (text.match(/BEGIN:VEVENT/g) || []).length);
console.log('含 VALARM:', text.includes('BEGIN:VALARM'));
console.log('含 RRULE:', text.includes('RRULE:FREQ=DAILY'), text.includes('RRULE:FREQ=YEARLY'));
console.log('首 12 行:');
console.log(text.split('\r\n').slice(0, 14).join('\n'));
console.log('\n=== ERRORS ===\n' + (errors.length ? errors.join('\n') : '(none)'));
await browser.close();
