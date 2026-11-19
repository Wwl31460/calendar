package cn.rili.calendar;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 提醒闹钟的调度中心。
 *
 * <p>网页层把「未来 40 天里每一条要响的提醒」算好交给这里，原生只用
 * {@link AlarmManager} 精确排程；到点由 {@link AlarmReceiver} 拉起
 * {@link AlarmRingService} 真正响铃（走闹钟音量、锁屏也能响）。</p>
 *
 * <p>这样即使 App 被划掉、系统进入休眠，提醒依然会响。</p>
 */
public final class AlarmScheduler {

    /** 闹钟通知渠道：高优先级 + 闹钟音量 + 震动。渠道一旦创建，属性就不能改，所以带版本号 */
    public static final String CHANNEL_ID = "alarm_v2";
    public static final String CHANNEL_NAME = "提醒闹钟";

    static final String ACTION_FIRE = "cn.rili.calendar.ALARM_FIRE";

    private static final String PREFS = "cal_alarms";
    private static final String KEY = "items";
    private static final int REQ_BASE = 8100;

    private AlarmScheduler() {
    }

    /** 一条已排程的提醒 */
    static final class Alarm {
        String id = "";
        int req = REQ_BASE;
        long at;
        String title = "提醒";
        String body = "";
        String kind = "reminder";

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("id", id);
                o.put("req", req);
                o.put("at", at);
                o.put("title", title);
                o.put("body", body);
                o.put("kind", kind);
            } catch (Exception ignored) {
            }
            return o;
        }

        static Alarm fromJson(JSONObject o) {
            Alarm a = new Alarm();
            a.id = o.optString("id", "");
            a.req = o.optInt("req", REQ_BASE);
            a.at = o.optLong("at", 0);
            a.title = o.optString("title", "提醒");
            a.body = o.optString("body", "");
            a.kind = o.optString("kind", "reminder");
            return a;
        }
    }

    /* ================= 通知渠道 ================= */

    static Uri alarmSoundUri(Context ctx) {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }

    private static AudioAttributes alarmAttrs() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    /** 建渠道；已存在则什么都不做（用户手动改过的设置不会被覆盖） */
    static void ensureChannel(Context ctx) {
        if (ctx == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("日历里的提醒到点时响铃与震动");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 700, 500, 700, 500, 700});
        ch.setSound(alarmSoundUri(ctx), alarmAttrs());
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setShowBadge(true);
        try {
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {
        }
    }

    /* ================= 权限 / 能力 ================= */

    static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        } catch (Exception e) {
            return false;
        }
    }

    static boolean notificationsOn(Context ctx) {
        try {
            return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
        } catch (Exception e) {
            return true;
        }
    }

    static boolean batteryIgnored(Context ctx) {
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    /* ================= 排程 ================= */

    private static PendingIntent fireIntent(Context ctx, Alarm a, boolean create) {
        Intent i = new Intent(ctx, AlarmReceiver.class)
                .setAction(ACTION_FIRE)
                .putExtra("id", a.id)
                .putExtra("title", a.title)
                .putExtra("body", a.body)
                .putExtra("kind", a.kind);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        if (!create) flags = PendingIntent.FLAG_NO_CREATE | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, a.req, i, flags);
    }

    /** 单条排程：优先精确闹钟；没有精确闹钟权限时退化为「允许休眠时触发」 */
    static boolean scheduleOne(Context ctx, Alarm a) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || a.at <= 0) return false;
        PendingIntent pi = fireIntent(ctx, a, true);
        try {
            if (canExact(ctx)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, pi);
            }
            return true;
        } catch (SecurityException se) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, a.at, pi);
                return true;
            } catch (Exception e) {
                return false;
            }
        } catch (Exception e) {
            return false;
        }
    }

    static void cancelOne(Context ctx, Alarm a) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = fireIntent(ctx, a, false);
            if (am != null && pi != null) am.cancel(pi);
            if (pi != null) pi.cancel();
        } catch (Exception ignored) {
        }
    }

    /* ================= 持久化 ================= */

    private static List<Alarm> load(Context ctx) {
        List<Alarm> list = new ArrayList<>();
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String s = sp.getString(KEY, "[]");
            JSONArray arr = new JSONArray(s == null ? "[]" : s);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) list.add(Alarm.fromJson(o));
            }
        } catch (Exception ignored) {
        }
        return list;
    }

    private static void store(Context ctx, List<Alarm> list) {
        JSONArray arr = new JSONArray();
        for (Alarm a : list) arr.put(a.toJson());
        try {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit().putString(KEY, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** 清空所有已排程的闹钟（含系统里的） */
    static void cancelAll(Context ctx) {
        for (Alarm a : load(ctx)) cancelOne(ctx, a);
        store(ctx, new ArrayList<Alarm>());
    }

    /**
     * 用网页层算好的清单整体替换。
     * 返回实际排上的条数（超过上限的部分会被丢弃，避免占满系统闹钟配额）。
     */
    static int save(Context ctx, JSArray items) {
        ensureChannel(ctx);

        // 1. 先撤掉旧的
        for (Alarm old : load(ctx)) cancelOne(ctx, old);

        long now = System.currentTimeMillis();
        List<Alarm> list = new ArrayList<>();
        int max = 200;
        if (items != null) {
            for (int i = 0; i < items.length() && list.size() < max; i++) {
                try {
                    JSONObject o = items.getJSONObject(i);
                    if (o == null) continue;
                    Alarm a = new Alarm();
                    a.id = o.optString("id", "");
                    a.at = o.optLong("at", 0);
                    a.title = o.optString("title", "提醒");
                    a.body = o.optString("body", "");
                    a.kind = o.optString("kind", "reminder");
                    if (a.at <= now + 1000) continue;      // 已经过去的不要
                    a.req = REQ_BASE + list.size();
                    list.add(a);
                } catch (Exception ignored) {
                }
            }
        }

        // 2. 再全部排上
        List<Alarm> ok = new ArrayList<>();
        for (Alarm a : list) {
            if (scheduleOne(ctx, a)) ok.add(a);
        }
        store(ctx, ok);
        return ok.size();
    }

    /** 开机 / 改时间 / 升级后：把还在未来的重新排一遍 */
    static void rescheduleAll(Context ctx) {
        ensureChannel(ctx);
        List<Alarm> old = load(ctx);
        if (old.isEmpty()) return;
        long now = System.currentTimeMillis();

        // 先全部撤掉，避免改过时间后旧 PendingIntent 与新的一起触发（重复响铃）
        for (Alarm a : old) cancelOne(ctx, a);

        List<Alarm> keep = new ArrayList<>();
        for (Alarm a : old) {
            if (a.at > now + 5000) keep.add(a);
        }
        for (int i = 0; i < keep.size(); i++) {
            keep.get(i).req = REQ_BASE + i;
            scheduleOne(ctx, keep.get(i));
        }
        store(ctx, keep);
    }

    /** 「5 分钟后再响」：不写进持久化清单，只排这一次 */
    static void snooze(Context ctx, String title, String body, int minutes) {
        ensureChannel(ctx);
        Alarm a = new Alarm();
        a.id = "snooze_" + System.currentTimeMillis();
        a.req = 9500 + (int) (System.currentTimeMillis() % 400);
        a.at = System.currentTimeMillis() + Math.max(1, minutes) * 60_000L;
        a.title = title == null || title.length() == 0 ? "提醒" : title;
        a.body = body == null ? "" : body;
        a.kind = "snooze";
        scheduleOne(ctx, a);
    }

    /** 服务被系统拦下时的兜底：直接弹一条带声音的通知 */
    static void postFallback(Context ctx, String title, String body) {
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, 9101, open, flags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setOnlyAlertOnce(false);
        try {
            NotificationManagerCompat.from(ctx).notify(9200, b.build());
        } catch (Exception ignored) {
        }
    }

    /* ================= 状态自检 ================= */

    static JSObject status(Context ctx) {
        ensureChannel(ctx);
        JSObject o = new JSObject();
        o.put("notifications", notificationsOn(ctx));
        o.put("exact", canExact(ctx));
        o.put("batteryOk", batteryIgnored(ctx));
        o.put("scheduled", load(ctx).size());
        o.put("channel", hasChannel(ctx));

        // 闹钟音量：为 0 时系统会静音，界面上要提示
        try {
            android.media.AudioManager am = (android.media.AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int vol = am.getStreamVolume(android.media.AudioManager.STREAM_ALARM);
                int max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM);
                o.put("alarmVolume", vol);
                o.put("alarmVolumeMax", max);
                o.put("muted", vol <= 0);
            }
        } catch (Exception ignored) {
        }
        return o;
    }

    private static boolean hasChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.getNotificationChannel(CHANNEL_ID) != null;
        } catch (Exception e) {
            return false;
        }
    }
}
