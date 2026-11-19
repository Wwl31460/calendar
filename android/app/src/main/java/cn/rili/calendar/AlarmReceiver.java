package cn.rili.calendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

/**
 * 闹钟到点：把「响铃」这件事交给前台服务。
 *
 * <p>精确闹钟的广播在后台是被系统允许启动前台服务的，所以 App 被划掉也能响。</p>
 */
public class AlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!AlarmScheduler.ACTION_FIRE.equals(intent.getAction())) return;

        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String id = intent.getStringExtra("id");
        if (title == null || title.length() == 0) title = "提醒";

        Intent svc = new Intent(context, AlarmRingService.class)
                .setAction(AlarmRingService.ACTION_RING)
                .putExtra("id", id)
                .putExtra("title", title)
                .putExtra("body", body == null ? "" : body);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, svc);
            } else {
                context.startService(svc);
            }
        } catch (Exception e) {
            // 系统限制后台启动服务时，至少把通知弹出来（同样走闹钟渠道，有声音）
            try {
                AlarmScheduler.postFallback(context, title, body == null ? "" : body);
            } catch (Exception ignored) {
            }
        }
    }
}
