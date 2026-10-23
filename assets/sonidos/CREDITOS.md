# Créditos de los sonidos

## Grabaciones reales (`real-1.wav` a `real-6.wav`)

Son de **Joseph Sardin**, publicadas en [BigSoundBank](https://bigsoundbank.com) con licencia **CC0 1.0** (dominio público): se pueden usar, modificar y redistribuir sin pedir permiso ni dar crédito. Igual se lo damos.

| Archivo | Grabación original |
|---|---|
| `real-1.wav` | [Whip crack #1](https://bigsoundbank.com/whip-crack-1-s2949.html) |
| `real-2.wav` | [Whip crack #2](https://bigsoundbank.com/whip-crack-2-s2950.html) |
| `real-3.wav` | [Whip crack #3](https://bigsoundbank.com/whip-crack-3-s2951.html) |
| `real-4.wav` | [Whip crack #4](https://bigsoundbank.com/whip-crack-4-s2952.html) |
| `real-5.wav` | [Complete whip #1](https://bigsoundbank.com/complete-whip-1-s2961.html) |
| `real-6.wav` | [Complete whip #2](https://bigsoundbank.com/complete-whip-2-s2962.html) |

`scripts/sonidos_reales.py` las recorta desde el FLAC original: un filtro contra el retumbe grave, 44,1 kHz mono, el mismo nivel de pico y el golpe en un momento conocido (el que dice `hooks/sounds.ts`).

## Sintéticos (`aire-*.wav` y `suave-*.wav`)

Los hace la app de escritorio con su sintetizador (`desktop/Sources/Synth.swift`), calibrado con esas grabaciones:

```
desktop/build/Látigo.app/Contents/MacOS/Latigo --render-sounds assets
```

## `../nivel.wav`

El sonido de subir de nivel, generado desde cero para este proyecto.
