"""生成应用图标（512 / 192 / 180）"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import icon_art as A  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "www", "icons")


def main():
    os.makedirs(OUT, exist_ok=True)
    master = A.full(1024).resize((512, 512), Image.LANCZOS)
    master.save(os.path.join(OUT, "icon-512.png"))
    master.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))
    A.full(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("icons generated")


if __name__ == "__main__":
    main()
