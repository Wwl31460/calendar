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
        IconSwitcher.sync(context);
    }
}
