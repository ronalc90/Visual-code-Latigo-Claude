# Cambios

## 0.5.0 · 2026-10-23

Un solo interruptor, un latigazo de verdad y el sonido de un látigo real.

### En todas partes
- **Un solo interruptor.** *Látigo prendido* es lo mismo en la app, la consola y VS Code: prendido, la banda está en la consola y, con la app abierta, el puntero es un látigo. Se acabó el «modo látigo» aparte con su propio botón (y su archivo `whipmode.json`).
- **Sonidos para elegir:** 6 grabaciones reales de látigo (CC0, de BigSoundBank) y dos sintéticos, *aire* y *suave*. Se eligen en el menú de la app, en la barra de VS Code o con `/latigo sonido <nombre>`.

### App de escritorio
- **El latigazo se ve de verdad.** La mano tira hacia atrás, un bucle sale del mango y corre hasta la punta cada vez más rápido, y la punta da la vuelta y revienta **justo en el clic**. Quedan estelas, la raya de la punta y la onda de choque. Antes era una onda chiquita que hacía ver el látigo como una caña de pescar.
- **La cuerda sigue tu movimiento:** en línea recta queda tendida, en curva se curva y en zigzag ondula. Quieta, se acomoda en la mano, del lado contrario al movimiento y lejos del borde.
- **El latigazo cambia con el movimiento:** quieto, recto, con giro (más curvo, con el bucle del lado del giro) o en zigzag (ondula y truena dos veces). Mientras más rápido, más corto y más fuerte.
- **Suena como un látigo real, no como un *crash*.** El sintetizador nuevo está calibrado con 6 grabaciones: zumbido casi mudo, chasquido centrado en ~5 kHz y la cola de siseo, el *suufff*. Se quitaron el golpe grave y el tono. El chasquido cae justo cuando la punta llega al clic.
- **En el golpe se ve el effort nuevo** (*effort ▲ high*, *effort ya en max*, *sin sesión de Claude Code*), porque el selector del chat de VS Code no se refresca cuando un plugin cambia el effort.
- **`⌃⌘L` más firme:**
  - se registra en exclusiva, y el menú avisa si otra app la tiene;
  - la app cierra otras copias suyas;
  - la primera vez que se abre desde Aplicaciones queda para abrir al iniciar sesión;
  - al prender y apagar sale un aviso junto al puntero;
  - `Latigo --diagnostico` revisa todo.
- **Menú nuevo:** el interruptor; *Esc también lo apaga*, que se puede desmarcar; el sonido con vista previa; *Zumbido al mover el látigo*, que viene apagado; y el estado del atajo.
- Solo redibuja la zona de la cuerda, y nada cuando está quieta.
- 203 comprobaciones, entre ellas que cada archivo de sonido golpea donde dice su catálogo.

### Plugin de Claude Code
- **El sonido elegido**, y el chasquido cae cuando la banda revienta.
- `/latigo sonidos`, `/latigo sonido <nombre>` y `/latigo sonido on|off`.
- **Si Claude Code rechaza registrar `/latigo`, el látigo sigue funcionando** y lo reintenta. Pasa con el plugin cargado dos veces. Antes ese rechazo tumbaba todo el arranque («`session.start hook skipped`»).
- 110 pruebas y 22 de punta a punta con Claude Code real.

### Extensión de VS Code
- **Un solo interruptor** con su atajo; se quitó el botón *Activar modo látigo*.
- **Tarjeta de la app de escritorio:** abierta o cerrada (con botón para abrirla) y aviso si otra app tiene `⌃⌘L`.
- **Sonido:** prender o apagar, elegir entre los 9 y *Probar*.
- En Mac, el látigo vuelve a `⌃⌘L` (con la app abierta lo atiende la app, sin la app lo atiende VS Code).
- El chasquido del panel cae con el golpe de su animación.
- 191 pruebas unitarias y 36 en un VS Code real.

## 0.4.0 · 2026-10-22

El látigo sale a la pantalla.

### App de escritorio para Mac (nueva)
- **Modo látigo con `Ctrl+Cmd+L`** desde cualquier app (`Esc` sale). El puntero se vuelve un látigo con física de cuerda que cuelga, se mece y restalla.
- **Cada clic restalla encima de la pantalla** y los clics siguen llegando a las apps. Sobre una conversación de Claude (VS Code, terminales, app de Claude), el golpe sube un nivel de effort.
- **Golpe** con destello, onda de choque, chispas del nivel, grito y combos.
- **Sonido sintetizado en cada golpe, nunca igual**, imitando un látigo real: zumbido que acelera, onda de choque de la punta, doble chasquido a veces, caída de la cuerda y eco.
- **Menú en la barra:** nivel, sonido, abrir al iniciar sesión.
- App universal (Intel y Apple Silicon), con 98 comprobaciones propias.

### Plugin de Claude Code
- Alterna tres chasquidos nuevos, más reales.
- Acepta y anima los latigazos de la app de escritorio.
- 99 pruebas.

### Extensión de VS Code
- La barra lateral pasa a ser de **estadísticas y control**: modo látigo en pantalla, sesión de Claude, látigo del nivel en miniatura, números, mejores días y el Top global en gris.
- En Mac, prender y apagar el látigo pasa a `Shift+Option+L`; `Ctrl+Cmd+L` queda para el modo látigo de la app.
- 147 pruebas unitarias y 26 en un VS Code real.

## 0.3.0 · 2026-10-22

Funciona igual en la consola y en el Claude de VS Code.

### Plugin de Claude Code
- **El effort sube de verdad con `/effort`:** el selector de modelo del chat de VS Code y el indicador de la consola muestran el nuevo nivel. `/latigo calma` y apagar devuelven el effort que tenías, y si lo cambiaste a mano por encima, se respeta.
- **`/latigazo`:** latigazo al effort escrito en el chat (consola o VS Code). Sube el effort y deja el látigo en la conversación.
- **Muestra desde el arranque el effort guardado** para el modelo.
- 98 pruebas del plugin y 22 de punta a punta con Claude Code real.

### Extensión de VS Code
- **Ícono propio en la barra de la izquierda**, con un diseño para el ancho de la barra lateral.
- **Se abre sola al entrar a una conversación de Claude Code** si el látigo está prendido, sin quitarle el foco al chat. Ajuste `latigo.showWithClaude`.
- 121 pruebas unitarias y 19 en un VS Code real.

## 0.2.0 · 2026-10-22

### Plugin de Claude Code
- 14 niveles, de Cuero crudo a Divino. Cada latigazo dora un poquito el látigo: el color se mezcla con el del nivel siguiente según el avance.
- Partículas desde el nivel 3, cada vez más densas y con glifos más vistosos. En los niveles altos titilan en reposo.
- Subida de nivel con sonido propio (`assets/nivel.wav`) y aviso.
- El grito del golpe sale de la punta en una fila propia y crece con el nivel: `¡CHAS!` → `❂¡¡CHAAAAS!!❂`.
- Botón `apagar`/`encender` en la banda, tecla `o` con la banda enfocada y `/latigo on|off|sonido|ayuda`.
- La banda se adapta al ancho del terminal y nunca parte una pieza en dos líneas.
- Respeta la preferencia `reduceMotion` de Claude Code.
- Se conecta con la extensión de VS Code por `~/.claude-latigo/`: interruptor, conteos, latigazos al effort y presencia de la sesión.
- La tabla de `/latigo` muestra el nivel, la barra de progreso y la sección **Top global** (próximamente).
- 91 pruebas del plugin y 19 de punta a punta con Claude Code real: reglas, niveles, partículas, puente, diseño de la banda, effort real en `turn.step`, `/clear` y comandos.
- **Después de `/clear` la banda conserva los conteos, el interruptor y el comando.** Claude Code empieza una sesión nueva sin `session.start`, y el plugin se recarga con `session.end`.
- **Apagar también quita el effort forzado.**
- **Robustez:**
  - La misma carpeta del puente que VS Code en Windows (`USERPROFILE`).
  - El sondeo ya no deshace un apagado hecho en la banda.
  - Un `effort.json` reiniciado vuelve a contar.
  - Al salir, VS Code sabe enseguida que no hay sesión.
  - El latigazo sube desde el effort real de la sesión.
  - Una recarga en pleno golpe no congela la banda.

### Extensión de VS Code (nueva)
- Panel **Látigo** con el látigo en canvas, partículas, combos, nivel y estadísticas.
- Botón e interruptor para prender y apagar, y una tecla global para lo mismo: `Ctrl+Cmd+L` en macOS, `Shift+Alt+L` en Windows y Linux.
- Barra de estado con el nivel.
- Sección **Top global** visible en gris: llega en una próxima versión.

## 0.1.0 · 2026-10-22
- Primera versión: banda con latigazo al modelo (solo visual) y al effort (lo sube), combos, sonido y tabla con `/latigo`.
