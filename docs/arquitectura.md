# Arquitectura

El látigo tiene dos piezas que se pueden usar por separado o juntas:

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| **Plugin de Claude Code** (`latigo`) | raíz del repo: `.claude-plugin/`, `hooks/`, `types/`, `assets/` | Dibuja la banda sobre el prompt, cuenta los latigazos y sube el effort de cada pedido al modelo |
| **Extensión de VS Code** (`latigo-claude`) | `vscode/` | Panel con el látigo animado en canvas, barra de estado, tecla para prender y apagar, comandos |

Las dos comparten **las mismas reglas** (módulos puros en `hooks/`) y se hablan por **unos pocos archivos JSON** en `~/.claude-latigo/`. Ninguna abre sockets ni usa la red.

```
                 hooks/model.ts   hooks/levels.ts   hooks/bridge.ts      ← reglas puras (sin $, sin Node, sin DOM)
                        │                │                 │
          ┌─────────────┴────────────────┴─────────────────┴──────────────┐
          │                                                                │
   hooks/register.tsx  (plugin de Claude Code)              vscode/src/…  (extensión de VS Code)
   hooks/band.ts       (dibujo de la banda)                 webview con canvas, barra de estado
          │                                                                │
          └──────────────►  ~/.claude-latigo/*.json  ◄─────────────────────┘
```

## Módulos compartidos

| Archivo | Responsabilidad |
|---|---|
| `types/index.d.ts` | Tipos `Effort`, `Target`, `Stats`, `Lash` y el contrato de estado del plugin (`PluginState`). Claude Code exige que sea autocontenido. |
| `hooks/model.ts` | Reglas del juego: niveles de effort, combos (ventana de 1,5 s), conteos por día, fusión de conteos. Reexporta los tipos. |
| `hooks/levels.ts` | Los 14 niveles, el color interpolado latigazo a latigazo (`lookFor`), las partículas con semilla (`sparkRow`) y la barra de progreso. |
| `hooks/bridge.ts` | Rutas y formatos de los archivos compartidos. Cada lector es tolerante: un archivo roto o a medio escribir devuelve valores por defecto, nunca una excepción. |
| `hooks/band.ts` | Solo del terminal: cuadros del látigo, fila de chispas con el grito, diseño adaptable al ancho y la tabla de `/latigo`. |
| `hooks/register.tsx` | Los hooks del plugin: `session.start`, `turn.step`, `ui.render` (banda) y `command.run` (`/latigo`). |

## Cómo sube el effort

El latigazo al effort usa el mismo comando de Claude Code, `/effort`, que es lo que muestran el selector de modelo del chat de VS Code y el indicador de la consola:

```
latigazo  ──►  boost = high  ──►  /effort high  ──►  selector "Opus 5.5 High", indicador "● high"
calma / apagar  ──►  /effort <el de antes>       (solo si nadie lo cambió a mano)
```

- **Desde adentro de otro comando** (`/latigazo`, `/latigo calma`), Claude Code no deja correr `/effort` en ese momento. El plugin lo deja pendiente y lo corre la revisión periódica (cada 0,6 s).
- **Como respaldo, `turn.step`** sube cada pedido al modelo si el effort que sale es menor que el forzado. Nunca baja uno mayor y no toca los subagentes.
- **Al arrancar**, el plugin lee el effort guardado para el modelo en `~/.claude/settings.json` para mostrarlo en la banda antes del primer pedido.
- **Claude Code guarda `/effort` como predeterminado** para sesiones nuevas (salvo `max`), y calmar el látigo lo devuelve.

## Claude Code en VS Code

El chat de Claude Code en VS Code (versión 2.1.293) no dibuja interfaz de plugins: su código no tiene `ui_render`, y VS Code no deja que otra extensión dibuje ni escuche clics dentro de su ventana. Por eso:

- **Los comandos** (`/latigazo`, `/latigo …`) y el cambio de effort funcionan igual que en la consola, porque el chat usa el mismo motor.
- **El látigo animado** lo pone la extensión en su vista de la barra de la izquierda. `ClaudeFocusWatcher` mira las pestañas: cuando la activa es una conversación de Claude (`viewType` `claudeVSCodePanel`) y el látigo está prendido, muestra la vista sin quitarle el foco al chat.

## El puente: `~/.claude-latigo/`

| Archivo | Lo escribe | Lo lee | Contenido |
|---|---|---|---|
| `config.json` | los dos (tecla, botón, `/latigo on/off/sonido`) | los dos | `{ enabled, sound }` |
| `stats.json` | quien da el latigazo | los dos | conteos: total, por blanco, mejor combo, por día |
| `effort.json` | VS Code | Claude Code | `{ seq }`: sube 1 por cada latigazo al effort dado desde el panel |
| `lash.json` | quien da el latigazo | el otro lado | el último latigazo, para animarlo también allá |
| `presence.json` | Claude Code, cada 3 s | VS Code | modelo, effort de la sesión y effort forzado; vale 15 s |

Reglas que evitan sorpresas:

- **La misma carpeta en los dos lados:** `LATIGO_HOME`, luego `HOME` y luego la carpeta del usuario (`USERPROFILE` en Windows). Las pruebas usan `LATIGO_HOME` para no tocar el puente real.
- **Lo que estaba antes no se aplica.** Al arrancar, el plugin toma el `seq` y el último latigazo que ya había en disco como vistos.
- **Un `seq` menor, leído bien, es un reinicio.** Si alguien borró `effort.json`, lo nuevo cuenta desde ahí. Una lectura que falla un instante no cambia nada.
- **Los conteos solo crecen.** Cada lado fusiona su copia con la del disco quedándose con el mayor de cada campo (`mergeStats`). Si dos escriben a la vez, se pierde a lo sumo un latigazo, nunca la tabla.
- **`config.json` solo cuenta si cambió por fuera.** El plugin recuerda el último texto que leyó o escribió. Al guardar toca solo el campo que cambió, sobre lo que hay en disco. Mientras guarda, el sondeo no lo lee. Así un apagado hecho en la banda no lo deshace el sondeo, y no se pisa un cambio de sonido hecho en VS Code.
- **Apagado no hace nada.** Los latigazos al effort que lleguen con el látigo apagado se marcan como vistos y no suben nada. Apagar también quita el effort forzado.
- **Al salir, la presencia vence enseguida.** Con `session.end` (salvo `/clear`), el plugin escribe la presencia con `at: 0`.
- **Varias sesiones comparten el puente.** Cada una aplica los latigazos al effort que manda VS Code, y la presencia es la de la que escribió último.
- **Sin carpeta o sin permiso de escritura**, el plugin sigue funcionando dentro de la sesión. Lo único que se pierde es la conexión con VS Code. La extensión reintenta el renombrado si Windows tiene el archivo ocupado, y si no puede escribir, avisa.

El plugin revisa el puente cada 600 ms con `$.clock.every`. La extensión de VS Code lo vigila con `fs.watch` y, como respaldo, con sondeo.

## `/clear` y recargas

En Claude Code, `/clear` no reinicia el proceso: empieza una sesión nueva con el `$.state` en blanco y **no** dispara `session.start`; solo llega `session.end` con `reason: 'clear'`. Por eso toda la carga vive en `hydrate()`:

- **Al arrancar** (`session.start`), con todo.
- **Tras `/clear`** (`session.end` con `reason: 'clear'`), en cuanto empieza la sesión nueva.
- **Como red de seguridad**, desde el sondeo, si encuentra el estado sin cargar (`ready` en `false`).

`hydrate()` vuelve a leer los conteos y el interruptor, pone en cero la animación (una recarga en pleno golpe no deja la banda congelada) y registra otra vez `/latigo`. Mientras la sesión no está cargada, la banda no dibuja nada, para no mostrar conteos en cero.

## La banda del terminal

```
 ✦✶ ✦✷✦  ✦❂¡¡CHAAAAS!!❂✦ ✶       ← fila de arriba: chispas del nivel y el grito saliendo de la punta
╾━━━━━━~~~~~❂   [ opus-5-5 ] [ ✸ effort: xhigh ⚡ ✸ ] x3 ¡TRIPLE! Nv 14 Divino ██████████ · 7101 latigazos [ apagar ]
```

- **El látigo tiene 11 cuadros de 70 ms**: se estira, revienta durante 3 cuadros y se recoge.
- **Las dos filas no cambian de alto ni de ancho**, así que los botones no saltan.
- **Si no cabe**, `layoutBand` suelta piezas en este orden: la barra de progreso, el conteo, el nombre del nivel y el grito del combo. El látigo, los dos blancos y el botón de apagar siempre quedan.
- **Si la persona activó `reduceMotion` en Claude Code**, el látigo va directo al golpe y las chispas no titilan en reposo.

## Niveles

Los umbrales se separan cada vez más: 25, 35, 60, 100, 160, 220, 300, 400, 550, 750, 1000, 1400 y 2000 latigazos entre un nivel y el siguiente. Dentro de cada nivel, el color se mezcla con el del siguiente según el avance (`mixHex`). Por eso un solo latigazo casi no se nota, pero cien sí. La imagen [`img/evolucion.png`](img/evolucion.png) sale de estos mismos datos.

| Nv | Nombre | Desde | Chispas |
|---:|---|---:|---|
| 1 | Cuero crudo | 0 | — |
| 2 | Cuero curtido | 25 | — |
| 3 | Trenzado | 60 | · |
| 4 | Cobre | 120 | · ˙ |
| 5 | Bronce | 220 | · ˙ ⋅ |
| 6 | Plata vieja | 380 | · ˙ ⋆ |
| 7 | Plata | 600 | · ⋆ ✧ |
| 8 | Oro pálido | 900 | · ⋆ ✧ |
| 9 | Oro | 1.300 | ⋆ ✧ ✦ |
| 10 | Oro brillante | 1.850 | ⋆ ✧ ✦ |
| 11 | Oro real | 2.600 | ✧ ✦ ✶ |
| 12 | Dorado épico | 3.600 | ✧ ✦ ✶ ✷ |
| 13 | Legendario | 5.000 | ✦ ✶ ✷ ❋ |
| 14 | Divino | 7.000 | ✦ ✶ ✷ ❋ ✺ |
