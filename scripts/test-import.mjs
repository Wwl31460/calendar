import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe'
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

await page.click('[data-tab="timetable"]');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/20-timetable-empty.png' });

await page.click('#tt-empty-import').catch(async () => { await page.click('#tt-import'); });
await page.waitForTimeout(500);
await page.setInputFiles('#pdf-input', 'samples/课表样例.pdf');
await page.waitForTimeout(2500);

await page.screenshot({ path: 'shots/21-import-preview.png' });

const rows = await page.$$eval('.parse-item .pi-name', els => els.map(e => e.textContent.trim()));
const metas = await page.$$eval('.parse-item .pi-meta', els => els.map(e => e.textContent.trim()));
console.log('识别课程数:', rows.length);
rows.forEach((r, i) => console.log('  -', r, '|', metas[i]));
console.log('原始数据:', JSON.stringify(await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('calapp.v2') || '{}');
  return { courses: d.courses ? d.courses.length : 0 };
})));

// 确认导入
await page.click('.sheet-actions .btn:not(.secondary)');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/22-timetable-imported.png' });

const stored = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('calapp.v2') || '{}');
  return { courses: d.courses.length, sample: d.courses.slice(0, 3), semesterStart: d.settings.semesterStart, weeks: d.settings.totalWeeks };
});
console.log('\n入库:', JSON.stringify(stored, null, 1));

console.log('\n=== ERRORS ===\n' + (errors.length ? errors.join('\n') : '(none)'));
await browser.close();
