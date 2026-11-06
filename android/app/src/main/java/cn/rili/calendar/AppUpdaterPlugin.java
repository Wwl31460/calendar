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
        // Release 上声明的文件大小，用来识破被截断的下载
        final long expectSize = call.getLong("expectSize", 0L);

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
                    boolean ok = fetch(urls.get(i), apk, expectSize, lastError);
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

            private boolean fetch(String url, File apk, long expectSize, String[] lastError) {
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

                    // 镜像偶尔会返回错误网页而不是文件，直接把网页写进 .apk 会装不上
                    String ctype = conn.getContentType();
                    if (ctype != null) {
                        String low = ctype.toLowerCase();
                        if (low.contains("text/html") || low.contains("application/json")) {
                            lastError[0] = "下载源返回的是网页，已自动换源";
                            return false;
                        }
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

                    // ---- 这里是关键：装之前必须确认下下来的真的是可安装的 APK ----
                    // 1) 字节数与服务端声明一致（防止半截文件）
                    if (expectSize > 0 && apk.length() != expectSize) {
                        apk.delete();
                        lastError[0] = "下载不完整（" + apk.length() + "/" + expectSize + " 字节）";
                        return false;
                    }
                    // 2) 至少要有像样的体积
                    if (apk.length() < 32768) {
                        apk.delete();
                        lastError[0] = "安装包体积异常，已自动换源";
                        return false;
                    }
                    // 3) ZIP 结构与包信息（包名 / 签名 / 版本）
                    String bad = validateApk(apk);
                    if (bad != null) {
                        apk.delete();
                        lastError[0] = bad;
                        return false;
                    }

                    apk.setReadable(true, false);
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

    /**
     * 校验下载到的文件是不是一个「能装上」的 APK。
     * 返回 null 表示合格，否则返回给用户看的原因。
     */
    @SuppressWarnings("deprecation")
    private String validateApk(File apk) {
        // (1) ZIP 魔数 PK\x03\x04
        java.io.RandomAccessFile raf = null;
        try {
            raf = new java.io.RandomAccessFile(apk, "r");
            byte[] magic = new byte[4];
            if (raf.read(magic) != 4
                    || magic[0] != 0x50 || magic[1] != 0x4B || magic[2] != 0x03 || magic[3] != 0x04) {
                return "下载内容不是安装包，已自动换源";
            }
        } catch (Exception e) {
            return "无法读取下载内容";
        } finally {
            try {
                if (raf != null) raf.close();
            } catch (Exception ignored) {
            }
        }

        // (2) 压缩包结构完整，且含有清单与代码
        try {
            java.util.zip.ZipFile zf = new java.util.zip.ZipFile(apk);
            try {
                if (zf.getEntry("AndroidManifest.xml") == null || zf.getEntry("classes.dex") == null) {
                    return "安装包结构不完整";
                }
            } finally {
                zf.close();
            }
        } catch (Exception e) {
            return "安装包已损坏，请重新下载";
        }

        // (3) 系统能否解析出包信息
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        android.content.pm.PackageInfo target;
        try {
            target = pm.getPackageArchiveInfo(apk.getAbsolutePath(),
                    android.content.pm.PackageManager.GET_SIGNATURES);
        } catch (Exception e) {
            target = null;
        }
        if (target == null) return "系统无法识别该安装包，请重新下载";

        String self = getContext().getPackageName();
        if (!self.equals(target.packageName)) return "安装包不是「日历」应用";

        // (4) 签名必须与当前已安装的一致，否则系统会拒绝覆盖安装
        android.content.pm.PackageInfo cur;
        try {
            cur = pm.getPackageInfo(self, android.content.pm.PackageManager.GET_SIGNATURES);
        } catch (Exception e) {
            return "无法读取当前版本信息";
        }
        if (!sameSignature(cur, target)) {
            return "新版本签名与当前版本不一致，无法覆盖安装";
        }

        // (5) 版本号要更高，否则是白装
        long curCode = (Build.VERSION.SDK_INT >= 28) ? cur.getLongVersionCode() : cur.versionCode;
        long newCode = (Build.VERSION.SDK_INT >= 28) ? target.getLongVersionCode() : target.versionCode;
        if (newCode < curCode) return "下载到的版本比当前版本还旧";

        return null;
    }

    private boolean sameSignature(android.content.pm.PackageInfo a, android.content.pm.PackageInfo b) {
        if (a == null || b == null || a.signatures == null || b.signatures == null) return false;
        if (a.signatures.length == 0 || b.signatures.length == 0) return false;
        String sa = sha256(a.signatures[0]);
        String sb = sha256(b.signatures[0]);
        return sa != null && sa.equals(sb);
    }

    private String sha256(android.content.pm.Signature sig) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(sig.toByteArray());
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte x : digest) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
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
