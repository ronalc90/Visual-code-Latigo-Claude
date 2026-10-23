# Cambios

Todos los cambios importantes de la extensión **Látigo para Claude Code**.

## [0.5.0] - 2026-10-23

Un solo interruptor y sonidos de látigo para elegir.

### Cambiado

- **Un solo interruptor.** «Látigo prendido / apagado» es el único control: va primero y en grande, con su atajo a la vista y una línea que explica qué hace en ese momento. Con la app de escritorio abierta, prenderlo vuelve tu puntero un látigo; apagarlo lo deja normal. Ya no hay un «modo látigo» aparte.
- **Atajo `⌃⌘L` en Mac** (`Ctrl+Cmd+L`); en Windows y Linux sigue siendo `Shift+Alt+L`. Con la app de escritorio abierta, `⌃⌘L` funciona en todo el sistema y hace lo mismo.
- **Tarjeta «App de escritorio»** (solo en Mac): dice si está abierta y si tu puntero es un látigo, cómo apagarlo (`Esc` o `⌃⌘L`), ofrece **Abrir la app** si está cerrada y **Cómo instalarla** si no está instalada. Avisa si otra app tiene ocupado `⌃⌘L`.
- Los comandos **Encender/Apagar** pasan a llamarse **Prender/Apagar**, y prender o apagar con el atajo avisa en la barra de estado en lugar de una notificación.
- La barra de estado muestra siempre `Látigo · Nv N` con el látigo prendido; el tooltip dice cuando tu puntero es un látigo.

### Agregado

- **Sonidos para elegir:** 9 estilos (6 grabaciones de látigos reales, uno que las alterna al azar, uno sintético y uno suave para la oficina). Fila de sonido en el panel con el interruptor, el desplegable con la descripción de cada estilo y el botón **Probar**, que suena aunque el sonido esté apagado.
- Elegir un estilo en el panel lo guarda en `~/.claude-latigo/config.json` y prende el sonido, igual que `/latigo sonido <estilo>` en Claude Code.
- Comando **Látigo: Elegir sonido**: una lista con los 9 estilos, abierta en el que suena ahora; solo cambia el estilo. Acepta el estilo como argumento para asignarle un atajo propio.
- El chasquido de cada latigazo cae justo en el impacto de la animación del panel, sea cual sea la grabación.

### Quitado

- La tarjeta **Modo látigo en pantalla**, su botón *Activar/Apagar modo látigo* y el comando **Látigo: Prender/Apagar el modo látigo en pantalla**.
- El archivo `~/.claude-latigo/whipmode.json`: la extensión ya no le pide nada a la app; las dos siguen el mismo interruptor.
- El sonido único `latigo.wav`.

## [0.4.0] - 2026-10-22

El látigo grande se va a la app de escritorio: la barra lateral pasa a ser el panel de estadísticas y control.

### Agregado

- **Modo látigo en pantalla:** botón grande *Activar modo látigo* / *Apagar modo látigo* que se lo pide a la app de escritorio (`~/.claude-latigo/whipmode.json`). El panel muestra si la app está abierta y si el modo está activo (`desktop.json`).
- **App cerrada o sin instalar:** botón **Abrir la app** (`open -a "Látigo"`, solo Mac) y, si no está instalada, enlace a la guía de instalación. En Windows y Linux dice que por ahora es solo para Mac.
- Comando **Látigo: Prender/Apagar el modo látigo en pantalla**, sin atajo en VS Code (`Ctrl+Cmd+L` lo tiene la app).
- En Mac, prender y apagar el látigo pasa a `Shift+Option+L` (como en Windows y Linux), para dejarle `Ctrl+Cmd+L` a la app.
- **Vista previa del látigo** en la tarjeta de nivel: se mece, echa chispas según el nivel y da un chasquido con el grito del combo por cada latigazo, venga de VS Code, de la terminal o del látigo en pantalla.
- La barra de estado muestra `⚡ Modo látigo · Nv N` cuando el modo látigo está activo.

### Cambiado

- **Panel rediseñado para la barra lateral angosta** (280 a 360 px): tarjetas de modo látigo, sesión de Claude Code, nivel, estadísticas y Top global. En ancho completo se acomoda en dos o tres columnas.
- Los latigazos al effort y al modelo pasan a ser dos botones chicos en la tarjeta de la sesión.
- Los latigazos de la terminal que suben de nivel ahora también muestran el letrero.

### Quitado

- El escenario grande con los blancos *Modelo* y *Effort*: el látigo grande ahora es el de la app de escritorio.

## [0.3.0] - 2026-10-22

### Agregado

- **Ícono en la barra de actividad de la izquierda:** el látigo, el interruptor y los botones a un clic. El panel se acomoda al ancho de la barra lateral.
- **Se abre solo al entrar a una conversación de Claude Code** (si el látigo está prendido), sin quitarle el foco al chat. Ajuste `latigo.showWithClaude`.
- **El botón Effort sube el effort de verdad:** el selector de modelo del chat de Claude muestra el nuevo nivel (lo aplica el plugin con `/effort`).

## [0.2.0] - 2026-10-22

Primera versión para VS Code.

### Agregado

- Panel **Látigo** en el área inferior: el látigo animado en un canvas (curva suave con mango, brillo, chispas con gravedad, destello y onda en la punta, sacudida en los combos grandes).
- Dos objetivos: **Modelo** (solo visual) y **Effort** (lo sube un nivel en la sesión abierta de Claude Code).
- Combos (`x2 ¡DOBLE!`, `x3 ¡TRIPLE!`, … `x20 ¡¡DIOS DEL LÁTIGO!!`) con colores propios.
- 14 niveles, de *Cuero crudo* a *Divino*: el látigo se va dorando poquito a poco con cada latigazo y suelta más chispas en los niveles altos. Letrero y sonido al subir de nivel.
- Tarjeta de nivel con barra de progreso y estadísticas: total, hoy, al effort, al modelo, mejor combo y tus 5 mejores días.
- Interruptor **Látigo encendido/apagado** compartido con Claude Code, e interruptor de sonido.
- Atajo para prender y apagar: `Ctrl+Cmd+L` en macOS y `Shift+Alt+L` en Windows y Linux. No usa `Ctrl+Alt+letra` porque en Windows es AltGr.
- Item en la barra de estado con el nivel; un clic abre el panel.
- Comandos en la paleta, categoría *Látigo*.
- Ajustes `latigo.showStatusBar`, `latigo.reducedMotion` y `latigo.volume`.
- Sección **Top global** a la vista, deshabilitada: llega en una próxima versión.
- Respeta *prefers-reduced-motion*: menos partículas y sin sacudidas.

### Robustez

- **La misma carpeta que el plugin en todos los sistemas:** `LATIGO_HOME`, luego `HOME` y luego la carpeta del usuario (en Windows, `USERPROFILE`).
- **Escritura atómica que reintenta** si Windows tiene el archivo ocupado un instante. Si el disco no deja escribir, avisa en lugar de fallar.
- **Un `stats.json` a medio escribir nunca hace bajar los conteos.**
- **El effort que se muestra es el que de verdad sale:** el mayor entre el de la sesión y el que fuerza el látigo.
- **Los combos dados en la terminal llegan al panel con su grito.**
