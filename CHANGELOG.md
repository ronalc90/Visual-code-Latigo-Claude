# Cambios

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
