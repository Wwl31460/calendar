import { chromium } from 'playwright';

const CHROME = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

// 伪装一个已发布的 Release
await page.route('https://api.github.com/**', route => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      tag_name: 'v1.0.1',
      name: '日历 v1.0.1',
      html_url: 'https://github.com/Wwl31460/calendar/releases/tag/v1.0.1',
      published_at: '2026-11-06T02:00:00Z',
      body: '## 更新内容\n- 修复农历生日在闰月的计算偏差\n- 课表导入识别「单双周」更准\n- 提醒列表新增快速关闭开关\n- 深色模式下日历格线对比度提升',
      assets: [{
        name: '日历-v1.0.1.apk',
        size: 3520000,
        browser_download_url: 'https://github.com/Wwl31460/calendar/releases/download/v1.0.1/app.apk'
      }]
    })
  });
});

await page.goto('http://127.0.0.1:5173/index.html?demo=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// 进入设置页
await page.click('#cal-settings');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/60-settings-update-row.png' });

// 点「检查更新」
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/61-update-dialog.png' });

const info = await page.evaluate(() => ({
  title: document.querySelector('.upd-hero-txt b')?.textContent.trim(),
  sub: document.querySelector('.upd-hero-txt span')?.textContent.trim(),
  notes: document.querySelector('.upd-notes')?.innerText.trim().slice(0, 60),
  file: document.querySelector('.upd-file .grow')?.textContent.trim(),
  size: document.querySelector('.upd-file .val')?.textContent.trim(),
  buttons: Array.from(document.querySelectorAll('.sheet-actions .btn')).map(b => b.textContent.trim())
}));
console.log(JSON.stringify(info, null, 1));

// 关闭后再测「已是最新」
await page.click('.sheet-actions .btn.secondary');
await page.waitForTimeout(600);
await page.unroute('https://api.github.com/**');
await page.route('https://api.github.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ tag_name: 'v1.0.0', name: 'v1.0.0', published_at: '2026-11-01T00:00:00Z', body: '', assets: [] })
}));
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/62-update-latest.png' });
const latestText = await page.evaluate(() => document.querySelector('.upd-checking')?.innerText.trim());
console.log('已是最新态:', JSON.stringify(latestText));

// 深色模式
await page.click('.sheet-actions .btn.secondary');
await page.waitForTimeout(300);
await page.route('https://api.github.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({
    tag_name: 'v1.0.1', published_at: '2026-11-06T02:00:00Z',
    body: '- 修复农历生日在闰月的计算偏差\n- 课表导入识别更准',
    assets: [{ name: '日历-v1.0.1.apk', size: 3520000, browser_download_url: 'https://x/app.apk' }]
  })
}));
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'dark';
  localStorage.setItem('calapp.v2', localStorage.getItem('calapp.v2'));
});
await page.waitForTimeout(200);
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/63-update-dark.png' });

console.log('\n=== ERRORS ===\n' + (errors.length ? errors.join('\n') : '(none)'));
await browser.close();
