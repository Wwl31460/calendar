package cn.rili.calendar;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用自更新：从 GitHub Release 下载 APK 并拉起系统安装器。
 * 只依赖 Capacitor 自带能力，无需额外第三方库。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String AUTHORITY_SUFFIX = ".updater";

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            android.content.pm.PackageInfo pi = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            ret.put("versionName", pi.versionName);
            long code = (Build.VERSION.SDK_INT >= 28) ? pi.getLongVersionCode() : pi.versionCode;
            ret.put("versionCode", code);
            ret.put("packageName", getContext().getPackageName());
        } catch (Exception e) {
            call.reject("无法读取版本信息");
            return;
        }
        call.resolve(ret);
    }

    /** 是否已获得「安装未知来源应用」权限 */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean can = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                can = getContext().getPackageManager().canRequestPackageInstalls();
            } catch (Exception e) {
                can = true;
            }
        }
        ret.put("value", can);
        call.resolve(ret);
    }

    /** 跳转系统「安装未知应用」授权页 */
    @PluginMethod
    public void openInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e) {
                // 部分定制系统无此页面，退回到应用详情页
                try {
                    Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception ignored) {
                }
            }
        }
        call.resolve();
    }

    /** 后台下载 APK，完成后拉起安装器，过程通过事件回传进度 */
    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final java.util.List<String> urls = new java.util.ArrayList<>();
        com.getcapacitor.JSArray arr = call.getArray("urls");
        if (arr != null) {
            try {
                for (int i = 0; i < arr.length(); i++) {
                    String s = arr.getString(i);
                    if (s != null && !s.isEmpty()) urls.add(s);
                }
            } catch (Exception ignored) {
            }
        }
        if (urls.isEmpty()) {
            String single = call.getString("url");
            if (single != null && !single.isEmpty()) urls.add(single);
        }
        if (urls.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        final String fileName = call.getString("fileName", "calendar-update.apk");

        new Thread(new Runnable() {
            @Override
            public void run() {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    emitError("无法创建缓存目录");
                    return;
                }
                File apk = new File(dir, fileName);

                final String[] lastError = {"网络异常，请稍后重试"};
                for (int i = 0; i < urls.size(); i++) {
                    boolean ok = fetch(urls.get(i), apk, lastError);
                    if (ok) {
                        final File target = apk;
                        post(new Runnable() {
                            @Override
                            public void run() {
                                install(target);
                            }
                        });
                        return;
                    }
                    if (i < urls.size() - 1) {
                        emitProgress(0, 0, 0);
                    }
                }
                emitError(lastError[0]);
            }

            private boolean fetch(String url, File apk, String[] lastError) {
                HttpURLConnection conn = null;
                InputStream in = null;
                FileOutputStream out = null;
                try {
                    if (apk.exists() && !apk.delete()) {
                        return false;
                    }
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(40000);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "CalendarApp-Android");
                    conn.connect();

                    int code = conn.getResponseCode();
                    if (code != HttpURLConnection.HTTP_OK) {
                        lastError[0] = "下载失败（HTTP " + code + "）";
                        return false;
                    }

                    long total = (Build.VERSION.SDK_INT >= 24)
                            ? conn.getContentLengthLong()
                            : (long) conn.getContentLength();
                    in = conn.getInputStream();
                    out = new FileOutputStream(apk);

                    byte[] buf = new byte[16384];
                    long done = 0;
                    int n;
                    int lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                emitProgress(pct / 100.0, done, total);
                            }
                        }
                    }
                    out.flush();
                    out.close();
                    out = null;
                    in.close();
                    in = null;

                    // 简单校验，避免把错误页面当成安装包
                    if (apk.length() < 4096) {
                        apk.delete();
                        lastError[0] = "安装包不完整";
                        return false;
                    }

                    emitProgress(1.0, apk.length(), apk.length());
                    return true;
                } catch (Exception e) {
                    String msg = e.getMessage();
                    lastError[0] = (msg == null || msg.isEmpty()) ? "网络异常，请稍后重试" : msg;
                    return false;
                } finally {
                    try {
                        if (out != null) out.close();
                    } catch (Exception ignored) {
                    }
                    try {
                        if (in != null) in.close();
                    } catch (Exception ignored) {
                    }
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();

        call.resolve();
    }

    private void install(File apk) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !getContext().getPackageManager().canRequestPackageInstalls()) {
                notifyListeners("installPermissionNeeded", new JSObject());
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                return;
            }

            String authority = getContext().getPackageName() + AUTHORITY_SUFFIX;
            Uri uri = FileProvider.getUriForFile(getContext(), authority, apk);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                intent.setClipData(android.content.ClipData.newRawUri("", uri));
            }
            getContext().startActivity(intent);
            notifyListeners("installStarted", new JSObject());
        } catch (Exception e) {
            emitError("无法启动安装器：" + (e.getMessage() == null ? "未知原因" : e.getMessage()));
        }
    }

    private void post(Runnable r) {
        try {
            if (getActivity() != null) {
                getActivity().runOnUiThread(r);
            } else {
                r.run();
            }
        } catch (Exception e) {
            r.run();
        }
    }

    private void emitProgress(final double progress, final long loaded, final long total) {
        final JSObject data = new JSObject();
        data.put("progress", progress);
        data.put("loaded", loaded);
        data.put("total", total);
        post(new Runnable() {
            @Override
            public void run() {
                notifyListeners("downloadProgress", data);
            }
        });
    }

    private void emitError(final String message) {
        final JSObject data = new JSObject();
        data.put("message", message);
        post(new Runnable() {
            @Override
            public void run() {
                notifyListeners("downloadError", data);
            }
        });
    }
}
