import { chromium } from 'playwright';

/* 按用户学校教务系统的格式造样本：
   单元格内 第1行课程名称、第2行上课周次、第3行上课地点、之后是上课班级（没有教师） */
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  body { font-family: "Microsoft YaHei", "SimHei", sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  p.sub { text-align: center; font-size: 10.5px; color: #555; margin: 0 0 14px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #333; font-size: 8.5px; padding: 4px 2px; vertical-align: middle; text-align: center; }
  th { background: #eee; font-size: 9.5px; }
  td.cell { height: 54px; }
  td.cell b { font-size: 9px; display: block; }
  td.cell span { display: block; color: #333; line-height: 1.25; }
  td.period { width: 40px; font-size: 8.5px; background: #f7f7f7; }
</style></head><body>
<h1>2026—2027 学年第一学期 学生课表</h1>
<p class="sub">学院：计算机学院　　专业：软件工程　　班级：软工 2601</p>
<table>
  <tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th><th>星期六</th><th>星期日</th></tr>
  <tr>
    <td class="period">第1节</td>
    <td class="cell"><b>高等数学</b><span>1-16周</span><span>教A305</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"><b>计算机网络</b><span>1-16周</span><span>计算机楼305</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"><b>大学物理</b><span>1-16周</span><span>理科楼203</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第2节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第3节</td>
    <td class="cell"><b>大学英语</b><span>1-16周</span><span>外语楼201</span><span>软工2601</span></td>
    <td class="cell"><b>数据结构</b><span>1-16周</span><span>计算机楼402</span><span>软工2601、软工2602</span></td>
    <td class="cell"></td>
    <td class="cell"><b>马克思主义基本原理</b><span>1-8周</span><span>文科楼501</span><span>软工2601</span></td>
    <td class="cell"><b>程序设计实验</b><span>3-16周</span><span>机房A</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第4节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第5节</td>
    <td class="cell"></td>
    <td class="cell"><b>线性代数</b><span>1-16周</span><span>教二108</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"><b>操作系统</b><span>1-16周</span><span>计算机楼401</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第6节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第7节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"><b>体育（篮球）</b><span>1-16周</span><span>体育馆</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"><b>大学生心理健康</b><span>9-16周</span><span>文科楼302</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第8节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
  <tr>
    <td class="period">第9节</td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"><b>形势与政策</b><span>1-8周单</span><span>文科楼201</span><span>软工2601</span></td>
    <td class="cell"></td>
    <td class="cell"></td>
    <td class="cell"></td>
  </tr>
</table>
</body></html>`;

const browser = await chromium.launch({
  executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium-1148/chrome-win/chrome.exe'
});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: 'samples/课表样例2.pdf', format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
await browser.close();
console.log('pdf2 generated');
