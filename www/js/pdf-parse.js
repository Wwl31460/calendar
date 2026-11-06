/* ---------- 课表 PDF 解析 ---------- */
import { parseWeeks } from './schedule.js';

/* 初始化 pdf.js */
let pdfReady = null;
function ensurePdf() {
  if (pdfReady) return pdfReady;
  pdfReady = new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      return resolve(window.pdfjsLib);
    }
    const s = document.createElement('script');
    s.src = 'lib/pdf.min.js';
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error('pdf.js 加载失败'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('pdf.js 加载失败'));
    document.head.appendChild(s);
  });
  return pdfReady;
}

/** 供阅读器复用 pdf.js 实例 */
export function ensurePdfJs() { return ensurePdf(); }

/** 读取 PDF 每页文字块（含坐标） */
export async function extractPdfItems(arrayBuffer) {
  const pdfjs = await ensurePdf();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      items.push({
        text: str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || str.length * 6,
        h: Math.abs(it.transform[3]) || 10
      });
    }
    pages.push({ items, width: page.view[2], height: page.view[3] });
  }
  return pages;
}

/* ---------------- 工具 ---------------- */
const WD_CHAR = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7 };

function detectWeekday(str) {
  const t = String(str).replace(/\s/g, '');
  let m = t.match(/^(?:周|星期|礼拜)([一二三四五六日天七])$/);
  if (m) return WD_CHAR[m[1]];
  const en = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const e = t.toLowerCase().replace(/[^a-z]/g, '');
  if (e.length >= 3 && en[e.slice(0, 3)]) return en[e.slice(0, 3)];
  return 0;
}

function detectPeriodLabel(str) {
  const t = String(str).replace(/\s/g, '');
  let m = t.match(/^第?(\d{1,2})[-~—–至](\d{1,2})节?$/);
  if (m) return { start: +m[1], end: +m[2] };
  m = t.match(/^第(\d{1,2})节$/);
  if (m) return { start: +m[1], end: +m[1] };
  m = t.match(/^(\d{1,2})$/);
  if (m && +m[1] >= 1 && +m[1] <= 14) return { start: +m[1], end: +m[1] };
  return null;
}

function clusterLines(items, tol = 3.2) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    let line = null;
    for (const l of lines) {
      if (Math.abs(l.y - it.y) <= tol) { line = l; break; }
    }
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  }
  lines.forEach(l => {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map(i => i.text).join(' ');
    l.x1 = l.items[0].x;
    l.x2 = Math.max(...l.items.map(i => i.x + (i.w || 0)));
  });
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function extractWeeks(text) {
  const t = String(text).replace(/\s/g, '');
  const m = t.match(/(\d[\d,，、\-~—–]*)\s*[周週]/);
  if (!m) {
    if (/(单周|双周)/.test(t)) {
      const base = parseWeeks('1-20' + (/单/.test(t) ? '单' : '双'), 30);
      return base;
    }
    return [];
  }
  let seg = m[1];
  const tail = t.slice(m.index + m[0].length, m.index + m[0].length + 4);
  if (/^[（(]?单/.test(tail) || /单周/.test(t)) seg += '单';
  else if (/^[（(]?双/.test(tail) || /双周/.test(t)) seg += '双';
  return parseWeeks(seg, 30);
}

const NAME_NOISE = /^(周次|节次|时间|课程|星期|备注|教师|地点|教室|上课)/;

/* 常见姓氏，用于判断一行短文本是不是人名（而非被折行的课名） */
const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
const COMPOUND = ['欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '尉迟', '公孙', '慕容', '司徒', '令狐', '宇文', '长孙', '南宫'];

function isPersonName(t) {
  const s = String(t).replace(/[（(].*?[)）]/g, '').replace(/[\s·]/g, '');
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(s)) return false;
  if (s.length <= 3) return SURNAMES.includes(s[0]);
  return COMPOUND.some(c => s.startsWith(c));
}

function parseCell(lines) {
  const texts = lines.map(l => l.text.trim()).filter(t => t && !/^[-—–_=·.]+$/.test(t));
  if (!texts.length) return null;

  let weeks = [];
  let periodText = '';
  let teacher = '';
  let room = '';
  const nameParts = [];
  let nameClosed = false;

  for (const raw of texts) {
    const t = raw.trim();
    if (!weeks.length && /[周週]/.test(t) && /\d/.test(t)) {
      const w = extractWeeks(t);
      if (w.length) { weeks = w; nameClosed = true; continue; }
    }
    if (!periodText && /\d{1,2}\s*[-~—–]\s*\d{1,2}\s*节/.test(t)) {
      periodText = t; nameClosed = true; continue;
    }
    let m = t.match(/^(?:教师|老师|任课教师)[:：]?\s*(.+)$/);
    if (m) { teacher = m[1].trim(); nameClosed = true; continue; }
    m = t.match(/^(?:地点|教室|上课地点)[:：]?\s*(.+)$/);
    if (m) { room = m[1].trim(); nameClosed = true; continue; }
    if (NAME_NOISE.test(t) && t.length <= 3) continue;
    if (/(楼|室|馆|场|机房|中心)/.test(t) && t.length <= 16) { room = room || t; nameClosed = true; continue; }
    if (/[A-Za-z]\d{2,4}/.test(t) && t.length <= 12) { room = room || t; nameClosed = true; continue; }
    if (/(教授|讲师|老师|助教)$/.test(t) && t.length <= 8) { teacher = teacher || t; nameClosed = true; continue; }
    if (isPersonName(t)) { teacher = teacher || t; nameClosed = true; continue; }
    if (!nameClosed) nameParts.push(t);
  }

  // 课名可能被折行：把开头连续的文本拼起来
  let name = nameParts.join('');
  if (!name) return null;

  if (periodText) {
    const pm = periodText.match(/(\d{1,2})\s*[-~—–]\s*(\d{1,2})/);
    if (pm) periodText = `${pm[1]}-${pm[2]}`;
  }
  return {
    name: name.replace(/^[*※◇◆\s]+|[*※◇◆\s]+$/g, ''),
    teacher,
    room,
    weeks,
    periodText,
    raw: texts.join(' / ')
  };
}

/* ---------------- 主解析：表格结构 ---------------- */
export function parseTable(items, maxPeriod = 12) {
  const lines = clusterLines(items);
  const courses = [];
  let headerInfo = null;

  // 1. 找星期表头
  let headerLine = null;
  let columns = [];
  for (const line of lines) {
    const hitters = line.items
      .map(it => ({ wd: detectWeekday(it.text), it }))
      .filter(o => o.wd > 0);
    const uniq = new Set(hitters.map(o => o.wd));
    if (uniq.size >= 4) {
      headerLine = line;
      columns = hitters.map(o => ({ wd: o.wd, x: o.it.x + (o.it.w || 0) / 2 }));
      break;
    }
  }
  if (!headerLine || columns.length < 5) return { ok: false, courses: [], lines };

  columns.sort((a, b) => a.x - b.x);
  // 合并重复星期（合并单元格）
  const seen = new Set();
  columns = columns.filter(c => (seen.has(c.wd) ? false : (seen.add(c.wd), true)));

  const colBounds = columns.map((c, i) => {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const left = prev ? (prev.x + c.x) / 2 : c.x - (next ? (next.x - c.x) / 2 : 40);
    const right = next ? (c.x + next.x) / 2 : c.x + (prev ? (c.x - prev.x) / 2 : 40);
    return { wd: c.wd, left, right };
  });

  // 2. 找节次行（表头左侧的节次标签）
  const minColX = Math.min(...colBounds.map(b => b.left));
  let periodAnchors = [];
  for (const line of lines) {
    if (line.y >= headerLine.y - 1) continue;
    for (const it of line.items) {
      if (it.x + (it.w || 0) / 2 > minColX) continue;
      const p = detectPeriodLabel(it.text);
      if (p) { periodAnchors.push({ ...p, y: it.y }); break; }
    }
  }
  if (periodAnchors.length < 3) {
    // 退一步：整行匹配 "1-2节"
    periodAnchors = [];
    for (const line of lines) {
      if (line.y >= headerLine.y - 1) continue;
      const p = detectPeriodLabel(line.items[0] && line.items[0].text);
      if (p) periodAnchors.push({ ...p, y: line.y });
    }
  }
  periodAnchors.sort((a, b) => b.y - a.y);
  if (periodAnchors.length < 2) return { ok: false, courses: [], lines };

  // 3. 把文字块分配到单元格
  const cells = new Map(); // `${wd}|${rowIndex}`
  const skipSet = new Set([headerLine]);
  const anchorYs = periodAnchors.map(p => p.y);
  const rowGap = anchorYs.length > 1 ? Math.abs(anchorYs[0] - anchorYs[1]) : 40;

  for (const line of lines) {
    if (line.y >= headerLine.y - 1) continue;
    for (const it of line.items) {
      const cx = it.x + (it.w || 0) / 2;
      if (cx < minColX) continue; // 节次列
      const col = colBounds.find(b => cx >= b.left && cx < b.right);
      if (!col) continue;
      // 找最近节次行
      let best = -1, bestD = Infinity;
      anchorYs.forEach((y, idx) => {
        const d = Math.abs(line.y - y);
        if (d < bestD) { bestD = d; best = idx; }
      });
      if (best < 0 || bestD > rowGap * 0.75) continue;
      const key = `${col.wd}|${best}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }
  }

  // 4. 逐单元格解析 + 纵向合并（同一门课连续节次）
  const cellResults = [];
  for (const [key, its] of cells) {
    const [wd, rowIdx] = key.split('|').map(Number);
    const localLines = clusterLines(its, 3.2);
    const parsed = parseCell(localLines);
    if (!parsed || !parsed.name) continue;
    cellResults.push({
      ...parsed,
      weekday: wd,
      rowIndex: rowIdx,
      period: periodAnchors[rowIdx]
    });
  }

  // 合并连续且同名
  const byWd = new Map();
  cellResults.forEach(c => {
    if (!byWd.has(c.weekday)) byWd.set(c.weekday, []);
    byWd.get(c.weekday).push(c);
  });

  for (const [, list] of byWd) {
    list.sort((a, b) => a.rowIndex - b.rowIndex);
    let cur = null;
    for (const c of list) {
      if (cur && c.rowIndex === cur.rowIndex + (cur._span || 0) && c.name === cur.name) {
        cur.end = c.period.end;
        cur._span = (cur._span || 1) + 1;
        cur.room = cur.room || c.room;
        cur.teacher = cur.teacher || c.teacher;
        if (!cur.weeks.length) cur.weeks = c.weeks;
        continue;
      }
      cur = {
        name: c.name,
        teacher: c.teacher,
        room: c.room,
        weekday: c.weekday,
        start: c.period.start,
        end: c.period.end,
        weeks: c.weeks,
        _span: 1
      };
      courses.push(cur);
    }
  }

  headerInfo = { columns: colBounds.length, rows: periodAnchors.length };
  return { ok: courses.length > 0, courses, lines, headerInfo };
}

/* ---------------- 兜底：按行文本解析 ---------------- */
export function parseLooseText(text) {
  const out = [];
  const rows = String(text).split(/\r?\n/);
  for (const row of rows) {
    const line = row.replace(/\s+/g, ' ').trim();
    if (!line || line.length < 4) continue;
    const wdMatch = line.match(/(?:周|星期|礼拜)([一二三四五六日天七])/);
    if (!wdMatch) continue;
    const wd = WD_CHAR[wdMatch[1]];
    const periodMatch = line.match(/(?:第)?(\d{1,2})\s*[-~—–]\s*(\d{1,2})\s*节/) || line.match(/第(\d{1,2})\s*节/);
    const start = periodMatch ? Number(periodMatch[1]) : 1;
    const end = periodMatch ? Number(periodMatch[2] || periodMatch[1]) : start + 1;
    const weeks = extractWeeks(line);
    let name = line.slice(0, wdMatch.index).trim();
    let rest = line.slice(wdMatch.index + wdMatch[0].length);
    if (!name) {
      name = rest.replace(/(?:第)?\d{1,2}\s*[-~—–]?\s*\d{0,2}\s*节/g, '').trim().slice(0, 16);
    }
    rest = rest.replace(/(?:第)?\d{1,2}\s*[-~—–]\s*\d{1,2}\s*节/g, ' ')
      .replace(/\d[\d,，、\-~—–]*\s*[周週]([（(]?[单双][)）]?)?/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const roomMatch = rest.match(/[A-Za-z]?\d{3,4}|[\u4e00-\u9fa5]{1,6}(?:楼|室|馆|场)[\dA-Za-z]*/);
    out.push({
      name: name.replace(/^[0-9\-、.\s]+/, '') || rest.slice(0, 12),
      teacher: '',
      room: roomMatch ? roomMatch[0] : '',
      weekday: wd,
      start,
      end,
      weeks
    });
  }
  // 去重
  const seen = new Set();
  return out.filter(c => {
    const k = `${c.name}|${c.weekday}|${c.start}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 判断抽取到的文字是否可用（扫描件 / 缺少 ToUnicode 的中文字体会抽不出或乱码） */
export function textQuality(pages) {
  let total = 0, cjk = 0, bad = 0;
  for (const p of pages) {
    for (const it of p.items) {
      for (const ch of it.text) {
        total++;
        const c = ch.codePointAt(0);
        if (c >= 0x4e00 && c <= 0x9fff) cjk++;
        else if (c === 0xfffd || (c >= 0xe000 && c <= 0xf8ff)) bad++;
      }
    }
  }
  const usable = total >= 12 && cjk >= 6 && bad / Math.max(1, total) < 0.35;
  return { total, cjk, bad, usable };
}

/** 解析整个 PDF，返回候选课程 */
export async function parsePdfFile(file) {
  const buf = await file.arrayBuffer();
  const pages = await extractPdfItems(buf);
  const allItems = pages.flatMap(p => p.items);
  const quality = textQuality(pages);

  // 扫描件 / 字体无映射：文字层不可用，交给「PDF 原图查看」
  if (!quality.usable) {
    return { courses: [], mode: 'image', quality, pages: pages.length };
  }

  const table = parseTable(allItems);
  let courses = table.courses || [];

  if (courses.length < 2) {
    // 文本兜底
    const text = pages.map(p => {
      const lines = clusterLines(p.items);
      return lines.map(l => l.text).join('\n');
    }).join('\n');
    const loose = parseLooseText(text);
    if (loose.length > courses.length) {
      return { courses: loose, mode: 'text', lines: table.lines, quality, pages: pages.length };
    }
  }

  return {
    courses: courses.map(c => ({
      name: c.name,
      teacher: c.teacher,
      room: c.room,
      weekday: c.weekday,
      start: c.start,
      end: c.end,
      weeks: c.weeks
    })),
    mode: 'table',
    headerInfo: table.headerInfo,
    lines: table.lines,
    quality,
    pages: pages.length
  };
}

export function rawTextOf(pages) {
  return pages.map(p => clusterLines(p.items).map(l => l.text).join('\n')).join('\n\n');
}
