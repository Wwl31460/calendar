# 日历 · 农历提醒课表

一款面向安卓手机的中文日历 App：**阳历农历对照 + 法定节假日 + 定时提醒（含农历生日）+ 日志 + PDF 课表导入**。
纯前端实现，零第三方依赖，数据全部保存在手机本地，**断网也能用**，并内置**应用内检查更新**与**桌面小组件**。

- 代码仓库：<https://github.com/Wwl31460/calendar>
- 最新安装包：<https://github.com/Wwl31460/calendar/releases/latest>
- 国内加速下载（当前 v1.1.0）：<https://ghfast.top/https://github.com/Wwl31460/calendar/releases/download/v1.1.0/calendar-v1.1.0.apk>

---

## 一、需求实现对照

| 需求 | 实现情况 |
| --- | --- |
| ① 日历查看：阳历/农历对照、法定节假日、节气、节日 | 月视图每格同时显示公历日与农历（节日 > 节气 > 初几）；放假日整格浅红底 + 红色加粗日期 + 红色 `休` 角标，调休上班灰色 `班` 角标（内置 2024–2027 年国务院官方安排，元旦 3 天、春节 9 天、国庆 7 天等连续假期整段标出）；点顶部「2026年11月」可弹出年月面板，年份翻页 / 「20年前 · 10年前 · 今年 · 10年后」一键跳转 / 直接输入年份，再点月份即可定位；24 节气、传统节日（春节/元宵/龙抬头/端午/七夕/中元/中秋/重阳/腊八/小年/除夕）、公历节日、母亲节/父亲节/感恩节等浮动节日；日程面板显示农历全称、干支生肖、星座、第几周 |
| ② 提醒设置：自定义日期时分、每日重复、每年公历、每年农历 | 支持「不重复 / 每天 / 每年 / 农历年」四种规则；农历模式直接选**农历月+农历日**（闰月不重复），到点弹系统通知 + 提示音 + 震动；启动时自动补报 12 小时内错过的提醒 |
| ③ 日志记录：随时录入、独立页面、查阅历史 | 「日志」独立页面，按日期分组时间线，支持搜索、编辑、删除；日历日程面板同日显示 |
| ④ 课表导入：上传 PDF、设定学期起始周（默认 20 周）、按周排布、课程提醒 | pdf.js 离线解析 PDF（文字版），自动识别星期列 / 节次行 / 周次（含单双周），导入前可逐条核对，导入后按周排布；学期开始日 + 总周数可改（默认 20 周）；上课前 N 分钟提醒（默认 10 分钟）；**扫描件 / 提不出文字的 PDF 可整份存进 App，按页渲染、双指放大随时翻看，不绑定日期与周次** |
| ⑤ 界面简洁、操作直观 | 底部四标签（日历 / 课表 / 日志 / 提醒），点按即用，无多余层级；支持深色模式与大字排版；图标为「星期 + 日期」的日历页，桌面可加 2×2 小组件实时显示今日星期 / 日期 / 农历 |

---

## 二、装到安卓手机上

### 方式 A：直接装 APK（推荐）

安装包：`dist/calendar-v1.1.0.apk`（3.41 MB，已签名），或直接从 Release 下载：

| 通道 | 链接 |
| --- | --- |
| 内网加速（推荐，国内直连可用） | <https://ghfast.top/https://github.com/Wwl31460/calendar/releases/download/v1.1.0/calendar-v1.1.0.apk> |
| 备用加速 | <https://gh-proxy.com/https://github.com/Wwl31460/calendar/releases/download/v1.1.0/calendar-v1.1.0.apk> |
| GitHub 原始地址 | <https://github.com/Wwl31460/calendar/releases/download/v1.1.0/calendar-v1.1.0.apk> |

1. 手机上打开上面的链接下载 APK（微信里可能被拦，用浏览器打开）。
2. 点击安装，系统提示「未知来源应用」时选择**允许**。
3. 首次打开允许「通知」权限，提醒才能弹出来。
4. 若「检查更新」提示需要「安装未知应用」权限，按引导打开开关即可。

> 支持 Android 5.1（API 22）及以上，targetSdk 34。

### 方式 B：当网页 App 用（无需安装）

```bash
cd www
python -m http.server 8080
# 手机与电脑连同一 Wi-Fi，用手机 Chrome 打开 http://电脑IP:8080
```

手机 Chrome 菜单 → **添加到主屏幕**，即可全屏离线使用。网页版没有系统闹钟能力，提醒可靠性不如 APK。

---

## 三、功能使用

### 日历
- 左右滑动或点击 `‹ ›` 换月，「今天」一键回到本月；点任意日期看当天日程。
- **跳年跳月**：点顶部「2026年11月」弹出年月面板 —— 年份条可整体翻页，也可点「20年前 / 10年前 / 今年 / 10年后」一键远跳，或在输入框直接敲年份「2015」点定位，最后点月份即落到该月（有假期的月份右上角带小红点）。
- **选中日**：点中的日期是实心主色圆 + 描边，一眼可辨；今天则是空心描边圆。
- 每格小字优先级：**节日 → 节气 → 农历初一显示月名 → 农历日**。
- 右下角 `休` = 法定放假，`班` = 调休上班（内置 2025、2026 年国务院官方放假安排，其余年份按法定规则推算）。
- 当天日程面板聚合：课程 → 提醒 → 日志，可一键「添加提醒 / 写日志」。

### 提醒
- 右上角 `+` 新建；标题、日期、时间、重复方式、备注。
- 重复方式选「农历年」后，直接选择农历月份与日期（如九月廿八），每年自动折算为对应公历日。
- 列表按"下一次触发时间"排序，右侧开关可临时关闭；卡片上直接显示「3 小时后 · 10:30」。
- APK 版会在启动与数据变更时，把未来 40 天的提醒写入系统闹钟队列，**App 被划掉也准点响**。

### 日志
- 右上角 `+` 记录此刻，正文支持多行，最多 5000 字。
- 按日期倒序分组，头部显示"今天 / 昨天 / N 天前"；点卡片编辑或删除。
- 右上角放大镜按关键字搜索全部历史。

### 课表
1. 首次进入点「设置学期」：填写**学期第 1 周的周一**与总周数（默认 20 周）。
2. 点「导入」→ 选择 PDF 文件（教务系统导出的文字版课表）。
   - 自动识别表头星期、左侧节次、单元格内的课程名/教师/教室/周次；
   - 支持 `1-16周`、`3-16周`、`1-8周单`、`1,3,5周` 等写法，自动展开为周次数组；
   - 导入前有核对列表，可逐条取消勾选；也能"粘贴文字课表"按行导入。
3. **提不出文字怎么办**：扫描件、截图拼成的 PDF、内嵌字体缺映射的 PDF 都提不出文字。此时
   - 直接选「只保存原图查看（不识别文字）」，或让 App 识别失败后按提示「保存并查看」；
   - 文件存进 App 后，课表页顶部会出现一张卡片（文件名 / 保存时间 / 大小），点「查看」按页高清渲染，双指放大、拖动平移；
   - 这份 PDF 不绑定学期、周次和任何日期，随时可看，也可随时删除。
4. 点空白格子可直接在该星期、该节次添加课程。
5. 上课提醒：按「设置 → 每日节次与作息」的时间表，提前 N 分钟提醒（默认 10 分钟）。

> 示例文件：`samples/课表样例.pdf`，可直接用来体验导入效果。

### 设置
- 通知权限、测试通知、上课提醒开关与提前量
- 学期开始日期、总周数、每日节次与作息
- 主题：跟随系统 / 浅色 / 深色
- 桌面小组件：查看添加方法（长按桌面 → 小组件 → 找到「日历」拖入）
- 数据：导出备份（JSON）、从备份恢复、清空所有数据
- 导出到系统日历（.ics）
- **检查更新**：对比 GitHub Release 上的最新版本

---

## 四、版本更新（手机端如何拿到新版）

App 内置的更新逻辑：

1. 每次启动后静默请求 `https://api.github.com/repos/Wwl31460/calendar/releases/latest`
   （24 小时内只查一次）；
2. 把 Release 的 `tag_name`（如 `v1.0.1`）与当前安装版本比较，有新版才弹窗；
3. 弹窗里显示更新说明与安装包大小，点「立即更新」后**在 App 内下载并直接拉起系统安装器**；
4. 下载地址按 `ghfast.top` → `gh-proxy.com` → GitHub 原始地址的顺序尝试，**镜像优先**：
   实测国内网络直连 `github.com` 下载会 19 秒超时，走镜像 1 秒内响应；
5. 也可以随时手动「设置 → 检查更新」，并支持「跳过此版本」。

### 发一个新版本

**方式一：一条命令搞定（推荐）**

先在 <https://github.com/settings/tokens> 生成一个带 `repo` 权限的 Token，然后：

```bash
set GITHUB_TOKEN=ghp_xxxxxxxx          # PowerShell: $env:GITHUB_TOKEN="ghp_xxx"
node scripts/release.mjs 1.0.1 "修复课表单双周识别"
```

脚本会自动：改版本号 → 打包签名 → 提交推送 → 建 Release 同名 Tag → 上传 APK。
手机端下次打开 App 就能收到更新。

> 也可以把 Token 写进项目根目录的 `.github-token` 文件（已加入 `.gitignore`，不会上传）。

**推送通道说明（重要）**

国内网络常出现 `github.com` 443 端口连不上（`Failed to connect to github.com port 443`），
而 `api.github.com` 通常仍是通的。所以推送有两条通道：

1. 先试 `git push`（网络正常时最快）；
2. 失败则自动改用 **GitHub REST API 逐文件上传**，只传有差异的文件，日常发版通常只有几个。

也可以单独调用 API 推送：

```bash
node scripts/push-github.mjs                      # 用 HEAD 的提交信息
node scripts/push-github.mjs --message "v1.0.1"   # 指定提交信息
```

有代理时（如 Clash 的 `127.0.0.1:7890`）加一个环境变量即可，API 与 APK 上传都会走代理：

```bash
set HTTPS_PROXY=http://127.0.0.1:7890
```

> ⚠️ 用 API 通道推送时，远端提交的 SHA 与本地不同（内容一致、历史线性）。
> 网络恢复后首次同步请执行：`git fetch && git reset --hard origin/main`，此后可继续正常 `git push`。

**方式二：手动三步**

```bash
node scripts/bump.mjs 1.0.1       # 改版本号（网页常量 + build.gradle + SW 缓存名）
node scripts/build-apk.mjs        # 打包，产物 dist/calendar-v1.0.1.apk
node scripts/push-github.mjs      # 推送（git 不通时用这个）
```

最后在 GitHub 上建一个 **Release**：

- Tag 填 `v1.0.1`（必须与版本号一致，`v` 前缀可有可无）
- 把 `dist/calendar-v1.0.1.apk` 拖进附件
- 说明里写更新内容（会显示在手机的更新弹窗里）

发完 Release，手机上下次打开 App 就会收到 1.0.1 的更新提示。

> **重要**：新 APK 必须用同一个签名密钥打包，否则安装时会提示"应用未安装 / 签名不一致"，
> 只能卸载旧版重装（会丢数据，需先导出备份）。密钥位置见下方「签名」章节，请务必备份。

### 更新日志

**v1.1.0（2026-11-06）**

- 日历标题可点，弹出年月面板：年份翻页 + 20/10 年一键跳转 + 输入年份直达 + 12 个月网格
- 选中日改为实心主色圆 + 描边，比原来一眼可辨
- 补全 2024、2027 年官方放假安排；无数据年份按法定规则推算连续假期，元旦 3 天、春节 9 天等整段标 `休`
- 放假日的日期数字改为红色加粗 + 整格浅红底，`休` 角标改为红底白字，`班` 角标为灰底描边
- 课表支持「PDF 原图查看」：提不出文字的扫描件也能存进 App，按页渲染、自由缩放，不绑定日期
- 全新图标（红色页眉 + 星期 + 日期），新增 2×2 桌面小组件，实时显示今日星期 / 日期 / 农历
- 修复导入解析时「正在解析 PDF…」提示压住结果弹层的问题

**v1.0.0（2026-11-05）** 首个版本：日历 / 提醒 / 日志 / 课表 / 应用内更新

---

## 五、构建环境

本机已装好，无需 Android Studio：

| 组件 | 路径 | 版本 |
| --- | --- | --- |
| JDK | `E:\AndroidDev\jdk` | Temurin 17.0.20.1 |
| Android SDK | `E:\AndroidDev\sdk` | platform 34 / build-tools 34.0.0 / platform-tools |
| Gradle | `~/.gradle`（wrapper 自动管理） | 8.2.1（走腾讯云镜像） |
| 签名密钥 | `E:\AndroidDev\keys\calendar-release.jks` | alias `calendar` |

环境变量 `JAVA_HOME`、`ANDROID_HOME` 已写入用户级环境变量；`android/local.properties` 指向 SDK。

一键打包：

```bash
node scripts/build-apk.mjs
```

---

## 六、数据与隐私

- 提醒、日志、课程、设置全部存在 WebView 的 **localStorage**（键名 `calapp.v2`），不上传任何服务器。
- 唯一的联网行为是「检查更新」时请求 GitHub 公开 API，不发送任何个人数据。
- 换手机或清缓存前，请用「设置 → 导出备份」保存 JSON，再在新设备「从备份恢复」。

---

## 七、技术说明

- 纯原生 JavaScript（ES Modules），无框架、无构建步骤；APK 外壳用 Capacitor 6。
- 农历：1900–2100 年编码表 + 二十四节气分钟偏移算法，公历↔农历双向换算；
  2025 年闰六月等闰月场景已校验。
- PDF 解析：`pdf.js 3.11`（已本地化到 `www/lib/`，离线可用）。先按坐标聚合成行，再识别
  星期表头与节次行还原表格；失败时回退到按行正则解析。文字层质量差（扫描件）时不硬猜，
  直接把原文件存进 IndexedDB（`pdf-doc.js`），用 `pdf-viewer.js` 逐页 canvas 渲染查看。
- 桌面小组件：`CalendarWidgetProvider` + `RemoteViews`，Java 侧内置同一份农历表（`Lunar.java`），
  零点唤醒重绘，跨天 / 改时区 / 开机 / 升级后自动刷新。
- 离线：`sw.js` 缓存全部静态资源（仅网页版启用；APK 内资源已内置，避免缓存旧版本）。
- 通知：Web Notification（PWA）+ `@capacitor/local-notifications`（APK）双通道。
- 自更新：自定义 Capacitor 插件 `AppUpdaterPlugin`（`android/app/src/main/java/cn/rili/calendar/`），
  负责下载 APK、进度回传、FileProvider 授权与拉起系统安装器。

```
日历APP/
├─ www/                          # 应用本体（APK 内嵌 + 可直接部署）
│  ├─ index.html
│  ├─ css/app.css
│  ├─ js/
│  │  ├─ lunar.js                # 农历 / 节气 / 节日 / 法定节假日
│  │  ├─ store.js                # 本地数据层
│  │  ├─ reminder.js             # 提醒规则与调度引擎
│  │  ├─ schedule.js             # 学期周次 / 作息时间
│  │  ├─ pdf-parse.js            # 课表 PDF 解析
│  │  ├─ pdf-doc.js              # PDF 原文件存储（IndexedDB）
│  │  ├─ pdf-viewer.js           # 全屏 PDF 翻看 / 缩放
│  │  ├─ ics.js                  # 导出系统日历
│  │  ├─ updater.js              # 版本号 + 检查更新 + 下载安装
│  │  ├─ forms.js                # 提醒 / 日志 / 课程表单
│  │  └─ views/                  # 四个页面 + 设置页
│  ├─ lib/                       # pdf.js（离线）
│  ├─ icons/
│  ├─ manifest.webmanifest
│  └─ sw.js
├─ android/                      # Capacitor 原生工程（出 APK）
│  ├─ app/src/main/java/cn/rili/calendar/
│  │  ├─ MainActivity.java
│  │  ├─ AppUpdaterPlugin.java   # 应用自更新插件
│  │  ├─ CalendarWidgetProvider.java  # 桌面小组件
│  │  └─ Lunar.java              # 小组件用的农历换算
│  └─ app/src/main/res/          # 图标 / 启动图 / 通知小图标
├─ dist/                         # 打包产物（不入库）
├─ samples/课表样例.pdf
└─ scripts/                      # 构建、发版与自测脚本
   ├─ release.mjs                # 一键发版（打包→推送→建 Release→传 APK）
   ├─ push-github.mjs            # git push 不通时的 API 推送通道
   ├─ build-apk.mjs / bump.mjs   # 打包 / 改版本号
```

---

## 八、本地开发与自测

```bash
cd www && python -m http.server 5173     # 起服务，改完刷新即可
```

```bash
node scripts/shoot.mjs            # 各页面截图
node scripts/test-import.mjs      # PDF 课表导入端到端
node scripts/test-engine.mjs      # 提醒触发 + 离线能力
node scripts/test-ics.mjs         # 导出 .ics 校验
node scripts/test-update-ui.mjs   # 检查更新界面（网页版）
node scripts/test-native-bridge.mjs  # APK 内更新流程（模拟 Capacitor 桥）
node scripts/test-update-live.mjs    # 真实网络请求 GitHub Release 验证
```

演示数据：地址后加 `?demo=1`，仅在数据为空时注入示例课程、提醒与日志。

---

## 九、已知限制

1. **法定节假日**：2024、2025、2026、2027 年为国务院办公厅通知原文（含调休上班日）；
   其余年份按法定规则推算连续假期（元旦 3 天、春节 9 天、清明 3 天、劳动 5 天、端午/中秋 3 天、国庆 7 天），
   官方公布后更新 `www/js/lunar.js` 里的 `OFFICIAL` 表即可。
2. **PDF 课表**：自动识别只对文字版 PDF 有效；扫描件/图片版提不出文字时，用「只保存原图查看」把原文件存进 App 照样能看，只是不会生成周课表。
3. **提醒精度**：网页版依赖页面常驻；APK 版使用系统精确闹钟，可靠性最高。
4. **更新检测**：依赖 `api.github.com` 可达（国内多数网络可直连）；APK 下载走镜像通道，
   直连 `github.com` 长期不通也不影响升级。
5. 农历算法覆盖 1900–2100 年。
