"""生成应用图标（512 / 192 / 180）"""
from PIL import Image, ImageDraw

S = 512
TOP = (91, 124, 255)
BOT = (58, 84, 232)
RED = (226, 59, 59, 255)
WHITE = (255, 255, 255, 255)
DOT = (198, 206, 232, 255)


def base():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(TOP[i] + (BOT[i] - TOP[i]) * t) for i in range(3))
        d.line([(0, y), (S, y)], fill=c + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=255)
    img.putalpha(mask)
    return img


def draw():
    img = base()
    d = ImageDraw.Draw(img)

    # 日历纸张
    d.rounded_rectangle([116, 142, 396, 398], radius=40, fill=WHITE)

    # 顶部红色条
    band = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.rounded_rectangle([116, 142, 396, 224], radius=40, fill=RED)
    bd.rectangle([118, 190, 394, 224], fill=RED)
    img.alpha_composite(band)

    # 装订环
    d.rounded_rectangle([156, 104, 196, 172], radius=20, fill=WHITE)
    d.rounded_rectangle([316, 104, 356, 172], radius=20, fill=WHITE)

    # 日期圆点
    for row, y in enumerate((288, 344)):
        for x in (170, 256, 342):
            r = 13
            d.ellipse([x - r, y - r, x + r, y + r], fill=DOT)
    # 高亮一个圆点（今天）
    d.ellipse([256 - 15, 288 - 15, 256 + 15, 288 + 15], fill=(61, 92, 246, 255))
    return img


if __name__ == "__main__":
    img = draw()
    img.resize((512, 512), Image.LANCZOS).save("www/icons/icon-512.png")
    img.resize((192, 192), Image.LANCZOS).save("www/icons/icon-192.png")
    img.resize((180, 180), Image.LANCZOS).save("www/icons/apple-touch-icon.png")
    print("icons generated")
