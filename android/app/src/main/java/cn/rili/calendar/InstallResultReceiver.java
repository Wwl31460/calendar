package cn.rili.calendar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/**
 * 接收 PackageInstaller 会话的安装结果。
 *
 * 走会话安装时，APK 字节由我们进程写入系统暂存区，安装器不需要跨应用读取文件，
 * 因此不会出现 MIUI 上「Permission Denial: opening provider ...FileProvider...」的问题。
 */
public class InstallResultReceiver extends BroadcastReceiver {

    public static final String ACTION = "cn.rili.calendar.INSTALL_RESULT";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // 系统需要用户点「安装」：把确认界面拉起来
            Intent confirm = null;
            try {
                Object extra = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (extra instanceof Intent) confirm = (Intent) extra;
            } catch (Exception ignored) {
            }
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(confirm);
                    AppUpdaterPlugin.notifyInstall("confirm", "请在系统窗口中确认安装");
                    return;
                } catch (Exception ignored) {
                }
            }
            AppUpdaterPlugin.notifyInstall("confirm", "请在系统窗口中确认安装");
            return;
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            AppUpdaterPlugin.notifyInstall("success", "安装完成");
            return;
        }

        String reason = explain(status, message);
        AppUpdaterPlugin.notifyInstall("failed", reason);
        try {
            Toast.makeText(context, "安装未完成：" + reason, Toast.LENGTH_LONG).show();
        } catch (Exception ignored) {
        }
    }

    private String explain(int status, String message) {
        if (status == PackageInstaller.STATUS_FAILURE_ABORTED) return "安装已取消";
        if (status == PackageInstaller.STATUS_FAILURE_BLOCKED) return "系统拦截了这次安装（请关闭纯净模式/安全守护后重试）";
        if (status == PackageInstaller.STATUS_FAILURE_CONFLICT) return "与已安装版本冲突（签名或版本号不一致，需先卸载旧版）";
        if (status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) return "与新系统版本不兼容";
        if (status == PackageInstaller.STATUS_FAILURE_INVALID) return "安装包无效或已损坏";
        if (status == PackageInstaller.STATUS_FAILURE_STORAGE) return "手机存储空间不足";
        String m = (message == null) ? "" : message.trim();
        return m.isEmpty() ? "安装失败" : m;
    }
}
