package cn.rili.calendar;

import android.os.Bundle;
import android.webkit.JavascriptInterface;

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
        super.onCreate(savedInstanceState);
        try {
            getBridge().getWebView().addJavascriptInterface(new BackBridge(), "AppBack");
        } catch (Exception ignored) {
        }
        // 桌面图标跟着日期走（预置 217 个 alias，这里只切换当天那一个）
        try {
            IconSwitcher.sync(this);
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
