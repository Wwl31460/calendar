package cn.rili.calendar;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        // 回到前台时刷新桌面小组件，避免系统漏发跨天闹钟导致显示旧日期
        try {
            CalendarWidgetProvider.updateAll(this);
        } catch (Exception ignored) {
        }
    }
}
