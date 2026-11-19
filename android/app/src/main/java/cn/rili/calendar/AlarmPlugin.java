package cn.rili.calendar;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 网页层与原生闹钟之间的桥。
 *
 * <p>方法：schedule / cancelAll / status / test / ringNow / openSettings / ensureNotifications</p>
 */
@CapacitorPlugin(name = "CalendarAlarm")
public class AlarmPlugin extends Plugin {

    private static final int REQ_NOTIF = 9410;

    @Override
    public void load() {
        try {
            AlarmScheduler.ensureChannel(getContext());
        } catch (Exception ignored) {
        }
    }

    /** 用网页层算好的清单整体替换系统里已排的闹钟 */
    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            JSArray items = call.getArray("items");
            int n = AlarmScheduler.save(getContext(), items);
            JSObject ret = new JSObject();
            ret.put("count", n);
            ret.put("exact", AlarmScheduler.canExact(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("排程失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        try {
            AlarmScheduler.cancelAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("取消失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            call.resolve(AlarmScheduler.status(getContext()));
        } catch (Exception e) {
            call.reject("读取状态失败：" + e.getMessage());
        }
    }

    /** 排一条几秒后的测试闹钟，用来确认「真的会响」 */
    @PluginMethod
    public void test(PluginCall call) {
        try {
            Integer sec = call.getInt("seconds");
            int seconds = sec == null ? 6 : Math.max(1, Math.min(300, sec));
            String title = call.getString("title", "测试提醒");
            String body = call.getString("body", "如果你听到铃声，说明提醒功能正常 🎉");

            AlarmScheduler.Alarm a = new AlarmScheduler.Alarm();
            a.id = "test_" + System.currentTimeMillis();
            a.req = 9700 + (int) (System.currentTimeMillis() % 200);
            a.at = System.currentTimeMillis() + seconds * 1000L;
            a.title = title;
            a.body = body;
            a.kind = "test";
            boolean ok = AlarmScheduler.scheduleOne(getContext(), a);

            JSObject ret = new JSObject();
            ret.put("ok", ok);
            ret.put("seconds", seconds);
            ret.put("exact", AlarmScheduler.canExact(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("测试排程失败：" + e.getMessage());
        }
    }

    /** 立刻响铃（设置页「试听」用） */
    @PluginMethod
    public void ringNow(PluginCall call) {
        try {
            String title = call.getString("title", "提醒");
            String body = call.getString("body", "现在听到的就是到点时的铃声");
            Intent svc = new Intent(getContext(), AlarmRingService.class)
                    .setAction(AlarmRingService.ACTION_RING)
                    .putExtra("id", "manual")
                    .putExtra("title", title)
                    .putExtra("body", body);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), svc);
            } else {
                getContext().startService(svc);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("启动响铃失败：" + e.getMessage());
        }
    }

    @PluginMethod
    public void stopRing(PluginCall call) {
        try {
            Intent svc = new Intent(getContext(), AlarmRingService.class)
                    .setAction(AlarmRingService.ACTION_STOP);
            getContext().startService(svc);
            call.resolve();
        } catch (Exception e) {
            call.reject("停止失败：" + e.getMessage());
        }
    }

    /** Android 13+ 的通知权限，系统弹窗就这一次 */
    @PluginMethod
    public void ensureNotifications(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
                if (!granted && getActivity() != null) {
                    ActivityCompat.requestPermissions(getActivity(),
                            new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                }
                ret.put("requested", !granted);
                ret.put("granted", granted);
            } else {
                ret.put("requested", false);
                ret.put("granted", AlarmScheduler.notificationsOn(getContext()));
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("请求通知权限失败：" + e.getMessage());
        }
    }

    /** 跳到对应的系统设置页，让用户手动放行 */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "notifications");
        try {
            String pkg = getContext().getPackageName();
            Intent i;
            if ("exact".equals(which)) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
                } else {
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                }
            } else if ("battery".equals(which)) {
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
            } else if ("sound".equals(which)) {
                i = new Intent(Settings.ACTION_SOUND_SETTINGS);
            } else if ("autostart".equals(which)) {
                // 国产 ROM 的「自启动 / 后台运行」白名单：各家页面不同，挨个试
                if (openAutostart()) {
                    call.resolve();
                    return;
                }
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            } else {
                i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            // 某些机型没有对应设置页，退化为应用详情
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("打不开系统设置：" + e2.getMessage());
            }
        }
    }

    /** 已知厂商的自启动管理页；打不开就返回 false */
    private boolean openAutostart() {
        String[][] targets = {
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
                {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
                {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
                {"com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"},
                {"com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity"},
                {"com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"},
                {"com.lenovo.security", "com.lenovo.security.ui.activity.AutoStartManagerActivity"}
        };
        for (String[] t : targets) {
            try {
                Intent i = new Intent().setComponent(new android.content.ComponentName(t[0], t[1]))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (getContext().getPackageManager().resolveActivity(i, 0) != null) {
                    getContext().startActivity(i);
                    return true;
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }
}
