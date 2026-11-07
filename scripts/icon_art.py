"""应用图标美术：日历卡 + 星期 + 日期（各平台共用，以 size 为基准坐标）

两类用法：
- `tile(size, week, day)`  —— 铺满整块画布（独立图标 / 网页 / 启动图）
- `day_icon(size, week, day)` —— 内容缩进安全区、四周透明（Android 自适应图标前景，
  系统会把边缘 18dp 裁掉，缩进后文字不会被切掉）

星期与日期都是参数，供「每天自动换图标」生成 31×7 张图。
"""
import os
from PIL import Image, ImageDraw, ImageFont

import datetime

BASE = 512

WEEK_CN = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def today_labels():
    """(星期中文, 日期数字)，构建静态图标时用当天日期"""
    d = datetime.date.today()
    return WEEK_CN[d.isoweekday() - 1], str(d.day)

RED_TOP = (255, 96, 82)
RED_BOT = (216, 44, 48)
RED_FLAT = (232, 66, 60)
PAGE = (255, 255, 255, 255)
INK = (22, 26, 36, 255)

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


def _center_text(d, cx, cy, text, f, fill):
    """按字形墨迹框居中（不同字体上下留白不同，按 bbox 校正才不会偏）"""
    bbox = d.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), text, font=f, fill=fill)


def _draw_card(img, x0, y0, w, h, radius, week, day, band_ratio=0.30):
    """在一块 (x0,y0,w,h) 上画日历卡：白底 + 顶部红条 + 星期 + 大号日期"""
    S = img.size[0]
    d = ImageDraw.Draw(img)

    # 卡片投影（轻微，避免白卡浮在纯白背景上看不清边界）
    r = int(radius)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=r, fill=PAGE)

    band_h = h * band_ratio
    band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rounded_rectangle([x0, y0, x0 + w, y0 + band_h], radius=r, fill=(255, 255, 255, 255))
    bd.rectangle([x0, y0 + band_h - r, x0 + w, y0 + band_h], fill=(255, 255, 255, 255))
    grad = vgrad(S, RED_TOP, RED_BOT)
    grad.putalpha(band.split()[3])
    img.alpha_composite(grad)
    d = ImageDraw.Draw(img)

    # 星期：字号按「3 个字放得进卡片 88% 宽」反推，保证不裁切
    weak = w * 0.88 / max(1, len(week))
    wf = font(min(weak * 1.38, band_h * 0.62))
    _center_text(d, x0 + w / 2, y0 + band_h / 2, week, wf, (255, 255, 255, 248))

    # 日期：白底区域内尽量大，左右留足余量（两位数 31 也不能贴边）
    avail_w = w * 0.78
    avail_h = (h - band_h) * 0.80
    df = font(avail_h)
    while True:
        bb = d.textbbox((0, 0), day, font=df)
        if (bb[2] - bb[0]) <= avail_w or df.size <= 8:
            break
        df = font(df.size - 2)
    _center_text(d, x0 + w / 2, y0 + band_h + (h - band_h) / 2 + (h - band_h) * 0.02, day, df, INK)


def tile(size, week="周五", day="6", radius_ratio=0.2235, circle=False):
    """整块日历卡铺满画布（独立图标 / 网页图标 / 启动图）"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _draw_card(img, 0, 0, size - 1, size - 1, size * radius_ratio, week, day)
    if circle:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        img.putalpha(mask)
    return img


def day_icon(size, week="周五", day="6", inset=0.115):
    """自适应图标前景：内容缩进安全区，四周透明，系统裁切后文字仍完整"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = size * inset
    w = size - pad * 2
    _draw_card(img, pad, pad, w, w, w * 0.20, week, day)
    return img


def full(size, radius_ratio=0.2235, circle=False, art_ratio=0.86):
    w, d = today_labels()
    return tile(size, week=w, day=d, radius_ratio=radius_ratio, circle=circle)


def foreground(size, art_ratio=0.60):
    w, d = today_labels()
    return day_icon(size, week=w, day=d)
