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
  m = t.match(/^(?:周|星期|礼拜)([一二三四五六日天七])[（(]/);
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
  if (m && +m[1] >= 1 && +m[1] <= 16) return { start: +m[1], end: +m[1] };
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

const NAME_NOISE = /^(周次|节次|时间|课程名称|课程|星期|备注|教师|地点|教室|上课|学分|人数|学时|考核|序号)$/;

/* 常见姓氏，用于判断一行短文本是不是人名（而非被折行的课名） */
const SURNAMES = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
const COMPOUND = ['欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '尉迟', '公孙', '慕容', '司徒', '令狐', '宇文', '长孙', '南宫'];

function isPersonName(t) {
  const s = String(t).replace(/[（(].*?[)）]/g, '').replace(/[\s·]/g, '');
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(s)) return false;
  if (s.length <= 3) return SURNAMES.includes(s[0]);
  return COMPOUND.some(c => s.startsWith(c));
}

/** 班级：计算机2201 / 软件3班 / 会计2101-2 */
function looksLikeClass(t) {
  const s = String(t).trim();
  if (!s || s.length > 24) return false;
  if (/^(班级|班别|教学班|行政班|上课班级)/.test(s)) return true;
  return /^[\u4e00-\u9fa5]{2,10}\d{2,4}(?:-\d{1,2})?(?:班)?$/.test(s) ||
    /^[\u4e00-\u9fa5]{2,10}\d{1,2}班$/.test(s);
}

function parseCell(lines, opts = {}) {
  const texts = lines.map(l => (l.text || '').trim()).filter(t => t && !/^[-—–_=·.]+$/.test(t));
  if (!texts.length) return null;

  let weeks = [];
  let periodText = '';
  let teacher = '';
  let room = '';
  let className = '';
  const nameParts = [];
  let nameClosed = false;

  for (const raw of texts) {
    const t = raw.replace(/\s+/g, '');
    if (!t) continue;

    if (!weeks.length && /[周週]/.test(t) && /\d/.test(t)) {
      const w = extractWeeks(raw);
      if (w.length) { weeks = w; nameClosed = true; continue; }
    }
    if (!periodText && /^\d{1,2}[-~—–至]\d{1,2}节?$/.test(t)) {
      periodText = t; nameClosed = true; continue;
    }
    let m = t.match(/^(?:教师|老师|任课教师|授课教师)[:：]?(.+)$/);
    if (m) { teacher = m[1].trim(); nameClosed = true; continue; }
    m = t.match(/^(?:地点|教室|上课地点|上课教室)[:：]?(.+)$/);
    if (m) { room = m[1].trim(); nameClosed = true; continue; }
    m = t.match(/^(?:班级|班别|教学班|行政班|上课班级)[:：]?(.+)$/);
    if (m) { className = m[1].trim(); nameClosed = true; continue; }
    if (/^(学分|人数|学时|考核|类型|性质)[:：]?/.test(t)) continue;
    if (NAME_NOISE.test(t) && t.length <= 4) continue;

    if (/(楼|室|馆|场|机房|中心|校区)/.test(t) && t.length <= 18) { room = room || t; nameClosed = true; continue; }
    // 教室：A305 / 教A305 / 教二108 / 综合楼B201
    if (/^[\u4e00-\u9fa5]{0,3}[A-Za-z]{0,3}\d{2,4}([-－]\d{1,3})?$/.test(t) && t.length <= 12) { room = room || t; nameClosed = true; continue; }
    if (/(教授|讲师|老师|助教|研究员)$/.test(t) && t.length <= 10) { teacher = teacher || t; nameClosed = true; continue; }
    if (looksLikeClass(t) && !className) { className = t.replace(/^(班级|班别|教学班|行政班)[:：]?/, ''); nameClosed = true; continue; }
    if (isPersonName(t)) { teacher = teacher || t; nameClosed = true; continue; }

    if (!nameClosed) nameParts.push(t);
  }

  let name = nameParts.join('');
  if (!name) return null;

  if (periodText) {
    const pm = periodText.match(/(\d{1,2})[-~—–至](\d{1,2})/);
    if (pm) periodText = `${pm[1]}-${pm[2]}`;
  }
  return {
    name: name.replace(/^[*※◇◆\s]+|[*※◇◆\s]+$/g, ''),
    teacher,
    room,
    className,
    weeks,
    periodText,
    raw: texts.join(' / ')
  };
}

/* ---------------- 主解析：表格结构 ---------------- */
export function parseTable(items, maxPeriod = 14) {
  const lines = clusterLines(items);
  const courses = [];

  /* 1. 找星期表头 */
  let headerLine = null;
  let hits = [];
  for (const line of lines) {
    const found = [];
    for (const it of line.items) {
      let wd = detectWeekday(it.text);
      if (!wd) {
        const s = it.text.replace(/\s/g, '');
        if (/^[一二三四五六日天]$/.test(s)) wd = WD_CHAR[s];
      }
      if (wd) found.push({ wd, cx: it.x + (it.w || 0) / 2, x: it.x, x2: it.x + (it.w || 0) });
    }
    const uniq = new Set(found.map(f => f.wd));
    if (uniq.size >= 4) { headerLine = line; hits = found; break; }
  }
  if (!headerLine || hits.length < 5) return { ok: false, courses: [], lines };

  hits.sort((a, b) => a.cx - b.cx);
  const seen = new Set();
  const columns = hits.filter(h => (seen.has(h.wd) ? false : (seen.add(h.wd), true)));

  // 列边界：相邻列中心的中点；首尾各外扩半列
  const colBounds = columns.map((c, i) => {
    const prev = columns[i - 1];
    const next = columns[i + 1];
    const left = prev ? (prev.cx + c.cx) / 2 : c.x - (next ? (next.cx - c.cx) / 2 : 40);
    const right = next ? (c.cx + next.cx) / 2 : c.x2 + (prev ? (c.cx - prev.cx) / 2 : 40);
    return { wd: c.wd, left, right };
  });

  const tableLeft = Math.min(...colBounds.map(b => b.left));
  const tableRight = Math.max(...colBounds.map(b => b.right));

  /* 2. 表格区域内的文字块 */
  const below = lines.filter(l => l.y < headerLine.y - 1);
  const cellItems = [];
  for (const line of below) {
    for (const it of line.items) {
      const cx = it.x + (it.w || 0) / 2;
      if (cx < tableLeft - 2 || cx > tableRight + 2) continue;
      const col = colBounds.find(b => cx >= b.left && cx < b.right);
      if (!col) continue;
      cellItems.push({ ...it, cx, wd: col.wd, y: it.y, lineY: line.y });
    }
  }
  if (!cellItems.length) return { ok: false, courses: [], lines };

  /* 3. 节次锚点（表格左侧的 1 / 1-2 / 第1节） */
  let anchors = [];
  for (const line of below) {
    for (const it of line.items) {
      const cx = it.x + (it.w || 0) / 2;
      if (cx >= tableLeft - 2) continue;
      const p = detectPeriodLabel(it.text);
      if (p) { anchors.push({ ...p, y: it.y }); break; }
    }
  }
  anchors.sort((a, b) => b.y - a.y);
  // 去掉重复的锚点（同一行两个标签）
  anchors = anchors.filter((a, i) => i === 0 || Math.abs(a.y - anchors[i - 1].y) > 4);

  const rowGap = anchors.length > 1
    ? Math.abs(anchors[0].y - anchors[1].y)
    : (cellItems.length ? 46 : 40);

  const rowsTop = anchors.length ? Math.max(anchors[0].y, headerLine.y) : Math.max(...cellItems.map(i => i.y));
  const rowsBottom = anchors.length ? Math.min(...anchors.map(a => a.y)) - rowGap * 0.6
    : Math.min(...cellItems.map(i => i.y)) - rowGap * 0.6;

  /* 4. 分配单元格
     有节次标签：按 y 最近吸附到节次行（稳定，跨行合并的单元格文字居中也能落对行）
     没有节次标签：按列内纵向间隙切块，再按行高推算节次 */
  const results = [];

  if (anchors.length >= 2) {
    const anchorYs = anchors.map(a => a.y);
    const cells = new Map();
    for (const it of cellItems) {
      let best = 0, bestD = Infinity;
      anchorYs.forEach((y, idx) => {
        const d = Math.abs(it.y - y);
        if (d < bestD) { bestD = d; best = idx; }
      });
      const key = `${it.wd}|${best}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    }

    for (const [key, its] of cells) {
      const [wd, idx] = key.split('|').map(Number);
      const parsed = parseCell(clusterLines(its, 3.2));
      if (!parsed || !parsed.name || parsed.name.length <= 1) continue;
      const a = anchors[idx];
      let st = a.start, en = a.end;
      if (parsed.periodText) {
        const pm = parsed.periodText.split('-').map(Number);
        if (pm.length === 2 && pm[0] && pm[1]) { st = pm[0]; en = pm[1]; }
      }
      results.push({
        ...parsed,
        weekday: wd,
        rowIndex: idx,
        start: Math.max(1, Math.min(maxPeriod, st)),
        end: Math.max(1, Math.min(maxPeriod, en))
      });
    }
  } else {
    const byCol = new Map();
    for (const it of cellItems) {
      if (!byCol.has(it.wd)) byCol.set(it.wd, []);
      byCol.get(it.wd).push(it);
    }
    const blocks = [];
    for (const [wd, list] of byCol) {
      list.sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      for (const it of list) {
        if (cur && cur.bottom - it.y <= rowGap * 0.45) {
          cur.items.push(it);
          cur.bottom = it.y;
        } else {
          cur = { wd, top: it.y, bottom: it.y, items: [it] };
          blocks.push(cur);
        }
      }
    }
    for (const b of blocks) {
      const parsed = parseCell(clusterLines(b.items, 3.2));
      if (!parsed || !parsed.name || parsed.name.length <= 1) continue;
      const idxTop = Math.max(0, Math.round((rowsTop - b.top) / rowGap));
      const idxBot = Math.max(0, Math.round((rowsTop - b.bottom) / rowGap));
      let st = Math.min(idxTop, idxBot) + 1;
      let en = Math.max(idxTop, idxBot) + 1;
      if (parsed.periodText) {
        const pm = parsed.periodText.split('-').map(Number);
        if (pm.length === 2 && pm[0] && pm[1]) { st = pm[0]; en = pm[1]; }
      }
      results.push({ ...parsed, weekday: b.wd, rowIndex: Math.min(idxTop, idxBot), start: Math.max(1, Math.min(maxPeriod, st)), end: Math.max(1, Math.min(maxPeriod, en)) });
    }
  }

  /* 6. 同一列、同名、节次相连的合并 */
  const byWd = new Map();
  results.forEach(c => {
    if (!byWd.has(c.weekday)) byWd.set(c.weekday, []);
    byWd.get(c.weekday).push(c);
  });
  for (const [, list] of byWd) {
    list.sort((a, b) => (a.rowIndex - b.rowIndex));
    let cur = null;
    for (const c of list) {
      if (cur && c.name === cur.name && c.start <= cur.end + 1) {
        cur.end = Math.max(cur.end, c.end);
        cur.room = cur.room || c.room;
        cur.teacher = cur.teacher || c.teacher;
        cur.className = cur.className || c.className;
        if (!cur.weeks.length) cur.weeks = c.weeks;
        continue;
      }
      cur = { ...c };
      courses.push(cur);
    }
  }

  courses.forEach(c => { delete c._top; delete c.rowIndex; });
  return {
    ok: courses.length > 0,
    courses,
    lines,
    headerInfo: { columns: colBounds.length, rows: anchors.length, rowGap: Math.round(rowGap) }
  };
}

function nearestAnchor(anchors, y) {
  let best = 0, bestD = Infinity;
  anchors.forEach((a, i) => {
    const d = Math.abs(a.y - y);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
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
    const clsMatch = rest.match(/[\u4e00-\u9fa5]{2,10}\d{2,4}(?:-\d{1,2})?班?/);
    out.push({
      name: name.replace(/^[0-9\-、.\s]+/, '') || rest.slice(0, 12),
      teacher: '',
      room: roomMatch ? roomMatch[0] : '',
      className: clsMatch ? clsMatch[0] : '',
      weekday: wd,
      start,
      end,
      weeks
    });
  }
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

/** 把多页文字块合并：给每页加纵向偏移，避免不同页的坐标撞在一起 */
function mergePages(pages) {
  const n = pages.length;
  const all = [];
  pages.forEach((p, i) => {
    const offset = (n - 1 - i) * 20000;
    p.items.forEach(it => all.push({ ...it, y: it.y + offset, page: i }));
  });
  return all;
}

/** 提取纯文本（用于让用户核对解析结果 / 反馈问题） */
export function pdfRawText(pages) {
  return pages.map((p, i) => {
    const lines = clusterLines(p.items);
    return `【第 ${i + 1} 页】\n` + lines.map(l => l.text).join('\n');
  }).join('\n\n');
}

/** 解析整个 PDF，返回候选课程 */
export async function parsePdfFile(file) {
  const buf = await file.arrayBuffer();
  const pages = await extractPdfItems(buf);
  const quality = textQuality(pages);
  const rawText = pdfRawText(pages);

  if (!quality.usable) {
    return { courses: [], mode: 'image', quality, pages: pages.length, rawText };
  }

  const allItems = mergePages(pages);
  const table = parseTable(allItems);
  let courses = table.courses || [];

  if (courses.length < 2) {
    const loose = parseLooseText(rawText.replace(/【第 \d+ 页】/g, ''));
    if (loose.length > courses.length) {
      return { courses: loose, mode: 'text', lines: table.lines, quality, pages: pages.length, rawText };
    }
  }

  return {
    courses: courses.map(c => ({
      name: c.name,
      teacher: c.teacher,
      room: c.room,
      className: c.className,
      weekday: c.weekday,
      start: c.start,
      end: c.end,
      weeks: c.weeks
    })),
    mode: 'table',
    headerInfo: table.headerInfo,
    lines: table.lines,
    quality,
    pages: pages.length,
    rawText
  };
}

export function rawTextOf(pages) {
  return pdfRawText(pages);
}
