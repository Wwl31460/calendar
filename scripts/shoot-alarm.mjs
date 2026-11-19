#!/usr/bin/env node
/** 截取「提醒响铃」设置项与诊断面板，检查排版 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe',
  args: ['--no-proxy-server']
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.addInitScript(() => {
  const st = { notifications: true, exact: false, batteryOk: false, scheduled: 12, channel: true, alarmVolume: 0, alarmVolumeMax: 7, muted: true };
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      CalendarAlarm: {
        schedule: async () => ({ count: 12, exact: false }),
        cancelAll: async () => ({}),
        status: async () => st,
        test: async () => ({ ok: true, seconds: 6 }),
        ringNow: async () => ({}),
        stopRing: async () => ({}),
        ensureNotifications: async () => ({ granted: true }),
        openSettings: async () => ({})
      },
      LocalNotifications: { getPending: async () => ({ notifications: [] }), cancel: async () => ({}), schedule: async () => ({}) },
      AppUpdater: { getInfo: async () => ({ versionName: '1.5.0', versionCode: 13 }), syncIcon: async () => ({ label: '今天' }) }
    }
  };
});

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('calapp.account.skip', '1'); });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

await page.evaluate(() => window.__switchView('settings'));
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/alarm-row.png' });

await page.locator('[data-row="alarm"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/alarm-sheet.png' });

console.log('ok');
await browser.close();
