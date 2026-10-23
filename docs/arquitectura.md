# Arquitectura

El látigo tiene tres piezas que se pueden usar por separado o juntas:

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| **Plugin de Claude Code** (`latigo`) | raíz del repo: `.claude-plugin/`, `hooks/`, `types/`, `assets/` | Dibuja la banda sobre el prompt, cuenta los latigazos y sube el effort con `/effort` |
| **Extensión de VS Code** (`latigo-claude`) | `vscode/` | Barra lateral con el interruptor, la sesión, el sonido, el estado de la app y las estadísticas |
| **App de escritorio** (Mac) | `desktop/` | El puntero es un látigo: cada clic da un latigazo encima de la pantalla |

Comparten **las mismas reglas** (módulos puros en `hooks/`; la app las recibe como JSON al compilar) y se hablan por **unos pocos archivos JSON** en `~/.claude-latigo/`. Ninguna abre sockets ni usa la red.

**Un solo interruptor:** `enabled` en `config.json`. Lo cambian `/latigo on|off` y el botón de la banda, el interruptor y la tecla de VS Code, el atajo `⌃⌘L`, `Esc` y el menú de la app. Prendido, el látigo está en todas partes: la banda en la consola y, con la app abierta, el puntero es un látigo.

```
      hooks/model.ts   hooks/levels.ts   hooks/sounds.ts   hooks/bridge.ts      ← reglas puras (sin $, sin Node, sin DOM)
             │                │                │                 │
   ┌─────────┴────────────────┴────────────────┴─────────────────┴───────────────────┐
   │                                     │                                             │
 hooks/register.tsx (plugin)        vscode/src/… (extensión)        desktop/ (app, con niveles.json y sonidos.json)
 hooks/band.ts (banda)              webview, barra de estado         física, sintetizador, dibujo
   │                                     │                                             │
   └───────────────────────►  ~/.claude-latigo/*.json  ◄──────────────────────────────┘
```

## Módulos compartidos

| Archivo | Responsabilidad |
|---|---|
| `types/index.d.ts` | Tipos `Effort`, `Target`, `Stats`, `Lash` y el contrato de estado del plugin (`PluginState`). Claude Code exige que sea autocontenido. |
| `hooks/model.ts` | Reglas del juego: niveles de effort, combos (ventana de 1,5 s), conteos por día, fusión de conteos. Reexporta los tipos. |
| `hooks/levels.ts` | Los 14 niveles, el color interpolado latigazo a latigazo (`lookFor`), las partículas con semilla (`sparkRow`) y la barra de progreso. |
| `hooks/bridge.ts` | Rutas y formatos de los archivos compartidos. Cada lector es tolerante: un archivo roto o a medio escribir devuelve valores por defecto, nunca una excepción. |
| `hooks/sounds.ts` | Los 9 sonidos para elegir, sus archivos en `assets/sonidos/` y en qué milisegundo de cada archivo suena el golpe (`crackAtMs`). |
| `hooks/band.ts` | Solo del terminal: cuadros del látigo, fila de chispas con el grito, diseño adaptable al ancho y la tabla de `/latigo`. |
| `hooks/register.tsx` | Los hooks del plugin: `session.start`, `turn.step`, `ui.render` (banda) y `command.run` (`/latigo`, `/latigazo`). |

## Los sonidos

`assets/sonidos/` tiene 12 archivos: 6 grabaciones reales (CC0, [créditos](../assets/sonidos/CREDITOS.md)) y 6 sintéticos, hechos con el sintetizador de la app. Cada uno tiene su golpe en un momento conocido, y eso permite sincronizar:

- **En la consola,** la banda revienta en el cuadro 5 (350 ms después del clic). El plugin da play `350 − crackAtMs` ms después, así el chasquido cae cuando la banda revienta.
- **En la app,** el latigazo dura lo que pide el movimiento del mouse, o más si el archivo golpea después (los «completos», a los ~350 ms). El archivo se toca de modo que su golpe caiga cuando la punta llega al clic. Con el estilo «aire» no hay archivo: el sonido se sintetiza en el momento con el golpe exacto.
- **Las pruebas de la app** leen cada archivo y comprueban que su pico cae donde dice `hooks/sounds.ts`. También comprueban que los sintéticos salen igualitos del sintetizador actual.

## Cómo sube el effort

El latigazo al effort usa el mismo comando de Claude Code, `/effort`:

```
latigazo  ──►  boost = high  ──►  /effort high  ──►  los pedidos siguientes salen con high; indicador de la consola "● high"
calma / apagar  ──►  /effort <el de antes>       (solo si nadie lo cambió a mano)
```

**El selector del chat de VS Code («Opus 5.5 Medium») no se refresca solo** cuando el effort lo cambia un plugin. Lo vuelve a leer al conectarse, cuando la persona escribe un comando con `/` o cuando cambia de modelo. El effort sí cambia: se comprobó con el SDK, pidiendo los ajustes aplicados antes y después (`medium` → `high`) y mirando el effort del pedido siguiente. Por eso el nivel nuevo se muestra en lo que sí controlamos: el golpe de la app («effort ▲ high»), la banda de la consola y la barra lateral de VS Code. Para ver el selector al día, basta escribir `/latigo`.

- **Desde adentro de otro comando** (`/latigazo`, `/latigo calma`), Claude Code no deja correr `/effort` en ese momento. El plugin lo deja pendiente y lo corre la revisión periódica (cada 0,6 s).
- **Como respaldo, `turn.step`** sube cada pedido al modelo si el effort que sale es menor que el forzado. Nunca baja uno mayor y no toca los subagentes.
- **Al arrancar**, el plugin lee el effort guardado para el modelo en `~/.claude/settings.json` para mostrarlo en la banda antes del primer pedido.
- **Claude Code guarda `/effort` como predeterminado** para sesiones nuevas (salvo `max`), y calmar el látigo lo devuelve.

## App de escritorio (`desktop/`)

Una app de Mac en Swift, sin dependencias, que dibuja el látigo encima de toda la pantalla.

| Archivo | Responsabilidad |
|---|---|
| `Model.swift` | Conteos, combos, niveles y effort. Los niveles se leen de `Resources/niveles.json`, que `build.sh` genera de `hooks/levels.ts`; las pruebas comprueban que la interpolación de colores da lo mismo que en TypeScript. `EffortForecast` calcula a qué effort sube cada golpe, aunque la sesión tarde 3 s en confirmarlo. |
| `Physics.swift` | El movimiento del mouse (`MotionTracker`), el plan del latigazo (`LashPlan`), la cuerda (`Rope`) y los efectos del golpe. |
| `Synth.swift` | El sonido sintético («aire» y «suave»), calibrado con las grabaciones reales, y el WAV de `--render-sounds`. |
| `Sounds.swift` | El catálogo de sonidos (`Resources/sonidos.json`, generado de `hooks/sounds.ts`) y cómo sincronizar un archivo con el golpe. |
| `Renderer.swift` | Dibuja la cuerda (una cinta que se afina, trenzada, con tralla y remate), el mango, las estelas y los efectos en un `CGContext`. Lo usan las ventanas y los modos `--demo` y `--frames`. |
| `System.swift` | Atajos globales (Carbon), qué app hay debajo del clic, el audio (grabaciones y sintético) y las ventanas transparentes. |
| `StatusMenu.swift` | El menú de la barra: interruptor, Esc, sonidos, nivel, atajo, abrir al iniciar sesión. |
| `Bridge.swift` | Los mismos archivos de `~/.claude-latigo/`. |
| `AppController.swift` | El interruptor, los clics, los latigazos, el sonido y la revisión del puente. |

Cómo funciona:

- **Ventanas:** son transparentes, van sobre todo (nivel *screen saver*, en todos los escritorios) e **ignoran el mouse**, así que los clics pasan a la app de abajo. La app sigue la posición del puntero cuadro a cuadro y escucha los clics con un monitor global (los de mouse no piden permisos). Con la cuerda quieta no redibuja nada; mientras se mueve, solo la zona de la cuerda.
- **La cuerda en reposo:** 40 tramos (Verlet, con restricciones de largo y algo de rigidez hacia el mango). La punta va en el puntero y cada punto se acerca a donde estuvo la punta hace un instante, a su misma distancia de cuerda: así la cuerda dibuja el recorrido (recto, curva, zigzag). Quieta, se acomoda en la mano, abajo y detrás del último movimiento, lejos del borde de la pantalla. Una pasada final desde la punta impide que se estire.
- **El latigazo** (`LashState`): la mano tira hacia atrás y da un golpe de muñeca; la cuerda se tiende hacia el clic; un rizo de verdad (la cuerda se cruza consigo misma) sale del mango y corre hacia la punta cada vez más rápido; cuando llega, la punta da la vuelta y revienta justo en el clic. Después la cuerda vuelve a la física con la velocidad que traía, y el rebote sale solo.
- **Cambia con el movimiento** (`MotionTracker` → `LashPlan`): quieto, un latigazo por arriba; recto, la cuerda más tendida; con giro, más curva y con el rizo del lado del giro; en zigzag, la cuerda ondula y truena dos veces. Mientras más rápido, más corto (de 0,14 a 0,36 s) y más fuerte.
- **Effort:** si debajo del clic hay una ventana de VS Code, una terminal o la app de Claude (por el nombre de su dueño, que no pide grabar la pantalla), el golpe suma en `stats.json` y, si hay una sesión viva, sube `effort.json`. El plugin lo aplica con `/effort`. En el golpe se ve a qué nivel subió.
- **Atajo:** `⌃⌘L` se registra en exclusiva con Carbon. Si otra app ya lo tiene en exclusiva, la app lo avisa en el menú y en `desktop.json` (`hotkey: "ocupado"`). macOS no deja ver los registros que no son exclusivos. Al abrirse, la app cierra cualquier otra copia suya, y la primera vez que se abre desde Aplicaciones queda para abrir al iniciar sesión. `Latigo --diagnostico` dice si el atajo se pudo registrar, si hay otra copia abierta y cómo está el puente.
- **Presencia:** la app escribe `desktop.json` cada 2 s: si el puntero es un látigo y el estado del atajo. VS Code lo muestra en su tarjeta de la app.

## Claude Code en VS Code

El chat de Claude Code en VS Code (versión 2.1.293) no dibuja interfaz de plugins: su código no tiene `ui_render`, y VS Code no deja que otra extensión dibuje ni escuche clics dentro de su ventana. Por eso:

- **Los comandos** (`/latigazo`, `/latigo …`) y el cambio de effort funcionan igual que en la consola, porque el chat usa el mismo motor.
- **El látigo animado** lo pone la extensión en su vista de la barra de la izquierda. `ClaudeFocusWatcher` mira las pestañas: cuando la activa es una conversación de Claude (`viewType` `claudeVSCodePanel`) y el látigo está prendido, muestra la vista sin quitarle el foco al chat.

## El puente: `~/.claude-latigo/`

| Archivo | Lo escribe | Lo lee | Contenido |
|---|---|---|---|
| `config.json` | todos (tecla, botón, menú, `/latigo on/off/sonido`) | todos | `{ enabled, sound, soundStyle }`: el único interruptor y el sonido elegido |
| `stats.json` | quien da el latigazo | los dos | conteos: total, por blanco, mejor combo, por día |
| `effort.json` | VS Code | Claude Code | `{ seq }`: sube 1 por cada latigazo al effort dado desde el panel |
| `lash.json` | quien da el latigazo | el otro lado | el último latigazo, para animarlo también allá |
| `presence.json` | Claude Code, cada 3 s | VS Code y la app | modelo, effort de la sesión y effort forzado; vale 15 s |
| `desktop.json` | la app, cada 2 s | VS Code | `{ at, whipMode, hotkey }`: si el puntero es un látigo y si el atajo funciona; vale 6 s |

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

`hydrate()` vuelve a leer los conteos, el interruptor y el sonido, pone en cero la animación (una recarga en pleno golpe no deja la banda congelada) y registra otra vez `/latigo` y `/latigazo`. Mientras la sesión no está cargada, la banda no dibuja nada, para no mostrar conteos en cero.

Si Claude Code rechaza registrar los comandos, el látigo sigue funcionando. Pasa, por ejemplo, con el plugin cargado dos veces en la misma sesión, y el aviso es «`$.command.register refused`». El sondeo lo reintenta cada 6 s. Antes ese rechazo tumbaba todo el arranque («`session.start hook skipped`») y la banda y el effort dejaban de andar.

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
