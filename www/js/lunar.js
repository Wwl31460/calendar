/**
 * lunar.js —— 农历 / 二十四节气 / 传统节日 / 公历节日 / 法定节假日
 * 数据范围：1900-01-31 ~ 2100-12-31
 * 无任何外部依赖，浏览器与 Node 均可直接使用
 */

/* ---------------- 农历年编码表（1900-2100） ---------------- */
const lunarInfo = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520 // 2100
];

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

/* 二十四节气（分钟偏移） */
const S_TERM_INFO = [
  0, 21208, 42467, 63836, 85337, 107014, 128867, 150921, 173149, 195551, 218072, 240693,
  263343, 285989, 308563, 331033, 353350, 375494, 397447, 419210, 440795, 462224, 483532, 504758
];
export const TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

/* 公历节日 */
const SOLAR_FESTIVAL = {
  '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '3-12': '植树节', '4-1': '愚人节',
  '5-1': '劳动节', '5-4': '青年节', '5-12': '护士节', '6-1': '儿童节', '7-1': '建党节',
  '8-1': '建军节', '9-10': '教师节', '10-1': '国庆节', '10-24': '程序员节',
  '11-11': '双十一', '12-24': '平安夜', '12-25': '圣诞节'
};

/* 农历节日 */
const LUNAR_FESTIVAL = {
  '1-1': '春节', '1-15': '元宵节', '2-2': '龙抬头', '3-3': '上巳节',
  '5-5': '端午节', '6-6': '晒衣节', '7-7': '七夕节', '7-15': '中元节',
  '8-15': '中秋节', '9-9': '重阳节', '10-1': '寒衣节', '10-15': '下元节',
  '12-8': '腊八节', '12-23': '小年'
};

/* ---------------- 基础换算 ---------------- */
function leapMonth(y) { return lunarInfo[y - 1900] & 0xf; }
function leapDays(y) {
  const lm = leapMonth(y);
  if (!lm) return 0;
  return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
}
function monthDays(y, m) { return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29; }
function yearDays(y) {
  let sum = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}

/** 该农历年按顺序排列的月份（含闰月） */
function monthsOfYear(y) {
  const lm = leapMonth(y);
  const list = [];
  for (let m = 1; m <= 12; m++) {
    list.push({ m, isLeap: false, days: monthDays(y, m) });
    if (lm === m) list.push({ m, isLeap: true, days: leapDays(y) });
  }
  return list;
}

const LUNAR_EPOCH = Date.UTC(1900, 0, 31); // 1900-01-31 = 农历1900年正月初一
const DAY_MS = 86400000;

function dayOffset(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - LUNAR_EPOCH) / DAY_MS);
}
function fromOffset(offset) {
  const dt = new Date(LUNAR_EPOCH + offset * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * 公历 → 农历
 * @param {number} y @param {number} m @param {number} d
 */
export function solar2lunar(y, m, d) {
  let offset = dayOffset(y, m, d);
  if (offset < 0 || y > 2100) return null;
  let ly = 1900;
  while (ly <= 2100 && offset >= yearDays(ly)) { offset -= yearDays(ly); ly++; }
  const list = monthsOfYear(ly);
  let i = 0;
  while (i < list.length && offset >= list[i].days) { offset -= list[i].days; i++; }
  const it = list[i] || { m: 12, isLeap: false };
  const lDay = offset + 1;
  const gz = ganzhiYear(ly);
  return {
    lYear: ly,
    lMonth: it.m,
    lDay,
    isLeap: !!it.isLeap,
    monthDays: it.days,
    monthName: (it.isLeap ? '闰' : '') + MONTH_CN[it.m - 1] + '月',
    dayName: DAY_CN[lDay - 1],
    gzYear: gz,
    animal: ANIMALS[(ly - 4) % 12],
    // 便于显示：正月初一 / 腊月廿八
    text: (it.isLeap ? '闰' : '') + MONTH_CN[it.m - 1] + '月' + DAY_CN[lDay - 1]
  };
}

/**
 * 农历 → 公历
 * @param {number} lYear @param {number} lMonth @param {number} lDay
 * @param {boolean} isLeap 是否闰月
 * @returns {{y:number,m:number,d:number}|null}
 */
export function lunar2solar(lYear, lMonth, lDay, isLeap = false) {
  if (lYear < 1900 || lYear > 2100) return null;
  let offset = 0;
  for (let y = 1900; y < lYear; y++) offset += yearDays(y);
  const list = monthsOfYear(lYear);
  let acc = 0, found = null;
  for (const it of list) {
    if (it.m === lMonth && it.isLeap === !!isLeap) { found = it; break; }
    acc += it.days;
  }
  if (!found || lDay < 1 || lDay > found.days) return null;
  return fromOffset(offset + acc + lDay - 1);
}

/** 农历闰月月份，没有则 0 */
export function getLeapMonth(lYear) { return leapMonth(lYear); }
/** 某农历月的天数 */
export function getLunarMonthDays(lYear, lMonth, isLeap = false) {
  if (isLeap) return leapMonth(lYear) === lMonth ? leapDays(lYear) : 0;
  return monthDays(lYear, lMonth);
}

export function ganzhiYear(lYear) {
  const i = (lYear - 4) % 60;
  return GAN[i % 10] + ZHI[i % 12];
}

/** 节气：返回该月两个节气的「日」，如 [{name:'立冬',day:7},{name:'小雪',day:22}] */
export function solarTermsOfMonth(y, m) {
  const a = S_TERM_INFO[(m - 1) * 2];
  const b = S_TERM_INFO[(m - 1) * 2 + 1];
  const base = Date.UTC(1900, 0, 6, 2, 5);
  const t1 = new Date(base + 31556925974.7 * (y - 1900) + a * 60000);
  const t2 = new Date(base + 31556925974.7 * (y - 1900) + b * 60000);
  return [
    { name: TERM_NAMES[(m - 1) * 2], day: t1.getUTCDate() },
    { name: TERM_NAMES[(m - 1) * 2 + 1], day: t2.getUTCDate() }
  ];
}

/** 某日节气名，无则 null */
export function getTermName(y, m, d) {
  const t = solarTermsOfMonth(y, m);
  if (t[0].day === d) return t[0].name;
  if (t[1].day === d) return t[1].name;
  return null;
}

/* ---------------- 法定节假日 ---------------- */
/* 官方公布的放假 / 调休上班安排（off=放假，work=调休上班）
   2024-2027 来自国务院办公厅通知原文；其余年份按法定规则推算 */
const OFFICIAL = {
  2024: {
    off: [
      ['2024-01-01', '2024-01-01', '元旦'],
      ['2024-02-10', '2024-02-17', '春节'],
      ['2024-04-04', '2024-04-06', '清明节'],
      ['2024-05-01', '2024-05-05', '劳动节'],
      ['2024-06-10', '2024-06-10', '端午节'],
      ['2024-09-15', '2024-09-17', '中秋节'],
      ['2024-10-01', '2024-10-07', '国庆节']
    ],
    work: ['2024-02-04', '2024-02-18', '2024-04-07', '2024-04-28', '2024-05-11', '2024-09-14', '2024-09-29', '2024-10-12']
  },
  2025: {
    off: [
      ['2025-01-01', '2025-01-01', '元旦'],
      ['2025-01-28', '2025-02-04', '春节'],
      ['2025-04-04', '2025-04-06', '清明节'],
      ['2025-05-01', '2025-05-05', '劳动节'],
      ['2025-05-31', '2025-06-02', '端午节'],
      ['2025-10-01', '2025-10-08', '国庆节·中秋节']
    ],
    work: ['2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11']
  },
  2026: {
    off: [
      ['2026-01-01', '2026-01-03', '元旦'],
      ['2026-02-15', '2026-02-23', '春节'],
      ['2026-04-04', '2026-04-06', '清明节'],
      ['2026-05-01', '2026-05-05', '劳动节'],
      ['2026-06-19', '2026-06-21', '端午节'],
      ['2026-09-25', '2026-09-27', '中秋节'],
      ['2026-10-01', '2026-10-07', '国庆节']
    ],
    work: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']
  },
  2027: {
    off: [
      ['2027-01-01', '2027-01-03', '元旦'],
      ['2027-02-05', '2027-02-13', '春节'],
      ['2027-04-03', '2027-04-05', '清明节'],
      ['2027-05-01', '2027-05-05', '劳动节'],
      ['2027-06-09', '2027-06-09', '端午节'],
      ['2027-09-15', '2027-09-15', '中秋节'],
      ['2027-10-01', '2027-10-07', '国庆节']
    ],
    work: ['2027-01-31', '2027-02-14', '2027-05-08', '2027-09-26', '2027-10-09']
  }
};

const pad2 = n => (n < 10 ? '0' + n : '' + n);
const dstr = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const _holidayCache = {};

/* ---------- 无官方数据年份：按法定规则推算连续假期块 ---------- */
const utcDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const shiftDay = (dt, n) => new Date(dt.getTime() + n * DAY_MS);
const isWeekend = dt => dt.getUTCDay() === 0 || dt.getUTCDay() === 6;

/** 向两侧吸收紧邻的周末；若收尾落在周日，再把周一并进来（常见调休做法） */
function absorbWeekend(s, e) {
  let a = s, b = e;
  let guard = 0;
  while (isWeekend(shiftDay(a, -1)) && guard++ < 3) a = shiftDay(a, -1);
  guard = 0;
  while (isWeekend(shiftDay(b, 1)) && guard++ < 3) b = shiftDay(b, 1);
  if (b.getUTCDay() === 0) b = shiftDay(b, 1);
  return [a, b];
}

function estimateBlocks(year, lunarOf) {
  const blocks = [];
  const add = (s, e, name, cap, min) => {
    let end = e;
    if (min && Math.round((end - s) / DAY_MS) + 1 < min) end = shiftDay(s, min - 1);
    if (cap && Math.round((end - s) / DAY_MS) + 1 > cap) end = shiftDay(s, cap - 1);
    blocks.push({ s, e: end, name });
  };
  const ranged = (s, e, name, cap, min) => { const [a, b] = absorbWeekend(s, e); add(a, b, name, cap, min); };

  // 元旦：1/1（含前后周末，上限 3 天）
  ranged(utcDate(year, 1, 1), utcDate(year, 1, 1), '元旦', 3);

  // 春节：除夕 → 正月初六，通常 8-9 天
  const cj = lunarOf(year, 1, 1);              // 正月初一
  if (cj) {
    const eve = shiftDay(utcDate(cj.y, cj.m, cj.d), -1);
    ranged(eve, shiftDay(eve, 6), '春节', 9, 8);
  }

  // 清明：节气当日，通常 3 天
  const qm = solarTermsOfMonth(year, 4).find(t => t.name === '清明');
  if (qm) ranged(utcDate(year, 4, qm.day), utcDate(year, 4, qm.day), '清明节', 3, 3);

  // 劳动节：5/1 - 5/5 固定 5 天
  add(utcDate(year, 5, 1), utcDate(year, 5, 5), '劳动节', 5);

  // 端午 / 中秋：当日 + 相邻周末（上限 3 天）
  const dw = lunarOf(year, 5, 5);
  if (dw) ranged(utcDate(dw.y, dw.m, dw.d), utcDate(dw.y, dw.m, dw.d), '端午节', 3);
  const zq = lunarOf(year, 8, 15);
  if (zq) ranged(utcDate(zq.y, zq.m, zq.d), utcDate(zq.y, zq.m, zq.d), '中秋节', 3);

  // 国庆：10/1 - 10/7 固定 7 天（若与中秋重叠则合并称呼）
  const zqKey = zq ? dstr(zq.y, zq.m, zq.d) : '';
  const overlap = zqKey >= dstr(year, 10, 1) && zqKey <= dstr(year, 10, 7);
  add(utcDate(year, 10, 1), utcDate(year, 10, 7), overlap ? '国庆节·中秋节' : '国庆节', 7);

  return blocks;
}

/**
 * 某年的节假日表： { '2026-02-17': {type:'off'|'work', name:'春节', est?:true} }
 * 有官方数据用官方安排，其余年份按法定规则推算（不含调休上班日）
 */
export function getHolidayMap(year) {
  if (_holidayCache[year]) return _holidayCache[year];
  const map = {};
  const official = OFFICIAL[year];
  const paint = (cur, end, name, est) => {
    while (cur <= end) {
      map[dstr(cur.getUTCFullYear(), cur.getUTCMonth() + 1, cur.getUTCDate())] = { type: 'off', name, est };
      cur = shiftDay(cur, 1);
    }
  };

  if (official) {
    for (const [s, e, name] of official.off) {
      const a = s.split('-').map(Number), b = e.split('-').map(Number);
      paint(utcDate(a[0], a[1], a[2]), utcDate(b[0], b[1], b[2]), name, false);
    }
    for (const w of official.work) map[w] = { type: 'work', name: '调休上班' };
  } else {
    for (const b of estimateBlocks(year, lunar2solar)) paint(b.s, b.e, b.name, true);
  }
  _holidayCache[year] = map;
  return map;
}

/* ---------------- 节日聚合 ---------------- */
/** 某日的假期信息（跨年假期：12 月底 / 1 月初会借用相邻年份的表） */
export function holidayOf(y, m, d) {
  const key = dstr(y, m, d);
  let h = getHolidayMap(y)[key];
  if (!h && m === 12 && d >= 24) h = getHolidayMap(y + 1)[key];
  if (!h && m === 1 && d <= 6) h = getHolidayMap(y - 1)[key];
  return h || null;
}

function nthWeekdayFestival(y, m, weekday, nth) {
  // 第 nth 个 weekday（0=周日）所在日
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  let day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return day;
}

/**
 * 汇总某日全部「标签」
 * @returns {{festivals:string[], term:string|null, holiday:object|null, lunar:object}}
 */
export function dayInfo(y, m, d) {
  const lunar = solar2lunar(y, m, d);
  const festivals = [];
  const term = getTermName(y, m, d);
  const holiday = holidayOf(y, m, d);

  if (lunar) {
    // 除夕
    const isLastDay = lunar.lDay === lunar.monthDays && !lunar.isLeap;
    if (isLastDay && lunar.lMonth === 12) festivals.push('除夕');
    const lf = LUNAR_FESTIVAL[`${lunar.lMonth}-${lunar.lDay}`];
    if (lf && !lunar.isLeap) festivals.push(lf);
  }
  // 公历节日
  const sf = SOLAR_FESTIVAL[`${m}-${d}`];
  if (sf) festivals.push(sf);

  // 浮动节日
  if (m === 5 && d === nthWeekdayFestival(y, 5, 0, 2)) festivals.push('母亲节');
  if (m === 6 && d === nthWeekdayFestival(y, 6, 0, 3)) festivals.push('父亲节');
  if (m === 11 && d === nthWeekdayFestival(y, 11, 4, 4)) festivals.push('感恩节');

  return { lunar, term, holiday, festivals: [...new Set(festivals)] };
}

/** 单元格副标题：节日 > 节气 > 初一显示月份 > 日 */
export function cellLabel(info) {
  if (info.festivals.length) return info.festivals[0];
  if (info.term) return info.term;
  if (info.lunar && info.lunar.lDay === 1) return info.lunar.monthName;
  return info.lunar ? info.lunar.dayName : '';
}

/** 是否为放假日 / 调休上班日 */
export function isOffDay(y, m, d) { const h = holidayOf(y, m, d); return !!h && h.type === 'off'; }
export function isWorkDay(y, m, d) { const h = holidayOf(y, m, d); return !!h && h.type === 'work'; }

/** 星期中文（0=周日） */
export function weekCn(i) { return '星期' + WEEK_CN[i]; }
export function weekShort(i) { return '周' + WEEK_CN[i]; }

/** 星座 */
export function xingzuo(m, d) {
  const s = ['摩羯', '水瓶', '双鱼', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯'];
  const edge = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const i = d < edge[m - 1] ? m - 1 : m;
  return s[i] + '座';
}

export const LunarConst = { GAN, ZHI, ANIMALS, MONTH_CN, DAY_CN, WEEK_CN, TERM_NAMES };
