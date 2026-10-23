"""Dibuja docs/img/evolucion.png: el latigo en sus 14 niveles, con los colores,
chispas y grito reales de hooks/levels.ts (exportados con niveles_json.mjs).

Uso: python scripts/evolucion.py <niveles.json> docs/img/evolucion.png
"""

from __future__ import annotations

import json
import math
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

MENLO = "/System/Library/Fonts/Menlo.ttc"
# Fuentes en orden de preferencia para los glifos de chispas y puntas.
GLYPH_FONTS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Supplemental/STIXTwoMath.otf",
]
S = 2  # escala retina
ROW_H = 74
W = 1180
HEAD = 120
BG = (17, 18, 24)


def hex_rgb(value: str) -> tuple[int, int, int]:
    n = int(value[1:], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


class GlyphFont:
    """Elige, glifo por glifo, la primera fuente que lo tenga."""

    def __init__(self, size: int) -> None:
        from fontTools.ttLib import TTCollection, TTFont

        self.fonts = []
        for path in GLYPH_FONTS:
            font = TTCollection(path).fonts[0] if path.endswith(".ttc") else TTFont(path)
            self.fonts.append((ImageFont.truetype(path, size), set(font.getBestCmap().keys())))

    def draw(self, draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, fill: tuple[int, int, int]) -> None:
        x, y = xy
        for ch in text:
            font = next((f for f, cmap in self.fonts if ord(ch) in cmap), self.fonts[0][0])
            draw.text((x, y), ch, font=font, fill=fill)
            x += draw.textlength(ch, font=font)


def whip_points(x0: float, y0: float, length: float, phase: float) -> list[tuple[float, float]]:
    points = []
    for i in range(80):
        t = i / 79
        x = x0 + t * length
        y = y0 - 10 * t + math.sin(t * math.pi * 2.4 + phase) * 9 * t ** 1.4
        points.append((x, y))
    return points


def main() -> None:
    tiers = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    height = HEAD + ROW_H * len(tiers) + 40
    img = Image.new("RGB", (W * S, height * S), BG)
    glow_layer = Image.new("RGB", img.size, (0, 0, 0))
    draw = ImageDraw.Draw(img)
    glow = ImageDraw.Draw(glow_layer)

    title = ImageFont.truetype(MENLO, 30 * S, index=1)
    sub = ImageFont.truetype(MENLO, 15 * S)
    name_font = ImageFont.truetype(MENLO, 17 * S, index=1)
    small = ImageFont.truetype(MENLO, 13 * S)
    glyphs = GlyphFont(16 * S)
    crack_glyphs = GlyphFont(15 * S)

    draw.text((40 * S, 30 * S), "Evolución del látigo", font=title, fill=(240, 236, 220))
    draw.text((40 * S, 72 * S), "14 niveles · cada latigazo dora un poquito el látigo · los colores salen de hooks/levels.ts", font=sub, fill=(150, 154, 168))

    for i, tier in enumerate(tiers):
        y = HEAD + i * ROW_H
        if i % 2 == 0:
            draw.rectangle([0, y * S, W * S, (y + ROW_H) * S], fill=(21, 22, 29))
        look = tier["look"]
        lash = hex_rgb(look["lash"])
        handle = hex_rgb(look["handle"])
        glow_rgb = hex_rgb(look["glow"])
        density = tier["sparkDensity"]

        draw.text((40 * S, (y + 16) * S), f"Nv {tier['level']:>2}", font=small, fill=(130, 134, 148))
        draw.text((100 * S, (y + 13) * S), tier["name"], font=name_font, fill=lash)
        lashes = "desde el inicio" if tier["minLashes"] == 0 else f"desde {tier['minLashes']:,} latigazos".replace(",", ".")
        draw.text((100 * S, (y + 40) * S), lashes, font=small, fill=(120, 124, 138))

        # Mango y cuerpo del latigo, con brillo proporcional al nivel.
        x0, y0 = 350, y + 46
        draw.rounded_rectangle([(x0 - 34) * S, (y0 - 5) * S, x0 * S, (y0 + 5) * S], radius=4 * S, fill=handle)
        pts = whip_points(x0, y0, 330, i * 0.7)
        width_px = 5
        for k in range(len(pts) - 1):
            w = max(1, round((width_px * (1 - k / len(pts)) + 1) * S))
            seg = [(pts[k][0] * S, pts[k][1] * S), (pts[k + 1][0] * S, pts[k + 1][1] * S)]
            draw.line(seg, fill=lash, width=w)
            if density > 0:
                glow.line(seg, fill=tuple(int(c * min(1, 0.25 + density)) for c in glow_rgb), width=w + 6 * S)
        tip_x, tip_y = pts[-1]
        glyphs.draw(draw, ((tip_x + 4) * S, (tip_y - 12) * S), tier["tip"], glow_rgb)
        crack_glyphs.draw(draw, ((tip_x + 26) * S, (tip_y - 10) * S), tier["crack"], glow_rgb)

        # Chispas reales del nivel (sparkRow), repartidas sobre el latigo.
        for j, ch in enumerate(tier["sky"]):
            if ch.strip():
                sx = x0 + 10 + j * 10
                sy = y + 14 + (j * 37 % 23)
                glyphs.draw(draw, (sx * S, sy * S), ch, glow_rgb)
                glow.ellipse([(sx - 2) * S, (sy + 2) * S, (sx + 10) * S, (sy + 14) * S], fill=tuple(int(c * 0.5) for c in glow_rgb))

        # Barra de densidad de chispas.
        bx = 1010
        draw.text((bx * S, (y + 14) * S), "chispas", font=small, fill=(120, 124, 138))
        draw.rounded_rectangle([bx * S, (y + 40) * S, (bx + 130) * S, (y + 48) * S], radius=4 * S, fill=(40, 42, 52))
        if density > 0:
            draw.rounded_rectangle([bx * S, (y + 40) * S, (bx + 130 * density / 0.62) * S, (y + 48) * S], radius=4 * S, fill=glow_rgb)

    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(6 * S))
    final = ImageChops.add(img, glow_layer.point(lambda v: int(v * 0.55)))
    final.save(out, optimize=True)
    print("ok", out)


if __name__ == "__main__":
    main()
