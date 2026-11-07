"""生成「每天自动换图标」所需的 217 张图标（7 个星期 × 31 个日期）+ Manifest 里的启动别针。

Android 没有运行时改应用图标的 API，通行做法是预先声明一组
`<activity-alias>`，每个 alias 指向同一张不同图标，运行时用
PackageManager 只启用当天那一个。所需图标数 = 7×31 = 217（与年份无关），
体积可控（PNG 为纯色块 + 文字，单张 ~4KB）。
"""
import os
import sys
import datetime

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import icon_art as A  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android/app/src/main/res")
MANIFEST = os.path.join(ROOT, "android/app/src/main/AndroidManifest.xml")

WEEK = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
SIZE = 432          # 108dp @ xxxhdpi，系统会按需缩放
ALIAS_PREFIX = "Day"

START = "<!-- DAY_ICONS_START: 每天自动换图标（由 scripts/make_day_icons.py 生成，勿手改） -->"
END = "<!-- DAY_ICONS_END -->"


def build_pngs():
    d = os.path.join(RES, "mipmap-nodpi")
    os.makedirs(d, exist_ok=True)
    n = 0
    for w in range(1, 8):
        for day in range(1, 32):
            img = A.day_icon(SIZE, WEEK[w - 1], str(day))
            # 128 色调色板足够（白 / 深墨 / 红条渐变），单张从 8KB 降到 ~3KB
            img = img.convert("RGBA").quantize(colors=128, method=Image.FASTOCTREE)
            img.save(os.path.join(d, f"ic_day_{w}_{day}.png"), optimize=True)
            n += 1
    print(f"icons ok ({n})")


def alias_xml(w, day, enabled):
    return f"""        <activity-alias
            android:name=".{ALIAS_PREFIX}{w}_{day}"
            android:targetActivity=".MainActivity"
            android:exported="true"
            android:icon="@mipmap/ic_day_{w}_{day}"
            android:roundIcon="@mipmap/ic_day_{w}_{day}"
            android:label="@string/app_name"
            android:enabled="{str(enabled).lower()}">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>"""


def write_manifest(today=None):
    today = today or datetime.date.today()
    tw = today.isoweekday()
    td = today.day

    src = open(MANIFEST, encoding="utf-8").read()
    i = src.find(START)
    j = src.find(END)
    if i < 0 or j < 0:
        raise SystemExit("Manifest 缺少 DAY_ICONS 标记，请先手工插入占位注释")

    body = [START]
    for w in range(1, 8):
        for day in range(1, 32):
            body.append(alias_xml(w, day, w == tw and day == td))
    body.append("        " + END)
    block = "\n".join(body)

    out = src[:i] + block + src[j + len(END):]
    open(MANIFEST, "w", encoding="utf-8").write(out)
    print(f"manifest ok (enabled Day{tw}_{td}, {today.isoformat()})")


if __name__ == "__main__":
    build_pngs()
    write_manifest()
