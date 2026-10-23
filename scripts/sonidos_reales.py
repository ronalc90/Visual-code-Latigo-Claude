"""Recorta las 6 grabaciones reales de latigo y las deja en assets/sonidos/real-N.wav.

Las grabaciones son de Joseph Sardin en BigSoundBank, con licencia CC0 (dominio
publico); los creditos estan en assets/sonidos/CREDITOS.md.

Como suena un latigo real, segun estas grabaciones:
  - el zumbido antes del golpe casi no se oye (40 a 60 dB por debajo del golpe),
    salvo en los latigazos completos, donde se oye la cuerda cortando el aire;
  - el golpe es un chasquido instantaneo que cubre todas las frecuencias (centro
    en 4,5-5,5 kHz, sin graves). A veces es doble;
  - despues viene un siseo que se apaga en 120 a 500 ms: el "suufff" del aire.

Cada recorte deja el golpe en un momento conocido (CRACK_AT_S): la app de
escritorio lo usa para que la animacion pegue justo con el sonido, y el plugin
para que suene cuando la banda revienta. hooks/sounds.ts guarda esos mismos
valores y las pruebas de la app comprueban que coinciden con los archivos.

Uso:
  1. Descarga los FLAC originales:
       for id in 2949 2950 2951 2952 2961 2962; do
         curl -sLo "$DIR/$id.flac" "https://bigsoundbank.com/UPLOAD/flac/$id.flac"
       done
  2. python3 scripts/sonidos_reales.py "$DIR"     (necesita ffmpeg, numpy y scipy)
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfiltfilt

RATE = 44100
ASSETS = Path(__file__).resolve().parent.parent / "assets" / "sonidos"
PEAK_DBFS = -1.5
FADE_IN_S = 0.010
FADE_OUT_S = 0.150

# (archivo de salida, id en BigSoundBank, golpe en el original en s, antes del golpe, despues del golpe)
# El golpe es el primer chasquido: en el doble (2950) es el primero de los dos, y
# en los completos (2961, 2962) es el fuerte, no el zumbido de la cuerda.
CLIPS = [
    ("real-1.wav", 2949, 0.2141, 0.150, 0.75),
    ("real-2.wav", 2950, 0.1910, 0.150, 0.75),
    ("real-3.wav", 2951, 0.2585, 0.150, 0.80),
    ("real-4.wav", 2952, 0.3233, 0.180, 1.00),
    ("real-5.wav", 2961, 0.5161, 0.346, 0.70),
    ("real-6.wav", 2962, 0.5634, 0.353, 0.65),
]


def decode(flac: Path, rate: int) -> np.ndarray:
    """Decodifica con ffmpeg a mono en float."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "x.wav"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(flac), "-ac", "1", "-ar", str(rate), "-c:a", "pcm_f32le", str(out)],
            check=True,
        )
        _, data = wavfile.read(out)
    return data.astype(np.float64)


def trim(source: np.ndarray, source_rate: int, crack_s: float, before_s: float, after_s: float) -> np.ndarray:
    start = int(round((crack_s - before_s) * source_rate))
    end = int(round((crack_s + after_s) * source_rate))
    if start < 0 or end > len(source):
        raise ValueError("el recorte se sale de la grabacion")
    clip = source[start:end]
    # Sin retumbe grave (golpes del microfono, viento): el latigo no tiene graves.
    clip = sosfiltfilt(butter(2, 70, btype="highpass", fs=source_rate, output="sos"), clip)
    clip = resample_poly(clip, 147, 160) if source_rate == 48000 else clip
    clip = clip / np.max(np.abs(clip)) * 10 ** (PEAK_DBFS / 20)
    fade_in = int(FADE_IN_S * RATE)
    fade_out = int(FADE_OUT_S * RATE)
    clip[:fade_in] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fade_in))
    clip[-fade_out:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fade_out))
    return clip


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1])
    ASSETS.mkdir(parents=True, exist_ok=True)
    source_rate = 48000
    for name, sound_id, crack_s, before_s, after_s in CLIPS:
        clip = trim(decode(folder / f"{sound_id}.flac", source_rate), source_rate, crack_s, before_s, after_s)
        wavfile.write(ASSETS / name, RATE, np.round(clip * 32767).astype(np.int16))
        loudest = int(np.argmax(np.abs(clip))) / RATE
        print(f"{name}: {len(clip) / RATE:.3f} s, golpe a los {before_s * 1000:.0f} ms (pico a los {loudest * 1000:.0f} ms)")


if __name__ == "__main__":
    main()
