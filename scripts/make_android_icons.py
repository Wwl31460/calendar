"""生成 Android 启动图标（legacy / 圆形 / 自适应前景）与启动图"""
import os
import glob
from PIL import Image, ImageDraw

TOP = (91, 124, 255)
BOT = (58, 84, 232)
RED = (226, 59, 59, 255)
WHITE = (255, 255, 255, 255)
DOT = (198, 206, 232, 255)
ACCENT = (61, 92, 246, 255)
BG = (244, 246, 251, 255)

RES = "android/app/src/main/res"
BASE = 1024
K = BASE / 512.0


def _s(v):
    return v * K


def draw_content(size=BASE):
    """只画日历本体（透明背景），返回 RGBA 图与内容包围盒"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([_s(116), _s(142), _s(396), _s(398)], radius=int(_s(40)), fill=WHITE)

    band = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rounded_rectangle([_s(116), _s(142), _s(396), _s(224)], radius=int(_s(40)), fill=RED)
    bd.rectangle([_s(118), _s(190), _s(394), _s(224)], fill=RED)
    img.alpha_composite(band)

    d.rounded_rectangle([_s(156), _s(104), _s(196), _s(172)], radius=int(_s(20)), fill=WHITE)
    d.rounded_rectangle([_s(316), _s(104), _s(356), _s(172)], radius=int(_s(20)), fill=WHITE)

    for y in (288, 344):
        for x in (170, 256, 342):
            r = _s(13)
            d.ellipse([_s(x) - r, _s(y) - r, _s(x) + r, _s(y) + r], fill=DOT)
    d.ellipse([_s(256) - _s(15), _s(288) - _s(15), _s(256) + _s(15), _s(288) + _s(15)], fill=ACCENT)
    return img.crop((int(_s(108)), int(_s(96)), int(_s(404)), int(_s(406))))


CONTENT = draw_content()


def gradient_bg(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=c + (255,))
    return img


def full_icon(size, radius_ratio=0.2196, circle=False):
    img = gradient_bg(size)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    if circle:
        md.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    img.putalpha(mask)

    cw = int(size * 0.63)
    ch = int(CONTENT.height * cw / CONTENT.width)
    c = CONTENT.resize((cw, ch), Image.LANCZOS)
    img.alpha_composite(c, (int((size - cw) / 2), int((size - ch) / 2) + int(size * 0.01)))
    return img


def foreground(size):
    """自适应图标前景：108dp 画布内，内容占约 62%（安全区内）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cw = int(size * 0.60)
    ch = int(CONTENT.height * cw / CONTENT.width)
    c = CONTENT.resize((cw, ch), Image.LANCZOS)
    img.alpha_composite(c, (int((size - cw) / 2), int((size - ch) / 2)))
    return img


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
        full_icon(legacy).save(os.path.join(d, "ic_launcher.png"))
        full_icon(legacy, circle=True).save(os.path.join(d, "ic_launcher_round.png"))
        foreground(fg).save(os.path.join(d, "ic_launcher_foreground.png"))
    print("launcher icons ok")


def make_splash():
    logo = full_icon(1024)
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
                '    <color name="ic_launcher_background">#5B7CFF</color>\n</resources>\n')
    print("color ok")


if __name__ == "__main__":
    make_icons()
    make_splash()
    write_color()
