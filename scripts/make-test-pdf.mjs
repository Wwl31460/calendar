import { chromium } from 'playwright';

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  body { font-family: "Microsoft YaHei", "SimHei", sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  p.sub { text-align: center; font-size: 11px; color: #555; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #333; font-size: 9px; padding: 4px 3px; vertical-align: middle; text-align: center; }
  th { background: #eee; font-size: 10px; }
  td.cell { height: 52px; }
  td.cell b { font-size: 9.5px; display: block; }
  td.cell span { display: block; color: #333; }
  td.period { width: 44px; font-size: 9px; background: #f7f7f7; }
</style></head><body>
<h1>2026—2027 学年第一学期 学生课表</h1>
<p class="sub">专业：计算机科学与技术　　班级：计科 2601　　学号：20260101</p>
<table>
  <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th><th>星期六</th><th>星期日</th></tr>
  <tr>
    <td class="period">1-2节</td>
    <td class="cell"><b>高等数学</b><span>张建国</span><span>教A305</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"><b>计算机网络</b><span>赵明</span><span>计算机楼305</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"><b>大学物理</b><span>吴宇</span><span>理科楼203</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">3-4节</td>
    <td class="cell"><b>大学英语</b><span>李梅</span><span>外语楼201</span><span>1-16周</span></td>
    <td class="cell"><b>数据结构</b><span>李慧</span><span>计算机楼402</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"><b>马克思主义基本原理</b><span>孙丽</span><span>文科楼501</span><span>1-8周</span></td>
    <td class="cell"><b>程序设计实验</b><span>李慧</span><span>机房A</span><span>3-16周</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">5-6节</td>
    <td class="cell"></td>
    <td class="cell"><b>线性代数</b><span>陈峰</span><span>教二108</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"><b>操作系统</b><span>周涛</span><span>计算机楼401</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">7-8节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"><b>体育（篮球）</b><span>刘强</span><span>体育馆</span><span>1-16周</span></td>
    <td class="cell"></td>
    <td class="cell"><b>大学生心理健康</b><span>何静</span><span>文科楼302</span><span>9-16周</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">9-10节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"><b>形势与政策</b><span>王强</span><span>文科楼201</span><span>1-8周单</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
</table>
<p class="sub" style="margin-top:14px">备注：第 17-18 周为复习考试周</p>
</body></html>`;

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe'
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: 'samples/课表样例.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
await browser.close();
console.log('pdf generated');
