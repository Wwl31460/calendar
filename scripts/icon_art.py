"""应用图标美术：日历页 + 星期 + 日期（各平台共用，512 为基准坐标）"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE = 512

BG_TOP = (79, 108, 255)
BG_BOT = (41, 59, 218)
RED_TOP = (255, 96, 82)
RED_BOT = (216, 44, 48)
PAGE = (255, 255, 255, 255)
INK = (20, 24, 34, 255)
WEEK = "周五"
DAY = "6"

FONTS_BOLD = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
    r"C:\Windows\Fonts\simhei.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]
FONTS_REG = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
    r"C:\Windows\Fonts\simhei.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]


def _load(paths, px):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, int(px))
            except Exception:
                continue
    return ImageFont.load_default()


def font(px, bold=True):
    return _load(FONTS_BOLD if bold else FONTS_REG, px)


def vgrad(size, top, bot, w=None):
    w = w or size
    img = Image.new("RGBA", (w, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c + (255,))
    return img


def background(size, radius_ratio=0.2235, circle=False):
    img = vgrad(size, BG_TOP, BG_BOT)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    if circle:
        md.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    img.putalpha(mask)
    return img


def _center_text(d, cx, cy, text, f, fill):
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), text, font=f, fill=fill)


def content(size):
    """日历页本体（透明背景）"""
    s = size / BASE
    def p(v):
        return v * s

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 页下柔和投影
    sh = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [p(92), p(140), p(420), p(440)], radius=p(54), fill=(12, 18, 48, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=p(13)))
    img.alpha_composite(sh)

    # 装订环（下半截被纸页覆盖）
    for x in (150, 336):
        d.rounded_rectangle([p(x), p(78), p(x + 26), p(180)], radius=p(13), fill=(255, 255, 255, 255))

    # 纸页
    d.rounded_rectangle([p(84), p(118), p(428), p(430)], radius=p(54), fill=PAGE)

    # 顶部红条（仅上圆角）
    band = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rounded_rectangle([p(84), p(118), p(428), p(252)], radius=p(54), fill=(255, 255, 255, 255))
    bd.rectangle([p(84), p(200), p(428), p(252)], fill=(255, 255, 255, 255))
    grad = vgrad(size, RED_TOP, RED_BOT)
    grad.putalpha(band.split()[3])
    img.alpha_composite(grad)

    # 星期
    _center_text(d, p(256), p(186), WEEK, font(p(52)), (255, 255, 255, 246))

    # 日期
    _center_text(d, p(256), p(344), DAY, font(p(172)), INK)

    return img


def full(size, radius_ratio=0.2235, circle=False, art_ratio=0.86):
    img = background(size, radius_ratio, circle)
    w = int(size * art_ratio)
    art = content(w)
    img.alpha_composite(art, ((size - w) // 2, (size - w) // 2))
    return img


def foreground(size, art_ratio=0.60):
    """自适应图标前景：内容约占 60%（落在安全区内）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    w = int(size * art_ratio)
    img.alpha_composite(content(w), ((size - w) // 2, (size - w) // 2))
    return img
