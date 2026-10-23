"""Genera images/icon.png (128x128): un latigo dorado sobre fondo oscuro redondeado.

Arte original, dibujado con PIL a 4x y reducido para que los bordes queden suaves.
Uso: python3 scripts/make-icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SCALE = 4
SIZE = 128 * SCALE
OUT = Path(__file__).resolve().parent.parent / "images" / "icon.png"


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
    )


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def s(v):
    return v * SCALE


def main():
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    # Fondo: cuadro redondeado con degradado calido y oscuro.
    background = Image.new("RGBA", (SIZE, SIZE))
    pixels = background.load()
    for y in range(SIZE):
        for x in range(SIZE):
            d = math.hypot(x - SIZE * 0.68, y - SIZE * 0.3) / SIZE
            t = min(1.0, d * 1.25)
            pixels[x, y] = mix((74, 46, 18, 255), (18, 12, 8, 255), t)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((s(4), s(4), SIZE - s(4), SIZE - s(4)), radius=s(26), fill=255)
    base.paste(background, (0, 0), mask)

    # Curva del latigo.
    anchor = (s(38), s(92))
    c1 = (s(50), s(48))
    c2 = (s(104), s(16))
    tip = (s(108), s(58))
    points = [bezier(anchor, c1, c2, tip, i / 120) for i in range(121)]

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(len(points) - 1):
        width = round(s(9) * (1 - i / 120) + s(2.6))
        gd.line([points[i], points[i + 1]], fill=(255, 196, 40, 150), width=width + s(5))
    glow = glow.filter(ImageFilter.GaussianBlur(s(5)))
    base = Image.alpha_composite(base, Image.composite(glow, Image.new("RGBA", (SIZE, SIZE)), mask))

    draw = ImageDraw.Draw(base)
    for i in range(len(points) - 1):
        t = i / 120
        width = round(s(7) * (1 - t) + s(1.6))
        color = mix((214, 150, 30), (255, 236, 150), t**1.3) + (255,)
        draw.line([points[i], points[i + 1]], fill=color, width=width)
        r = width / 2
        draw.ellipse((points[i][0] - r, points[i][1] - r, points[i][0] + r, points[i][1] + r), fill=color)

    # Brillo en el lomo.
    for i in range(10, 100):
        draw.line([(points[i][0] - s(1.2), points[i][1] - s(1.2)), (points[i + 1][0] - s(1.2), points[i + 1][1] - s(1.2))], fill=(255, 245, 200, 120), width=s(1))

    # Remate y chispas en la punta.
    for angle in (-0.5, 0.1, 0.6):
        end = (tip[0] + math.cos(math.pi / 2 + angle) * s(9), tip[1] + math.sin(math.pi / 2 + angle) * s(9))
        draw.line([tip, end], fill=(255, 240, 180, 255), width=s(1))

    def star(cx, cy, r, color):
        pts = []
        for k in range(8):
            radius = r if k % 2 == 0 else r * 0.28
            a = k * math.pi / 4 - math.pi / 2
            pts.append((cx + math.cos(a) * radius, cy + math.sin(a) * radius))
        draw.polygon(pts, fill=color)

    star(s(100), s(80), s(8), (255, 250, 220, 255))
    star(s(86), s(96), s(4.5), (255, 214, 90, 255))
    star(s(114), s(92), s(3.5), (255, 214, 90, 230))

    # Mango con amarres y pomo.
    butt = (s(18), s(112))
    angle = math.atan2(anchor[1] - butt[1], anchor[0] - butt[0])
    nx, ny = -math.sin(angle), math.cos(angle)
    half = s(6.5)
    handle = [
        (butt[0] + nx * half, butt[1] + ny * half),
        (anchor[0] + nx * half, anchor[1] + ny * half),
        (anchor[0] - nx * half, anchor[1] - ny * half),
        (butt[0] - nx * half, butt[1] - ny * half),
    ]
    draw.polygon(handle, fill=(122, 74, 26, 255))
    length = math.hypot(anchor[0] - butt[0], anchor[1] - butt[1])
    steps = int(length // s(5))
    for k in range(1, steps):
        t = k / steps
        cx = butt[0] + (anchor[0] - butt[0]) * t
        cy = butt[1] + (anchor[1] - butt[1]) * t
        draw.line([(cx + nx * half, cy + ny * half), (cx - nx * half + math.cos(angle) * s(2.5), cy - ny * half + math.sin(angle) * s(2.5))], fill=(70, 40, 12, 255), width=round(s(1.4)))
    draw.ellipse((butt[0] - s(7.5), butt[1] - s(7.5), butt[0] + s(7.5), butt[1] + s(7.5)), fill=(240, 196, 70, 255))
    draw.ellipse((butt[0] - s(4), butt[1] - s(5), butt[0] - s(0.5), butt[1] - s(1.5)), fill=(255, 244, 200, 200))
    collar = [(anchor[0] + nx * s(7.5) - math.cos(angle) * s(3), anchor[1] + ny * s(7.5) - math.sin(angle) * s(3)),
              (anchor[0] + nx * s(7.5) + math.cos(angle) * s(2), anchor[1] + ny * s(7.5) + math.sin(angle) * s(2)),
              (anchor[0] - nx * s(7.5) + math.cos(angle) * s(2), anchor[1] - ny * s(7.5) + math.sin(angle) * s(2)),
              (anchor[0] - nx * s(7.5) - math.cos(angle) * s(3), anchor[1] - ny * s(7.5) - math.sin(angle) * s(3))]
    draw.polygon(collar, fill=(240, 196, 70, 255))

    # Recortar todo al cuadro redondeado y reducir.
    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(base, (0, 0), mask)
    final = final.resize((128, 128), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, optimize=True)
    print(f"listo {OUT}")


if __name__ == "__main__":
    main()
