/* ---------- 原生闹钟桥（APK 内才有） ----------
 *
 * 为什么不用 LocalNotifications：它只「叮」一声，走通知音量，静音/震动模式下可能没声，
 * 而且必须由网页层先建好通知渠道。这里改成自带的 CalendarAlarm：
 * 注册到系统闹钟（AlarmManager）、到点用前台服务走「闹钟音量」循环响铃 + 震动。
 */

export function alarmPlugin() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CalendarAlarm) || null;
  } catch (e) {
    return null;
  }
}

export const hasNativeAlarm = () => !!alarmPlugin();

/** 用清单整体替换系统里的闹钟 */
export async function scheduleAlarms(items) {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.schedule({ items });
  } catch (e) {
    console.warn('排程提醒失败', e);
    return null;
  }
}

export async function clearAlarms() {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.cancelAll();
  } catch (e) {
    return null;
  }
}

export async function alarmStatus() {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.status();
  } catch (e) {
    return null;
  }
}

export async function requestNotificationPermission() {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.ensureNotifications();
  } catch (e) {
    return null;
  }
}

export async function openSystemSetting(which) {
  const P = alarmPlugin();
  if (!P) return false;
  try {
    await P.openSettings({ which });
    return true;
  } catch (e) {
    return false;
  }
}

/** 排一条几秒后的测试闹钟，用来确认真的会响 */
export async function testAlarm(seconds = 6) {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.test({ seconds });
  } catch (e) {
    return null;
  }
}

/** 立刻响（设置页「试听铃声」） */
export async function ringNow(title = '提醒', body = '现在听到的就是到点时的铃声') {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.ringNow({ title, body });
  } catch (e) {
    return null;
  }
}

export async function stopRing() {
  const P = alarmPlugin();
  if (!P) return null;
  try {
    return await P.stopRing();
  } catch (e) {
    return null;
  }
}

/** 状态是否「完全正常」 */
export function statusHealthy(st) {
  if (!st) return false;
  return !!st.notifications && !!st.exact && !st.muted;
}
