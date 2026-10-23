# Látigo para Claude Code

**Un látigo para Claude Code, ahora también dentro de VS Code.** *¡Suashh… CHAS!*

Haz clic en el ícono del látigo en la **barra de la izquierda**, dale clic al **effort** y tu conversación de Claude Code sube un nivel: `low → medium → high → xhigh → max`. Lo ves en el selector de modelo del chat ("Opus 5.5 Medium" pasa a "High"). Al entrar a una conversación de Claude, el látigo se abre solo si está prendido. Si le das al **modelo**, es solo para desahogarse: suena, revienta y no cambia nada. Varios seguidos hacen combo, y con cada latigazo el látigo se va dorando, poquito a poco, hasta llegar a *Divino*.

| En la barra lateral | En ancho completo |
|---|---|
| ![El látigo en la barra lateral](images/screenshots/barra-lateral.png) | ![El látigo de nivel 9 haciendo un combo x3 sobre el effort](images/screenshots/nivel-9-combo.png) |

## Lo que trae

- **Ícono en la barra de la izquierda.** Un clic y está todo a la vista: el látigo, el interruptor de prender y apagar, y los botones Modelo y Effort. Sin comandos.
- **Se abre solo al entrar al chat de Claude Code** (si el látigo está prendido) y no le quita el foco a la conversación. Se apaga con el ajuste `latigo.showWithClaude`.
- **Sube el effort de verdad:** usa el mismo `/effort` de Claude Code, así que el selector de modelo del chat muestra el nuevo nivel.
- **`/latigazo` dentro del chat:** escríbelo en la conversación y sube el effort ahí mismo, dejando el látigo escrito.

- **Un látigo de verdad animado.** Curva suave con mango y trenzado, amague, golpe y rebote; destello y onda expansiva en la punta; chispas con gravedad que caen y se apagan. En los combos grandes el escenario se sacude.
- **Dos objetivos.** *Modelo* (solo visual) y *Effort* (lo sube en la sesión abierta de Claude Code; el ⚡ indica que el látigo lo está forzando).
- **Combos.** Dos latigazos con menos de 1,5 s entre uno y otro suman: `x2 ¡DOBLE!`, `x3 ¡TRIPLE!`, `x5 ¡FURIA!`, `x7 ¡IMPARABLE!`, `x10 ¡LEYENDA!`, `x20 ¡¡DIOS DEL LÁTIGO!!`.
- **14 niveles que se notan.** De *Cuero crudo* a *Divino*. El color avanza un poquito con cada latigazo hacia el del nivel siguiente; las chispas aparecen tarde y se vuelven lluvia en los niveles altos. Al subir de nivel hay letrero, fiesta de chispas y sonido propio.
- **Tus números.** Total, hoy, al effort, al modelo, mejor combo y tus 5 mejores días.
- **Interruptor grande.** Apagado no suena, no anima y el effort vuelve a ser el de la sesión. Es el mismo interruptor de Claude Code: si lo apagas aquí, se apaga allá.
- **Barra de estado.** `🔥 Látigo · Nv 5` abajo a la derecha, con el progreso en el tooltip. Un clic abre el panel.
- **Se lleva con el tema.** Usa los colores de tu tema de VS Code, claro u oscuro.
- **Movimiento reducido.** Si tu sistema pide menos movimiento, hay menos partículas y nada se sacude.

| Nivel 1 · Cuero crudo | Nivel 5 · Bronce, en pleno latigazo |
|---|---|
| ![Látigo de cuero crudo en reposo](images/screenshots/nivel-1-reposo.png) | ![Latigazo de bronce con chispas en la punta](images/screenshots/nivel-5-latigazo.png) |

| Nivel 14 · Divino, subiendo de nivel | Sin sesión de Claude Code abierta |
|---|---|
| ![Letrero de subida al nivel 14 con lluvia de chispas](images/screenshots/nivel-14-divino.png) | ![El effort avisa que hay que abrir Claude Code](images/screenshots/sin-sesion.png) |

![El panel con el látigo apagado](images/screenshots/apagado.png)

## Cómo se conecta con Claude Code

La extensión es la mitad de VS Code del plugin **latigo** de Claude Code. Las dos mitades hablan por unos pocos archivos JSON en `~/.claude-latigo/`: ninguna abre sockets ni toca la red.

1. Instala el plugin en Claude Code. Desde VS Code: **Látigo: Instalar el plugin en Claude Code** abre una terminal con el comando listo para que lo revises y presiones Enter:

   ```
   claude plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
   ```

   O dentro de `claude`: `/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude`.
2. Abre una sesión de Claude Code. El panel muestra el modelo y el effort de esa sesión.
3. Dale al effort. El latigazo llega a la sesión y el effort sube un nivel.

Si no hay una sesión abierta, el latigazo igual se ve, suena y cuenta, pero el panel te avisa que no llegó a ninguna sesión: no queda un pedido colgado para la próxima.

Los latigazos que das en la banda de Claude Code (en la terminal) también se animan en el panel, y los conteos y el nivel son los mismos en los dos lados.

## Atajos de teclado

| Acción | macOS | Windows | Linux |
|---|---|---|---|
| Encender / apagar el látigo | `Ctrl+Cmd+L` | `Shift+Alt+L` | `Shift+Alt+L` |

En Windows y Linux no se usa `Ctrl+Alt+L`. En Windows, `Ctrl+Alt` es la tecla AltGr y taparía letras como la `ł` del teclado polaco; en Linux, `Ctrl+Alt+L` bloquea la pantalla en varios escritorios. Puedes cambiar el atajo en **Preferencias: Atajos de teclado** buscando `latigo.toggle`.

En la banda de Claude Code (terminal) el atajo de VS Code no aplica: allá se apaga con la tecla `o` con la banda enfocada, con el botón **apagar** o con `/latigo on` y `/latigo off`.

## Comandos

Todos están en la paleta (`Cmd+Shift+P` / `Ctrl+Shift+P`), en la categoría **Látigo**.

| Comando | Qué hace |
|---|---|
| Látigo: Abrir el panel | Abre el látigo en la barra lateral |
| Látigo: Encender/Apagar | Prende o apaga el látigo (aquí y en Claude Code) |
| Látigo: Latigazo al effort | Da un latigazo al effort sin abrir el panel |
| Látigo: Latigazo al modelo | Da un latigazo al modelo (solo visual) |
| Látigo: Prender/Apagar el sonido | Cambia el sonido de los latigazos |
| Látigo: Ver mis latigazos | Muestra tus números en una notificación |
| Látigo: Instalar el plugin en Claude Code | Abre una terminal con el comando de instalación |

## Ajustes

| Ajuste | Valor por defecto | Para qué |
|---|---|---|
| `latigo.showWithClaude` | `true` | Al entrar a una conversación de Claude Code, abre el látigo en la barra lateral (si está prendido), sin quitarle el foco al chat |
| `latigo.showStatusBar` | `true` | Muestra el nivel en la barra de estado |
| `latigo.reducedMotion` | `"auto"` | `auto` sigue al sistema; `on` siempre reduce el movimiento; `off` siempre anima todo |
| `latigo.volume` | `0.7` | Volumen del latigazo y de la subida de nivel, de `0` a `1` |

El interruptor y el sonido no son ajustes de VS Code: viven en `~/.claude-latigo/config.json` porque los comparte con Claude Code.

## Privacidad

- **Sin red.** La extensión no hace ninguna conexión: ni telemetría, ni analítica, ni recursos remotos en el panel (CSP estricta).
- **Solo una carpeta.** Lee y escribe únicamente en `~/.claude-latigo/`: `config.json`, `stats.json`, `effort.json`, `lash.json` y `presence.json`.
- **Sin datos de tu código.** No lee tus archivos, tus conversaciones ni tus prompts.

## Preguntas frecuentes

**¿Interrumpe lo que Claude Code está haciendo?**
No. El latigazo al effort solo cambia el effort de los turnos siguientes de la conversación principal. No manda `Ctrl-C` ni corta nada.

**¿El effort baja alguna vez?**
El látigo nunca lo baja. Si la sesión ya va más alto, se queda como está. Con `/latigo calma` en Claude Code vuelve a ser el de la sesión.

**¿Por qué el effort dice «sin sesión»?**
Porque no hay una sesión de Claude Code abierta con el plugin instalado. Cuando cierras Claude Code, el panel se entera enseguida. Si Claude Code se cerró de golpe, tarda hasta 15 segundos.

**¿Y si tengo varias sesiones de Claude Code abiertas?**
Todas comparten el látigo: un latigazo al effort desde VS Code las sube a todas, y el panel muestra el modelo y el effort de la que habló último.

**No suena.**
Revisa el interruptor **Sonido** del panel y el ajuste `latigo.volume`. El sonido sale del panel, así que suena cuando el panel está abierto.

**¿Puedo reiniciar mis números?**
Todavía no. Los conteos solo crecen, y el plugin de Claude Code guarda su propia copia: si borras `~/.claude-latigo/stats.json`, la vuelve a escribir. Reiniciarlos está en la lista para una próxima versión.

**¿Por qué el látigo no se dibuja adentro del chat de Claude?**
Porque, en su versión actual, el chat de Claude Code en VS Code no muestra interfaz de plugins (la consola sí), y VS Code no deja que otra extensión dibuje o escuche clics dentro de otra ventana. Por eso el látigo vive en la barra lateral y se abre solo cuando entras al chat, y adentro del chat está `/latigazo`.

**¿Y el Top global?**
Viene en una próxima versión: un ranking opcional, con apodo, entre todos los que usan el látigo. Por ahora la sección se ve pero está deshabilitada.

## Licencia

[MIT](LICENSE) © 2026 Ronald Cipagauta
