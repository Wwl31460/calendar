import { chromium } from 'playwright';

const EXE = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe';
const URL = 'http://localhost:5173/index.html';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/auth-login.png' });

// 填入后等待登录完成
await page.click('#auth-hint');
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/auth-filled.png' });
await page.click('#auth-submit');
await page.waitForTimeout(4500);

// 设置页
await page.click('#cal-settings');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/auth-settings.png' });

// 账号弹层
await page.click('[data-row="account"]');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/auth-account-sheet.png' });
await page.keyboard.press('Escape');
await page.click('.sheet-mask').catch(() => {});
await page.waitForTimeout(400);

// 深色主题登录页
await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
await page.evaluate(async () => { const a = await import('./js/account.js'); await a.logout(); });
await page.waitForTimeout(300);
await page.evaluate(async () => { const l = await import('./js/login.js'); l.openLogin(); });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/auth-login-dark.png' });

await browser.close();
console.log('shots done');
