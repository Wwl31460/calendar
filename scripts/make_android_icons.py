"""生成 Android 启动图标（legacy / 圆形 / 自适应前景）与启动图"""
import os
import sys
import glob

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import icon_art as A  # noqa: E402

RES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "android/app/src/main/res")
BG = (244, 246, 251, 255)

DENS = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def make_icons():
    for dens, (legacy, fg) in DENS.items():
        d = os.path.join(RES, f"mipmap-{dens}")
        os.makedirs(d, exist_ok=True)
        A.full(legacy).save(os.path.join(d, "ic_launcher.png"))
        A.full(legacy, circle=True).save(os.path.join(d, "ic_launcher_round.png"))
        A.foreground(fg).save(os.path.join(d, "ic_launcher_foreground.png"))
    print("launcher icons ok")


def make_splash():
    logo = A.full(1024)
    files = glob.glob(os.path.join(RES, "drawable*", "splash.png"))
    for f in files:
        try:
            w, h = Image.open(f).size
        except Exception:
            continue
        canvas = Image.new("RGB", (w, h), BG)
        side = int(min(w, h) * 0.30)
        lg = logo.resize((side, side), Image.LANCZOS)
        canvas.paste(lg, ((w - side) // 2, (h - side) // 2), lg)
        canvas.save(f)
    print(f"splash ok ({len(files)} files)")


def write_color():
    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
    print("color ok")


if __name__ == "__main__":
    make_icons()
    make_splash()
    write_color()
