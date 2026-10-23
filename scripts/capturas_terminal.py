"""Capturas reales de la banda del latigo dentro de Claude Code.

Abre `claude` de verdad en una terminal virtual (pty), con el mod cargado desde
esta carpeta (`--plugin-dir`), le manda teclas, lee la pantalla con un emulador
de terminal (pyte) y la dibuja en PNG con los colores reales.

No manda ningun mensaje al modelo: solo abre la sesion, enfoca la banda y le da
latigazos. Antes de cada escena deja en el puente temporal el total de latigazos
que la escena necesita. Al final deja todo como estaba: ~/.claude/settings.json
(el latigo cambia el effort con /effort, que se guarda ahi), el almacen del plugin
cargado con --plugin-dir y las transcripciones vacias de las sesiones de prueba.

Uso (desde la raiz del repo, con un venv que tenga pyte, pillow y fonttools):
    python scripts/capturas_terminal.py --claude <ruta al binario> --out docs/img
"""

from __future__ import annotations

import argparse
import json
import os
import pty
import select
import shutil
import signal
import tempfile
import time
from pathlib import Path

import pyte
from fontTools.ttLib import TTCollection, TTFont
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
# Las sesiones de prueba usan su propio puente (LATIGO_HOME), asi nunca tocan el
# de la persona ni las sesiones de Claude Code que tenga abiertas.
TEST_HOME = Path(tempfile.mkdtemp(prefix="latigo-home-"))
BRIDGE = TEST_HOME / ".claude-latigo"
# El almacen propio del plugin cuando corre con --plugin-dir, y las transcripciones
# vacias que dejan las sesiones de prueba en esta carpeta.
PLUGIN_STORE = Path.home() / ".claude" / "plugins" / "store"
# El latigo usa /effort, que Claude Code guarda como predeterminado en settings.json.
USER_SETTINGS = Path.home() / ".claude" / "settings.json"
TRANSCRIPTS = Path.home() / ".claude" / "projects" / str(REPO).replace("/", "-")


_original_settings: bytes | None = None


class Sandbox:
    """Guarda lo que las sesiones de prueba tocan y lo deja como estaba al salir."""

    def __enter__(self) -> "Sandbox":
        global _original_settings
        self.settings = USER_SETTINGS.read_bytes() if USER_SETTINGS.exists() else None
        _original_settings = self.settings
        self.stores = {p.name: p.read_bytes() for p in PLUGIN_STORE.glob("latigo_inline-*.json")}
        self.had_transcripts = TRANSCRIPTS.exists()
        self.transcripts = set(TRANSCRIPTS.glob("*")) if self.had_transcripts else set()
        return self

    def __exit__(self, *exc: object) -> None:
        if self.settings is not None:
            USER_SETTINGS.write_bytes(self.settings)
        for path in PLUGIN_STORE.glob("latigo_inline-*.json"):
            if path.name in self.stores:
                path.write_bytes(self.stores[path.name])
            else:
                path.unlink()
        if not self.had_transcripts:
            shutil.rmtree(TRANSCRIPTS, ignore_errors=True)
        elif TRANSCRIPTS.exists():
            for path in set(TRANSCRIPTS.glob("*")) - self.transcripts:
                shutil.rmtree(path, ignore_errors=True) if path.is_dir() else path.unlink()
        shutil.rmtree(TEST_HOME, ignore_errors=True)


def clear_plugin_store() -> None:
    """Cada escena arranca sin conteos guardados en el almacen del plugin, y con
    el effort guardado que la persona tenia (una escena anterior pudo subirlo)."""
    for path in PLUGIN_STORE.glob("latigo_inline-*.json"):
        path.unlink()
    if _original_settings is not None:
        USER_SETTINGS.write_bytes(_original_settings)
COLS, ROWS = 118, 30

FONT_MAIN = "/System/Library/Fonts/Menlo.ttc"
FALLBACKS = [
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/STIXTwoMath.otf",
]
FONT_SIZE = 15
CELL_W, CELL_H = 9, 19
PAD = 22
TITLE_H = 34

# Paleta oscura tipo VS Code para los colores con nombre.
NAMED = {
    "black": "#1e1e1e", "red": "#f14c4c", "green": "#23d18b", "brown": "#e5e510", "yellow": "#e5e510",
    "blue": "#3b8eea", "magenta": "#d670d6", "cyan": "#29b8db", "white": "#cccccc",
    "brightblack": "#666666", "brightred": "#f14c4c", "brightgreen": "#23d18b", "brightbrown": "#f5f543",
    "brightyellow": "#f5f543", "brightblue": "#3b8eea", "brightmagenta": "#d670d6", "brightcyan": "#29b8db",
    "brightwhite": "#e5e5e5",
}
BG = "#16171d"
FG = "#d4d4d4"


def load_cmap(path: str, index: int = 0) -> set[int]:
    if path.endswith(".ttc"):
        font = TTCollection(path).fonts[index]
    else:
        font = TTFont(path)
    return set(font.getBestCmap().keys())


class Glyphs:
    def __init__(self) -> None:
        self.main = ImageFont.truetype(FONT_MAIN, FONT_SIZE, index=0)
        self.bold = ImageFont.truetype(FONT_MAIN, FONT_SIZE, index=1)
        self.main_cmap = load_cmap(FONT_MAIN, 0)
        self.fallbacks = [(ImageFont.truetype(p, FONT_SIZE), load_cmap(p)) for p in FALLBACKS if os.path.exists(p)]

    def font_for(self, ch: str, bold: bool) -> ImageFont.FreeTypeFont:
        if ord(ch[0]) in self.main_cmap:
            return self.bold if bold else self.main
        for font, cmap in self.fallbacks:
            if ord(ch[0]) in cmap:
                return font
        return self.main


def color(value: str, default: str) -> str:
    if value in ("default", "", None):
        return default
    if len(value) == 6 and all(c in "0123456789abcdefABCDEF" for c in value):
        return "#" + value
    return NAMED.get(value.replace("-", "").replace("_", "").lower(), default)


def render(screen: pyte.Screen, out: Path, title: str, crop_rows: tuple[int, int] | None = None) -> None:
    glyphs = Glyphs()
    if crop_rows:
        first, last = crop_rows
    else:
        # Pantalla completa: hasta la ultima fila con algo, mas una de aire.
        used = [i for i, line in enumerate(screen.display) if line.strip()]
        first, last = 0, min(screen.lines - 1, (used[-1] + 1) if used else screen.lines - 1)
    rows = last - first + 1
    width = PAD * 2 + screen.columns * CELL_W
    height = TITLE_H + PAD * 2 + rows * CELL_H
    scale = 2
    img = Image.new("RGB", (width * scale, height * scale), "#0b0c10")
    draw = ImageDraw.Draw(img)
    # Ventana con barra de titulo.
    draw.rounded_rectangle([0, 0, width * scale - 1, height * scale - 1], radius=14 * scale, fill=BG, outline="#2a2c36", width=2)
    draw.rounded_rectangle([0, 0, width * scale - 1, TITLE_H * scale], radius=14 * scale, fill="#1f2029")
    draw.rectangle([0, (TITLE_H - 10) * scale, width * scale - 1, TITLE_H * scale], fill="#1f2029")
    for i, dot in enumerate(["#ff5f57", "#febc2e", "#28c840"]):
        cx, cy = (18 + i * 20) * scale, (TITLE_H // 2) * scale
        draw.ellipse([cx - 6 * scale, cy - 6 * scale, cx + 6 * scale, cy + 6 * scale], fill=dot)
    title_font = ImageFont.truetype(FONT_MAIN, 13 * scale)
    tw = draw.textlength(title, font=title_font)
    draw.text(((width * scale - tw) / 2, (TITLE_H // 2 - 8) * scale), title, font=title_font, fill="#9aa0ad")

    big = {}
    for y in range(first, last + 1):
        line = screen.buffer[y]
        for x in range(screen.columns):
            char = line[x]
            fg = color(char.fg, FG)
            bg = color(char.bg, BG)
            if char.reverse:
                fg, bg = (bg if bg != BG else "#1e1e1e"), (fg if fg != FG else "#d4d4d4")
            px = (PAD + x * CELL_W) * scale
            py = (TITLE_H + PAD + (y - first) * CELL_H) * scale
            if bg != BG:
                draw.rectangle([px, py, px + CELL_W * scale, py + CELL_H * scale], fill=bg)
            if char.data.strip():
                key = (char.data, char.bold)
                if key not in big:
                    base = glyphs.font_for(char.data, char.bold)
                    big[key] = ImageFont.truetype(base.path, FONT_SIZE * scale, index=getattr(base, "index", 0))
                draw.text((px, py + 1 * scale), char.data, font=big[key], fill=fg)
    img.save(out, optimize=True)


class Session:
    def __init__(self, claude: str, cwd: Path) -> None:
        self.screen = pyte.Screen(COLS, ROWS)
        self.stream = pyte.ByteStream(self.screen)
        # Sin las variables de la sesion que lanza el script: claude arranca como una sesion normal.
        base = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE_CODE_", "CLAUDECODE"))}
        env = dict(base, TERM="xterm-256color", COLORTERM="truecolor", COLUMNS=str(COLS), LINES=str(ROWS), LATIGO_HOME=str(TEST_HOME))
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(cwd)
            os.execve(claude, [claude, "--plugin-dir", str(REPO)], env)
        self.pid, self.fd = pid, fd
        import fcntl, struct, termios
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))

    def pump(self, seconds: float) -> None:
        end = time.time() + seconds
        while time.time() < end:
            ready, _, _ = select.select([self.fd], [], [], 0.02)
            if ready:
                try:
                    data = os.read(self.fd, 65536)
                except OSError:
                    return
                self.stream.feed(data)

    def text(self) -> str:
        return "\n".join(self.screen.display)

    def wait_for(self, needle: str, timeout: float = 25) -> bool:
        end = time.time() + timeout
        while time.time() < end:
            self.pump(0.2)
            if needle in self.text():
                return True
        return False

    def send(self, keys: bytes) -> None:
        os.write(self.fd, keys)

    def close(self) -> None:
        try:
            os.kill(self.pid, signal.SIGTERM)
            time.sleep(0.48)
            os.kill(self.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def band_rows(screen: pyte.Screen) -> tuple[int, int]:
    """Filas desde la banda del latigo hasta el final del prompt."""
    lines = screen.display
    start = next((i for i, line in enumerate(lines) if "╾" in line), 0)
    # La fila de chispas va justo encima del latigo; abajo, el prompt y su pie.
    first = start - 1 if "látigo apagado" not in lines[start] else start
    return max(0, first), min(len(lines) - 1, start + 6)


def write_stats(total: int, effort_lashes: int, combo: int) -> None:
    BRIDGE.mkdir(exist_ok=True)
    today = time.strftime("%Y-%m-%d")
    stats = {"total": total, "onModel": total - effort_lashes, "onEffort": effort_lashes, "bestCombo": combo, "byDay": {today: min(total, 37)}}
    (BRIDGE / "stats.json").write_text(json.dumps({"version": 1, "stats": stats}))
    (BRIDGE / "config.json").write_text(json.dumps({"version": 1, "enabled": True, "sound": False}))


def scene(claude: str, cwd: Path, out: Path, name: str, title: str, total: int, actions: list[tuple[str, bytes, float]], full: bool = False) -> None:
    clear_plugin_store()
    write_stats(total, total // 2, 4)
    session = Session(claude, cwd)
    try:
        if not session.wait_for("╾", 20) and "trust this folder" in session.text():
            # Carpeta nueva: se elige "Yes, I trust this folder" (la opcion por defecto es salir).
            session.send(b"\x1b[B")
            session.pump(0.3)
            session.send(b"\r")
            session.wait_for("╾", 40)
        session.pump(1.5)
        # Limpia los avisos de arranque para que la captura muestre solo la sesion.
        session.send(b"/clear\r")
        session.wait_for("╾", 10)
        session.pump(1.0)
        # Redibujo completo: el emulador queda sin restos de lo que habia antes.
        session.send(b"\x0c")
        session.pump(0.8)
        for shot, keys, delay in actions:
            if keys:
                session.send(keys)
            session.pump(delay)
            if shot:
                rows = None if full else band_rows(session.screen)
                render(session.screen, out / f"{name}-{shot}.png", title, rows)
                print("captura", out / f"{name}-{shot}.png")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--claude", required=True)
    parser.add_argument("--out", default=str(REPO / "docs" / "img"))
    parser.add_argument("--cwd", default=str(REPO))
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    focus = b"\x18\t"  # ctrl+x tab: enfoca la banda
    with Sandbox():
        cwd = Path(args.cwd)
        scene(args.claude, cwd, out, "terminal-nivel1", "claude · nivel 1", 3, [
            ("reposo", b"", 0.3),
            ("", focus, 0.4),
            ("golpe", b"e", 0.47),
        ], full=False)
        scene(args.claude, cwd, out, "terminal-sesion", "claude · banda del látigo", 230, [
            ("completa", b"", 0.3),
        ], full=True)
        scene(args.claude, cwd, out, "terminal-nivel5", "claude · nivel 5 bronce", 230, [
            ("", focus + b"e", 0.15),
            ("combo", b"e", 0.48),
        ])
        scene(args.claude, cwd, out, "terminal-nivel9", "claude · nivel 9 oro", 1320, [
            ("", focus + b"m", 0.15),
            ("combo", b"m", 0.48),
        ])
        scene(args.claude, cwd, out, "terminal-nivel14", "claude · nivel 14 divino", 7100, [
            ("reposo", b"", 1.2),
            ("", focus, 0.4),
            ("golpe", b"e", 0.47),
        ])
        scene(args.claude, cwd, out, "terminal-latigazo", "claude · /latigazo en el chat", 1320, [
            ("", b"/latigazo", 0.6),
            ("chat", b"\r", 2.5),
        ], full=True)
        scene(args.claude, cwd, out, "terminal-apagado", "claude · látigo apagado", 230, [
            ("", focus + b"o", 0.6),
            ("banda", b"", 0.1),
        ])


if __name__ == "__main__":
    main()
