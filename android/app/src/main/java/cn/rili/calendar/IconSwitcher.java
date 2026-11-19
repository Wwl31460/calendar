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
    /** 一次排 7 天的零点，某一天被系统吞掉也不会断链 */
    private static final int TICK_DAYS = 7;
    /** 当天再加几个「只是检查一下日期」的兜底时刻（9:00 / 14:00 / 20:00） */
    private static final int[][] SAME_DAY_PROBES = {{9, 0}, {14, 0}, {20, 0}};

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

    /** 今日图标上写的内容，例如「11月7日 星期六」，用于设置页展示与自检 */
    public static String todayLabel() {
        Calendar c = Calendar.getInstance();
        int dow = c.get(Calendar.DAY_OF_WEEK);
        String[] cn = {"星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"};
        return (c.get(Calendar.MONTH) + 1) + "月" + c.get(Calendar.DAY_OF_MONTH) + "日 "
                + cn[dow - Calendar.SUNDAY];
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
            scheduleWindow(app);
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
        scheduleWindow(app);
    }

    /**
     * 这个 alias 现在是不是「真的启用」。
     *
     * 注意：清单里所有 alias 都写的是 enabled="false"，所以返回 DEFAULT 并不等于启用，
     * 还要看清单里的值——不然会把「其实关着」当成「已经开着」，该切的图标切不过去。
     */
    private static boolean isOn(PackageManager pm, String pkg, String alias) {
        try {
            ComponentName cn = new ComponentName(pkg, pkg + "." + alias);
            int st = pm.getComponentEnabledSetting(cn);
            if (st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return true;
            if (st == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                    || st == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
                    || st == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED) {
                return false;
            }
            // DEFAULT：以清单为准（清单里若 enabled=false，这里会查不到该组件）
            android.content.pm.ActivityInfo ai = pm.getActivityInfo(cn, 0);
            return ai != null && ai.enabled;
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

    /**
     * 排好接下来一段时间的「跨天检查」。
     *
     * <p>为什么不止一个闹钟：只排下一次零点，只要那一次被系统吞掉（国产 ROM 省电策略、
     * 强制停止、偶发丢广播），链条就断了，之后只能等用户打开 App 才恢复——这正是
     * 「图标要等我点开 App 才变」的根因。这里一次排 7 天的零点，外加当天 3 个检查点，
     * 任何一次触发都会把整组重新排一遍，形成自愈。</p>
     */
    static void scheduleWindow(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        long now = System.currentTimeMillis();

        // 1) 未来 7 天的零点后 20 秒
        for (int i = 0; i < TICK_DAYS; i++) {
            Calendar c = Calendar.getInstance();
            c.add(Calendar.DAY_OF_YEAR, i);
            c.set(Calendar.HOUR_OF_DAY, 0);
            c.set(Calendar.MINUTE, 0);
            c.set(Calendar.SECOND, 20);
            c.set(Calendar.MILLISECOND, 0);
            long at = c.getTimeInMillis();
            if (at <= now) continue;
            setAlarm(am, context, REQ_TICK + i, at);
        }

        // 2) 当天几个兜底检查时刻（日期没变时 sync() 会直接返回，几乎零开销）
        Calendar probe = Calendar.getInstance();
        for (int i = 0; i < SAME_DAY_PROBES.length; i++) {
            probe.setTimeInMillis(now);
            probe.set(Calendar.HOUR_OF_DAY, SAME_DAY_PROBES[i][0]);
            probe.set(Calendar.MINUTE, SAME_DAY_PROBES[i][1]);
            probe.set(Calendar.SECOND, 5);
            probe.set(Calendar.MILLISECOND, 0);
            long at = probe.getTimeInMillis();
            if (at <= now) continue;
            setAlarm(am, context, REQ_TICK + 20 + i, at);
        }
    }

    private static void setAlarm(AlarmManager am, Context context, int req, long at) {
        Intent tick = new Intent(context, DayIconReceiver.class).setAction(TICK_ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(context, req, tick, flags());
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

    /**
     * 只保证「闹钟都排上了」，不动桌面图标。
     *
     * <p>App 启动时调用：此时如果立刻禁用「刚刚点进来的那张图标」，系统会把当前任务一起
     * 结束掉（用户看到的就是「点开闪退」）。真正的切换放到 onStop 之后。</p>
     */
    public static void ensureScheduled(Context context) {
        if (context == null) return;
        try {
            scheduleWindow(context.getApplicationContext());
        } catch (Exception ignored) {
        }
    }

    private static int flags() {
        return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    /**
     * 强制让桌面重新读一遍图标。
     *
     * 只在「刚升级完」时调用：此时 SharedPreferences 里记的 alias 已经是今天这个，
     * {@link #sync} 会认为「无需改动」直接返回，而桌面仍可能显示升级前的旧图标缓存。
     * 这里把今天这个 alias 先关再开（同一进程内连续两次调用，最终状态仍是启用），
     * 桌面收到 PACKAGE_CHANGED 就会重新取图标。
     */
    public static void forceRefresh(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        String target = todayAlias();
        PackageManager pm = app.getPackageManager();
        String pkg = app.getPackageName();
        try {
            setState(pm, pkg, target, false);
            setState(pm, pkg, target, true);
        } catch (Exception ignored) {
        }
        app.getSharedPreferences(PREF, Context.MODE_PRIVATE)
                .edit().putString(KEY, target).apply();
        scheduleWindow(app);
    }
}
