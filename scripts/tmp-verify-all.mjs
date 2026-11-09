/**
 * 四项功能回归：日志图片放大、课表解析（无教师/有班级）、分隔带、今日列。
 * 用真实浏览器把每一步都跑一遍并截图。
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe'
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

const ok = (name, cond, extra = '') => console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);

await page.goto('http://127.0.0.1:5173/index.html', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('calapp.account.skip', '1'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

console.log('\n=== 1. 日志：标题 + 图片 + 点开放大 ===');
await page.click('.tab[data-tab="notes"]');
await page.waitForTimeout(400);
await page.click('#notes-add');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/v-1-editor.png' });

await page.fill('#n-title', '周六的记录');
await page.fill('#n-text', '今天试一下图片能不能点开放大。');
await page.setInputFiles('#n-file', ['shots/test-photo1.jpg', 'shots/test-photo2.jpg']);
await page.waitForTimeout(1600);
const thumbCount = await page.$$eval('.thumb', els => els.length);
ok('图片缩略图已加入', thumbCount === 2, `${thumbCount} 张`);
await page.screenshot({ path: 'shots/v-2-thumbs.png' });

await page.click('.sheet-actions .btn:not(.secondary)');
await page.waitForTimeout(700);
const listText = await page.evaluate(() => Array.from(document.querySelectorAll('.note .nt')).map(e => e.textContent.trim()).join('|'));
ok('列表只显示标题', listText.includes('周六的记录') && !listText.includes('试一下图片能不能'), listText);
await page.screenshot({ path: 'shots/v-3-list.png' });

// 打开刚才那条，点缩略图
await page.click('.note[data-id]');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/v-4-edit-again.png' });
const thumbBox = await page.$('.thumb');
ok('重新打开后有缩略图', !!thumbBox);
if (thumbBox) {
  await thumbBox.click();
  await page.waitForTimeout(700);
  const lb = await page.evaluate(() => {
    const el = document.querySelector('.lightbox, .lb, [class*=lightbox]');
    return el ? { cls: el.className, counter: el.innerText.replace(/\s+/g, ' ').slice(0, 30), img: !!el.querySelector('img,canvas') } : null;
  });
  ok('点击缩略图打开全屏查看器', !!lb, lb ? lb.cls : '未出现');
  await page.screenshot({ path: 'shots/v-5-lightbox.png' });
  if (lb) {
    // 双击放大
    await page.mouse.dblclick(195, 420);
    await page.waitForTimeout(500);
    const zoom = await page.evaluate(() => {
      const el = document.querySelector('.lightbox .lb-img, .lb-stage img');
      return el ? getComputedStyle(el).transform : 'none';
    });
    const sc = zoom && zoom.startsWith('matrix(') ? parseFloat(zoom.slice(7).split(',')[0]) : 1;
    ok('双击可放大', sc > 2, `scale=${sc}`);
    await page.screenshot({ path: 'shots/v-6-lightbox-zoom.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok('ESC 可关闭', await page.evaluate(() => !document.querySelector('.lightbox, .lb')));
  }
}

console.log('\n=== 2. 课表：解析（无教师、有班级、周次、地点）===');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => { const b = document.querySelector('.sheet-mask'); if (b) b.click(); });
await page.waitForTimeout(500);
await page.click('.tab[data-tab="timetable"]');
await page.waitForTimeout(500);
await page.click('#tt-empty-import').catch(async () => { await page.click('#tt-import'); });
await page.waitForTimeout(500);
await page.setInputFiles('#pdf-input', 'samples/课表样例2.pdf');
await page.waitForTimeout(2600);
const parsed = await page.$$eval('.parse-item', els => els.map(e => ({
  name: e.querySelector('.pi-name')?.textContent.trim(),
  meta: e.querySelector('.pi-meta')?.textContent.replace(/\s+/g, ' ').trim()
})));
console.log('  识别到', parsed.length, '门');
parsed.slice(0, 4).forEach(p => console.log('   -', p.name, '|', p.meta));
ok('解析出课程', parsed.length >= 8, parsed.length + ' 门');
ok('不再含教师字段', parsed.every(p => !/老师|教师|教授|讲师/.test(p.meta || '')));
ok('含班级信息', parsed.some(p => /\d{4}/.test((p.meta || '').split('·').pop() || '')), parsed.find(p => /软工|班/.test(p.meta||''))?.meta);
await page.screenshot({ path: 'shots/v-7-parse.png' });

await page.click('.sheet-actions .btn:not(.secondary)');
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/v-8-grid.png' });

console.log('\n=== 3. 课表样式：分隔带 + 今日列 ===');
const style = await page.evaluate(() => {
  const g = document.querySelector('#tt-grid');
  if (!g) return null;
  const seps = document.querySelectorAll('.tt-sep').length;
  const todayCol = document.querySelector('.tt-today-col');
  const rows = getComputedStyle(g).gridTemplateRows;
  const colStyle = todayCol ? getComputedStyle(todayCol).backgroundColor : null;
  return { seps, hasToday: !!todayCol, rows: rows.slice(0, 90), colStyle };
});
ok('分隔带存在（4/5、8/9 之间）', style && style.seps >= 2, style && `${style.seps} 条`);
ok('今日列存在且有底色', style && style.hasToday && style.colStyle !== 'rgba(0, 0, 0, 0)', style && style.colStyle);
ok('行高数组含加宽段', style && /9px|10px|11px|12px/.test(style.rows), style && style.rows);

console.log('\n=== 4. 设置页：桌面图标行 ===');
await page.click('.tab[data-tab="calendar"]');
await page.waitForTimeout(400);
await page.click('#cal-settings');
await page.waitForTimeout(700);
const settingsRow = await page.evaluate(() => {
  if (!document.querySelector('[data-row="icon-sync"]')) return null;
  return document.querySelector('[data-row="icon-sync"]').innerText.replace(/\s+/g, ' ').trim();
});
console.log('  设置页存在图标行（需进设置页才算真验证）:', settingsRow);

console.log('\n=== 控制台错误 ===');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();
