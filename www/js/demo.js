/* ---------- 演示数据（仅在 ?demo=1 且数据为空时注入） ---------- */
import { addCourse, addNote, addReminder, db, persist, setSetting } from './store.js';
import { addDays, pad2, startOfWeek, todayStr, ymd } from './utils.js';
import { solar2lunar } from './lunar.js';

export function seed() {
  if (db.courses.length || db.notes.length || db.reminders.length) return;

  const mon = startOfWeek(new Date(), 1);
  const semesterStart = addDays(mon, -10 * 7);
  setSetting('semesterStart', ymd(semesterStart));
  setSetting('totalWeeks', 20);

  const courses = [
    { name: '高等数学', teacher: '王建国', room: '教三 305', weekday: 1, start: 1, end: 2, color: 0 },
    { name: '大学英语', teacher: 'Linda', room: '外语楼 201', weekday: 1, start: 3, end: 4, color: 1 },
    { name: '数据结构', teacher: '李慧', room: '计算机楼 402', weekday: 2, start: 3, end: 4, color: 2 },
    { name: '线性代数', teacher: '陈峰', room: '教二 108', weekday: 2, start: 5, end: 6, color: 3 },
    { name: '计算机网络', teacher: '赵明', room: '计算机楼 305', weekday: 3, start: 1, end: 2, color: 4 },
    { name: '体育（篮球）', teacher: '刘强', room: '体育馆', weekday: 3, start: 7, end: 8, color: 5 },
    { name: '马克思主义基本原理', teacher: '孙丽', room: '文科楼 501', weekday: 4, start: 3, end: 4, color: 6 },
    { name: '操作系统', teacher: '周涛', room: '计算机楼 401', weekday: 4, start: 5, end: 6, color: 7 },
    { name: '大学物理', teacher: '吴宇', room: '理科楼 203', weekday: 5, start: 1, end: 2, color: 0 },
    { name: '程序设计实验', teacher: '李慧', room: '机房 A', weekday: 5, start: 3, end: 4, color: 2 }
  ];
  const allWeeks = Array.from({ length: 16 }, (_, i) => i + 1);
  courses.forEach(c => addCourse({ ...c, weeks: allWeeks }));

  const today = todayStr();
  addReminder({
    title: '交数据结构作业',
    note: '第 5 章习题，提交到教学平台',
    date: today,
    time: '20:00',
    repeat: 'none'
  });
  addReminder({
    title: '每天喝水打卡',
    date: today,
    time: '10:30',
    repeat: 'daily'
  });
  const birthday = solar2lunar(1998, 9, 12);
  addReminder({
    title: '妈妈生日 🎂',
    note: '提前订蛋糕',
    date: today,
    time: '09:00',
    repeat: 'lunar',
    lunar: { m: birthday.lMonth, d: birthday.lDay }
  });
  addReminder({
    title: '期末复习计划启动',
    date: ymd(addDays(new Date(), 3)),
    time: '19:30',
    repeat: 'none'
  });

  const d = new Date();
  addNote({
    date: today,
    time: '08:40',
    text: '早上七点起床，去图书馆占到了靠窗的位置。\n高数第三章的极限部分终于搞懂了，关键是把夹逼定理的条件记清楚。'
  });
  addNote({
    date: today,
    time: '12:15',
    text: '和室友去二食堂吃了麻辣香锅，有点咸，下次让他少放酱。'
  });
  addNote({
    date: ymd(addDays(d, -1)),
    time: '21:30',
    text: '晚上跑步 3 公里，配速 6\'20"，比上周快了半分钟。'
  });
  addNote({
    date: ymd(addDays(d, -3)),
    time: '16:00',
    text: '课表拿到了，这学期周一上午满课，得早起了。'
  });

  persist();
  setTimeout(() => window.__refresh && window.__refresh(), 120);
}
