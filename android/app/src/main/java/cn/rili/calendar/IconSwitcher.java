package cn.rili.calendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import java.util.Calendar;

/**
 * 桌面图标随日期自动切换。
 *
 * Android 没有「运行时改应用图标」的 API，所以预置了 217 个
 * {@code <activity-alias>}（7 星期 × 31 日），每个 alias 绑定一张图标；
 * 这里只负责把「今天」对应的那一个打开、其余关掉。
 *
 * 触发时机：应用启动、每天 0 点闹钟、开机、改时间/时区、升级后。
 */
public final class IconSwitcher {

    private static final String PREF = "day_icon";
    private static final String KEY = "current";

    private static final String TICK_ACTION = "cn.rili.calendar.ICON_TICK";
    private static final int REQ_TICK = 2002;

    private IconSwitcher() {
    }

    /** 日历日 → alias 名：星期一=1 … 星期日=7 */
    public static String aliasFor(int isoWeekday, int dayOfMonth) {
        return "Day" + isoWeekday + "_" + dayOfMonth;
    }

    public static String todayAlias() {
        Calendar c = Calendar.getInstance();
        int dow = c.get(Calendar.DAY_OF_WEEK);          // 1 = 周日
        int iso = dow == Calendar.SUNDAY ? 7 : dow - 1; // 1 = 周一
        return aliasFor(iso, c.get(Calendar.DAY_OF_MONTH));
    }

    /** 同步今天的图标；无变化时几乎零开销 */
    public static void sync(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        String target = todayAlias();

        SharedPreferences sp = app.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String current = sp.getString(KEY, null);
        PackageManager pm = app.getPackageManager();

        if (target.equals(current) && isOn(pm, app.getPackageName(), target)) {
            scheduleNextDay(app);
            return;
        }

        // 先开新的，再关旧的：避免桌面上图标短暂消失
        setState(pm, app.getPackageName(), target, true);

        if (current != null && !current.equals(target)) {
            setState(pm, app.getPackageName(), current, false);
        } else if (current == null) {
            // 首次运行：把除今天以外、当前处于启用状态的 alias 全部关掉
            for (int w = 1; w <= 7; w++) {
                for (int d = 1; d <= 31; d++) {
                    String name = aliasFor(w, d);
                    if (name.equals(target)) continue;
                    if (isOn(pm, app.getPackageName(), name)) {
                        setState(pm, app.getPackageName(), name, false);
                    }
                }
            }
        }

        sp.edit().putString(KEY, target).apply();
        scheduleNextDay(app);
    }

    private static boolean isOn(PackageManager pm, String pkg, String alias) {
        try {
            int st = pm.getComponentEnabledSetting(new ComponentName(pkg, pkg + "." + alias));
            return st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    || st == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
        } catch (Exception e) {
            return false;
        }
    }

    private static void setState(PackageManager pm, String pkg, String alias, boolean on) {
        try {
            pm.setComponentEnabledSetting(
                    new ComponentName(pkg, pkg + "." + alias),
                    on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
        } catch (Exception ignored) {
        }
    }

    /** 排下一次「零点后 20 秒」的切换闹钟 */
    static void scheduleNextDay(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 20);
        next.set(Calendar.MILLISECOND, 0);

        Intent tick = new Intent(context, DayIconReceiver.class).setAction(TICK_ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(context, REQ_TICK, tick, flags());
        long at = next.getTimeInMillis();
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (Exception e) {
            try {
                am.set(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (Exception ignored) {
            }
        }
    }

    private static int flags() {
        return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}
