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

const result = { steps: [] };
const ok = (name, cond, extra = '') => {
  result.steps.push(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) result.failed = true;
};

// 在页面脚本执行前注入 Capacitor 桥（模拟 APK 环境）
await ctx.addInitScript(() => {
  const noop = () => ({ remove() {} });
  window.__listen = {};
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: 'granted' }),
        requestPermissions: async () => ({ display: 'granted' }),
        getPending: async () => ({ notifications: [] }),
        cancel: async () => {},
        schedule: async () => ({ notifications: [] }),
        addListener: noop
      },
      AppUpdater: {
        getInfo: async () => ({ versionName: '1.0.0', versionCode: 1, packageName: 'cn.rili.calendar' }),
        canInstall: async () => ({ value: window.__canInstall !== false }),
        openInstallPermission: async () => { window.__openedPerm = true; },
        downloadAndInstall: async opts => { window.__payload = opts; },
        addListener: (name, cb) => { window.__listen[name] = cb; return { remove() {} }; }
      }
    }
  };
});

const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

await page.route('https://api.github.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({
    tag_name: 'v1.0.1',
    published_at: '2026-11-06T02:00:00Z',
    body: '## 更新内容\n- 修复农历生日在闰月的计算偏差\n- 课表导入识别 "单双周" 更准',
    assets: [{
      name: '日历-v1.0.1.apk',
      size: 3519175,
      browser_download_url: 'https://github.com/Wwl31460/calendar/releases/download/v1.0.1/calendar-v1.0.1.apk'
    }]
  })
}));

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1) 原生环境识别
const aboutText = await page.evaluate(async () => {
  document.querySelector('#cal-settings').click();
  await new Promise(r => setTimeout(r, 400));
  return document.querySelector('#settings-body').innerText;
});
ok('识别为安卓版', aboutText.includes('安卓版'));
ok('显示当前版本 1.0.0', aboutText.includes('v1.0.0'));

// 2) 检查更新 → 出现「立即更新」
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
const btnText = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.sheet-actions .btn')).map(b => b.textContent.trim()));
ok('原生环境按钮为「立即更新」', btnText.includes('立即更新'), btnText.join('/'));
await page.screenshot({ path: 'shots/64-native-update.png' });

// 3) 点击更新 → 检查传给原生的参数
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.sheet-actions .btn'))
    .find(b => b.textContent.trim() === '立即更新').click();
});
await page.waitForTimeout(600);
const payload = await page.evaluate(() => window.__payload);
ok('已调用原生下载', !!payload, payload ? payload.fileName : '未调用');
ok('携带直连地址', payload && payload.urls[0].startsWith('https://github.com/'), payload && payload.urls[0].slice(0, 52));
ok('携带加速镜像回退', payload && payload.urls.length >= 2, payload && payload.urls.slice(1).join(' , '));
ok('文件名固定', payload && payload.fileName === 'calendar-update.apk');

// 4) 进度事件
await page.evaluate(() => window.__listen.downloadProgress && window.__listen.downloadProgress({ progress: 0.42 }));
await page.waitForTimeout(300);
const pct = await page.evaluate(() => document.querySelector('#dl-pct')?.textContent);
ok('下载进度显示 42%', pct === '42%', pct || '未显示');
await page.screenshot({ path: 'shots/65-native-downloading.png' });

// 5) 安装完成
await page.evaluate(() => window.__listen.installStarted && window.__listen.installStarted());
await page.waitForTimeout(400);
const overlayGone = await page.evaluate(() => !document.querySelector('#dl-pct'));
ok('安装调起后关闭下载层', overlayGone);

// 6) 无安装权限分支
await page.evaluate(() => { window.__canInstall = false; });
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.sheet-actions .btn'))
    .find(b => b.textContent.trim() === '立即更新').click();
});
await page.waitForTimeout(900);
const permSheet = await page.evaluate(() => document.querySelector('.sheet-head h2')?.textContent.trim());
ok('无权限时提示开启安装权限', permSheet === '需要安装权限', permSheet || '未提示');
await page.screenshot({ path: 'shots/66-install-permission.png' });

// 7) 下载失败分支
await page.evaluate(() => { window.__canInstall = true; });
await page.click('.sheet-actions .btn.secondary');
await page.waitForTimeout(500);
await page.click('[data-row="update"]');
await page.waitForTimeout(1200);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('.sheet-actions .btn'))
    .find(b => b.textContent.trim() === '立即更新').click();
});
await page.waitForTimeout(500);
await page.evaluate(() => window.__listen.downloadError && window.__listen.downloadError({ message: '下载失败（HTTP 404）' }));
await page.waitForTimeout(600);
const toastText = await page.evaluate(() => document.querySelector('.toast')?.innerText.trim());
ok('下载失败有提示', !!toastText && toastText.includes('404'), toastText || '无提示');

// 8) Service Worker 不应在 APK 内注册
const swCount = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length));
ok('APK 内不注册 Service Worker', swCount === 0, `已注册 ${swCount} 个`);

ok('无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(result.steps.join('\n'));
console.log(result.failed ? '\n❌ 有失败项' : '\n✅ 全部通过');
await browser.close();
process.exit(result.failed ? 1 : 0);
