"""Sintetiza los sonidos del latigo desde cero (sin muestras de terceros).

Un latigazo real tiene tres partes:
  1. el zumbido: el aire cortado por la cuerda, cada vez mas agudo mientras la
     punta acelera (ruido filtrado con un pasabanda que sube de frecuencia);
  2. el chasquido: la punta rompe la barrera del sonido y suelta una onda de
     choque (una onda en N de menos de un milisegundo) mas un rafagazo de ruido
     agudo y un "snap" tonal muy corto;
  3. la cola: el eco del cuarto (unos cuantos retardos atenuados).

Genera assets/latigo.wav (el principal) y assets/latigo-2.wav, assets/latigo-3.wav
(variantes para que no suene siempre igual). assets/nivel.wav no se toca.

Uso: python3 scripts/sonidos.py
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

RATE = 44100
ASSETS = Path(__file__).resolve().parent.parent / "assets"


class Biquad:
    """Pasabanda de segundo orden (RBJ), con frecuencia que puede cambiar."""

    def __init__(self) -> None:
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0

    def bandpass(self, x: float, freq: float, q: float) -> float:
        w0 = 2 * math.pi * min(freq, RATE * 0.45) / RATE
        alpha = math.sin(w0) / (2 * q)
        b0, b1, b2 = alpha, 0.0, -alpha
        a0, a1, a2 = 1 + alpha, -2 * math.cos(w0), 1 - alpha
        y = (b0 * x + b1 * self.x1 + b2 * self.x2 - a1 * self.y1 - a2 * self.y2) / a0
        self.x2, self.x1 = self.x1, x
        self.y2, self.y1 = self.y1, y
        return y


def whip(seed: int, swoosh_s: float, start_hz: float, end_hz: float, crack_gain: float) -> list[float]:
    rnd = random.Random(seed)
    out: list[float] = []

    # 1. Zumbido: dos pasabandas que suben (cuerda y punta), amplitud que crece.
    n = int(RATE * swoosh_s)
    body, tip = Biquad(), Biquad()
    for i in range(n):
        t = i / n
        noise = rnd.uniform(-1, 1)
        freq = start_hz * (end_hz / start_hz) ** (t ** 1.7)
        s = body.bandpass(noise, freq * 0.5, 1.4) * 0.8 + tip.bandpass(noise, freq, 3.2) * 0.9
        env = (t ** 2.2) * (0.25 + 0.75 * t)
        out.append(s * env * 0.9)

    # 2. Chasquido: onda en N + rafaga aguda + snap tonal.
    crack_len = int(RATE * 0.12)
    hp_prev_in = hp_prev_out = 0.0
    snap_hz = rnd.uniform(2600, 3400)
    for i in range(crack_len):
        t = i / RATE
        n_wave = 0.0
        if i < 14:  # ~0.3 ms de subida, ~0.3 ms de bajada
            n_wave = 1.0 - i / 7.0 if i < 14 else 0.0
        noise = rnd.uniform(-1, 1)
        hp = 0.97 * (hp_prev_out + noise - hp_prev_in)  # pasa-altos simple
        hp_prev_in, hp_prev_out = noise, hp
        burst = hp * math.exp(-t * 260)
        snap = math.sin(2 * math.pi * snap_hz * t) * math.exp(-t * 180) * 0.5
        body_thump = math.sin(2 * math.pi * 180 * t) * math.exp(-t * 60) * 0.25
        out.append((n_wave * 1.6 + burst + snap + body_thump) * crack_gain)

    # 3. Silencio para la cola.
    out.extend([0.0] * int(RATE * 0.35))

    # Cola: retardos tipo cuarto chico (no son exactos a proposito).
    crack_at = n
    for delay_ms, gain in ((23, 0.32), (41, 0.22), (67, 0.15), (97, 0.1), (131, 0.07), (173, 0.045)):
        d = int(RATE * delay_ms / 1000)
        for i in range(crack_at, crack_at + crack_len):
            j = i + d
            if j < len(out):
                out[j] += out[i] * gain

    # Suavizado de los bordes y normalizacion.
    fade = int(RATE * 0.004)
    for i in range(fade):
        out[i] *= i / fade
        out[-1 - i] *= i / fade
    peak = max(abs(v) for v in out) or 1.0
    return [v / peak * 0.92 for v in out]


def save(samples: list[float], path: Path) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))
    print("listo", path.name, f"{len(samples) / RATE:.2f}s")


def main() -> None:
    save(whip(seed=7, swoosh_s=0.26, start_hz=220, end_hz=3200, crack_gain=1.0), ASSETS / "latigo.wav")
    save(whip(seed=19, swoosh_s=0.2, start_hz=260, end_hz=3800, crack_gain=1.1), ASSETS / "latigo-2.wav")
    save(whip(seed=31, swoosh_s=0.32, start_hz=180, end_hz=2900, crack_gain=0.95), ASSETS / "latigo-3.wav")


if __name__ == "__main__":
    main()
