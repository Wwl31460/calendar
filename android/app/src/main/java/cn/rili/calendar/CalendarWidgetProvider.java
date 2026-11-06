package cn.rili.calendar;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;

import java.util.Calendar;

/**
 * 桌面小组件：显示当日星期 + 日期 + 农历。
 * 每天零点自动切换，跨天、改时区、开机、升级后都会重新渲染。
 */
public class CalendarWidgetProvider extends AppWidgetProvider {

    private static final String ACTION_TICK = "cn.rili.calendar.WIDGET_TICK";
    private static final int REQ_TICK = 1001;

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        updateAll(context);
        scheduleNextTick(context);
    }

    @Override
    public void onEnabled(Context context) {
        updateAll(context);
        scheduleNextTick(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager mgr, int id, Bundle opts) {
        updateAll(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        if (ACTION_TICK.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            updateAll(context);
            scheduleNextTick(context);
        }
    }

    /** 按当前日期重绘所有小组件实例 */
    public static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        if (mgr == null) return;
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
        if (ids == null || ids.length == 0) return;

        Calendar now = Calendar.getInstance();
        int y = now.get(Calendar.YEAR);
        int m = now.get(Calendar.MONTH) + 1;
        int d = now.get(Calendar.DAY_OF_MONTH);

        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);
        rv.setTextViewText(R.id.widget_week, Lunar.weekdayCn(y, m, d));
        rv.setTextViewText(R.id.widget_day, String.valueOf(d));
        String lunar = Lunar.monthDayText(y, m, d);
        rv.setTextViewText(R.id.widget_lunar, lunar.isEmpty() ? (m + "月") : lunar);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        rv.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, piFlags()));

        for (int id : ids) mgr.updateAppWidget(id, rv);
    }

    private static int piFlags() {
        return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    /** 下一次零点后 30 秒唤醒重绘 */
    private static void scheduleNextTick(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 30);
        next.set(Calendar.MILLISECOND, 0);

        Intent tick = new Intent(context, CalendarWidgetProvider.class).setAction(ACTION_TICK);
        try {
            am.set(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(),
                    PendingIntent.getBroadcast(context, REQ_TICK, tick, piFlags()));
        } catch (Exception ignored) {
            // 部分系统限制后台闹钟时不阻断小组件正常显示
        }
    }
}
