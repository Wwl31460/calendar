package cn.rili.calendar;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** 网页层告知的「可返回层数」：弹层 / 阅读器 / 设置页 */
    private volatile int backDepth = 0;

    public class BackBridge {
        @JavascriptInterface
        public void setDepth(int d) {
            backDepth = Math.max(0, d);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(AlarmPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            getBridge().getWebView().addJavascriptInterface(new BackBridge(), "AppBack");
        } catch (Exception ignored) {
        }
        // 版本变了就清一次 WebView 缓存。
        // 覆盖安装后 WebView 仍可能拿缓存的 index.html / js，导致「界面还是老样子」——
        // 这一步就是把这个坑堵掉。
        clearWebCacheOnUpgrade();
        // 只把跨天检查排好，先不动图标：
        // 本次很可能是从「昨天那张图标」点进来的，此刻禁用那个 alias 会让系统连当前任务一起结束，
        // 用户看到的就是「点开闪退，然后图标才变」。真正切换放到 onStop。
        try {
            IconSwitcher.ensureScheduled(this);
        } catch (Exception ignored) {
        }
    }

    private void clearWebCacheOnUpgrade() {
        try {
            int code;
            if (Build.VERSION.SDK_INT >= 33) {
                PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                code = (int) pi.getLongVersionCode();
            } else {
                code = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            }
            SharedPreferences sp = getSharedPreferences("app_build", MODE_PRIVATE);
            int last = sp.getInt("code", -1);
            if (last != code) {
                // 不让 WebView 用旧缓存
                getBridge().getWebView().getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
                getBridge().getWebView().clearCache(true);
                sp.edit().putInt("code", code).apply();
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // 回到前台时刷新桌面小组件，避免系统漏发跨天闹钟导致显示旧日期
        try {
            CalendarWidgetProvider.updateAll(this);
        } catch (Exception ignored) {
        }
        try {
            // 只补排跨天检查；图标切换交给 onStop
            IconSwitcher.ensureScheduled(this);
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // 离开 App 之后才切图标：此时没有正在运行的任务会被影响，
        // 回到桌面就能看到今天这张，也不会出现「点开就闪退」。
        try {
            IconSwitcher.sync(this);
        } catch (Exception ignored) {
        }
    }

    /**
     * 返回键：有可返回的层级（弹层 / 阅读器 / 设置页）就交给网页处理，
     * 退到最外层才真正退出应用。
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (backDepth > 0) {
            // 先清零，网页处理完会重新上报真实层数；这样连按也不会卡住
            backDepth = 0;
            try {
                getBridge().getWebView().evaluateJavascript(
                        "(function(){try{window.__handleBack&&window.__handleBack();}catch(e){}})()", null);
                return;
            } catch (Exception ignored) {
            }
        }
        super.onBackPressed();
    }
}
