import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:5173/index.html';
const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe'
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  ✓', name); };

await page.goto(BASE + '?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await shot('01-calendar');

// 翻到下个月（10月国庆）
await page.click('#cal-prev');
await page.waitForTimeout(400);
await shot('02-october');

// 选中 10月1日，看日程面板
await page.click('[data-date="2026-10-01"]');
await page.waitForTimeout(300);
await shot('03-holiday');

// 回到本月
await page.click('#cal-today');
await page.waitForTimeout(300);

// 课表
await page.click('[data-tab="timetable"]');
await page.waitForTimeout(400);
await shot('04-timetable');

// 日志
await page.click('[data-tab="notes"]');
await page.waitForTimeout(300);
await shot('05-notes');

// 搜索
await page.click('#notes-search-btn');
await page.fill('#notes-search', '跑步');
await page.waitForTimeout(300);
await shot('06-notes-search');
await page.click('#notes-search-close');

// 提醒
await page.click('[data-tab="reminders"]');
await page.waitForTimeout(300);
await shot('07-reminders');

// 新建提醒（农历每年）
await page.click('#rem-add');
await page.waitForTimeout(450);
await page.fill('#f-title', '奶奶生日');
await page.click('.seg button[data-v="lunar"]');
await page.waitForTimeout(250);
await shot('08-reminder-lunar');
await page.click('.sheet-actions .btn:not(.secondary)');
await page.waitForTimeout(500);
await shot('09-after-save');

// 设置
await page.click('[data-tab="calendar"]');
await page.waitForTimeout(250);
await page.click('#cal-settings');
await page.waitForTimeout(350);
await shot('10-settings');

// 深色主题
await page.click('[data-row="theme"]');
await page.waitForTimeout(350);
await page.click('.seg button[data-v="dark"]');
await page.click('.sheet-actions .btn');
await page.waitForTimeout(400);
await shot('11-settings-dark');
await page.click('#set-back');
await page.waitForTimeout(300);
await shot('12-calendar-dark');

// 数据校验
const state = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('calapp.v2'));
  return {
    reminders: d.reminders.length,
    notes: d.notes.length,
    courses: d.courses.length,
    theme: d.settings.theme,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
});
console.log('\nstate:', JSON.stringify(state));
console.log('\n=== ERRORS ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
