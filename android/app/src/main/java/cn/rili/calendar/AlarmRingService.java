package cn.rili.calendar;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;

/**
 * 响铃服务：真正让手机「响起来」的地方。
 *
 * <p>为什么不用普通通知：普通通知只「叮」一声，走通知音量，静音/震动模式下还可能没声。
 * 这里走 {@link AudioManager#STREAM_ALARM} 闹钟通道 + 循环播放 + 震动，并且用前台服务
 * 保证不被系统回收，直到用户点「关闭」或 60 秒后自动停。</p>
 */
public class AlarmRingService extends Service {

    public static final String ACTION_RING = "cn.rili.calendar.RING";
    public static final String ACTION_STOP = "cn.rili.calendar.RING_STOP";
    public static final String ACTION_SNOOZE = "cn.rili.calendar.RING_SNOOZE";

    private static final int NOTIF_ID = 9301;
    private static final int REQ_STOP = 9302;
    private static final int REQ_SNOOZE = 9303;
    private static final int REQ_OPEN = 9304;
    private static final long AUTO_STOP_MS = 60_000L;

    private MediaPlayer player;
    private Vibrator vibrator;
    private AudioManager audio;
    private Handler handler;
    private String title = "提醒";
    private String body = "";
    private int savedAlarmVolume = -1;

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        AlarmScheduler.ensureChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 被系统以 START_STICKY 重启时 intent 为 null：没有内容可响，直接退出，避免莫名其妙半夜响铃
        if (intent == null) {
            stopEverything();
            return START_NOT_STICKY;
        }
        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            stopEverything();
            return START_NOT_STICKY;
        }

        if (ACTION_SNOOZE.equals(action)) {
            AlarmScheduler.snooze(this, title, body, 5);
            stopEverything();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            String t = intent.getStringExtra("title");
            String b = intent.getStringExtra("body");
            if (t != null && t.length() > 0) title = t;
            body = b == null ? "" : b;
        }

        // 必须在 5 秒内进入前台，否则 ANR
        startAsForeground();

        // 重新来一次时，先把上一轮的停掉
        stopSound();
        startSound();
        startVibrate();

        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                stopEverything();
            }
        }, AUTO_STOP_MS);

        return START_NOT_STICKY;
    }

    /* ================= 前台通知 ================= */

    private void startAsForeground() {
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            try {
                startForeground(NOTIF_ID, n);
            } catch (Exception ignored) {
            }
        }
    }

    private Notification buildNotification() {
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) piFlags |= PendingIntent.FLAG_IMMUTABLE;

        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, REQ_OPEN, open, piFlags);

        Intent stop = new Intent(this, AlarmRingService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, REQ_STOP, stop, piFlags);

        Intent snooze = new Intent(this, AlarmRingService.class).setAction(ACTION_SNOOZE);
        PendingIntent snoozePi = PendingIntent.getService(this, REQ_SNOOZE, snooze, piFlags);

        return new NotificationCompat.Builder(this, AlarmScheduler.CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(openPi)
                .setFullScreenIntent(openPi, true)
                .addAction(0, "关闭", stopPi)
                .addAction(0, "5 分钟后", snoozePi)
                .build();
    }

    /** 点「关闭」后把常驻通知也撤掉 */
    private void cancelNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_ID);
        } catch (Exception ignored) {
        }
    }

    /* ================= 声音 ================= */

    private void startSound() {
        try {
            audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                int max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                int cur = audio.getStreamVolume(AudioManager.STREAM_ALARM);
                savedAlarmVolume = cur;
                // 闹钟音量被调到 0 时用户根本听不到，这里临时抬到 60% 以上，停止时还原
                int target = Math.max(cur, Math.max(1, max * 3 / 5));
                if (target > cur) audio.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
            }
        } catch (Exception ignored) {
        }

        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, AlarmScheduler.alarmSoundUri(this));
            player.setLooping(true);
            if (Build.VERSION.SDK_INT >= 21) {
                player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            }
            player.prepare();
            player.start();
        } catch (Exception e) {
            player = null;
            // 铃声文件取不到时至少弹通知（走同一渠道，有声音）
            AlarmScheduler.postFallback(this, title, body);
        }
    }

    private void stopSound() {
        try {
            if (player != null) {
                if (player.isPlaying()) player.stop();
                player.release();
            }
        } catch (Exception ignored) {
        }
        player = null;
    }

    private void restoreVolume() {
        try {
            if (audio != null && savedAlarmVolume >= 0) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0);
            }
        } catch (Exception ignored) {
        }
        savedAlarmVolume = -1;
    }

    /* ================= 震动 ================= */

    private void startVibrate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = new long[]{0, 700, 500, 700, 500};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {
        }
    }

    private void stopVibrate() {
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Exception ignored) {
        }
        vibrator = null;
    }

    /* ================= 生命周期 ================= */

    private void stopEverything() {
        stopSound();
        stopVibrate();
        restoreVolume();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {
        }
        cancelNotification();
        if (handler != null) handler.removeCallbacksAndMessages(null);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopSound();
        stopVibrate();
        restoreVolume();
        cancelNotification();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
