package cn.rili.calendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 跨天刷新桌面图标：每天 0 点闹钟、开机、改时间/时区、升级后各触发一次。
 */
public class DayIconReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        try {
            if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
                // 刚覆盖安装：桌面可能还缓存着升级前的图标，强制让桌面重新取一次
                IconSwitcher.forceRefresh(context);
            } else {
                IconSwitcher.sync(context);
            }
        } catch (Exception ignored) {
        }
    }
}
