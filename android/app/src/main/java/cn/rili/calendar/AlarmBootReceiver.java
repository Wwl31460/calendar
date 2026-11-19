package cn.rili.calendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 开机 / 改时间 / 改时区 / 覆盖升级后，把未来的提醒重新排进系统闹钟。
 *
 * <p>Android 在重启时会清空所有 AlarmManager 任务，不重新排的话提醒就再也不会响。</p>
 */
public class AlarmBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        try {
            if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                    || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)
                    || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                    || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                    || Intent.ACTION_TIME_CHANGED.equals(action)
                    || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
                AlarmScheduler.rescheduleAll(context);
            }
        } catch (Exception ignored) {
        }
    }
}
