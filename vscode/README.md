# Látigo para Claude Code

**Un interruptor, sonidos de látigo de verdad, tu nivel y tus latigazos, en la barra lateral de VS Code.** *¡Suashh… CHAS!*

Haz clic en el ícono del látigo en la **barra de la izquierda**. Arriba está **el interruptor**: lo prendes y el látigo trabaja; lo apagas y todo vuelve a la normalidad. Debajo eliges **cómo suena**, ves si la **app de escritorio** tiene tu puntero hecho látigo, la sesión de Claude Code con su modelo y su effort, tu nivel con el látigo en miniatura y todos tus números. El panel está pensado para la barra lateral angosta y también se acomoda en ancho completo.

| En la barra lateral | Con la app de escritorio abierta |
|---|---|
| ![El panel en la barra lateral: el interruptor prendido, la fila de sonido, la app de escritorio con el puntero hecho látigo, la sesión, el nivel 9 con un combo x3 que llegó desde la pantalla y las estadísticas](images/screenshots/barra-lateral.png) | ![El interruptor prendido y la tarjeta App de escritorio: abierta, tu puntero es un látigo; Esc o ⌃⌘L lo apagan](images/screenshots/app-abierta.png) |

## Lo que trae

- **Un solo interruptor.** *Látigo prendido / Látigo apagado*, lo primero del panel, con su atajo a la vista (`⌃⌘L` en Mac, `Shift+Alt+L` en Windows y Linux) y una línea que dice qué está haciendo el látigo en ese momento. Es el mismo interruptor de Claude Code y de la app de escritorio: si lo apagas aquí, se apaga en todos lados.
- **Sonidos para elegir.** Seis grabaciones de látigos reales, una opción que las alterna al azar, una sintética y una suave para la oficina. El botón **Probar** te deja oírlos aunque el sonido esté apagado.
- **La app de escritorio (Mac).** Con el látigo prendido y la app abierta, tu puntero se vuelve un látigo sobre toda la pantalla: cada clic lo restalla y, si cae sobre una conversación de Claude, le sube el effort. El panel te dice si la app está abierta, te la abre con un botón y te lleva a la guía si todavía no la tienes.
- **La sesión de Claude Code.** Modelo y effort de la sesión abierta; el ⚡ indica que el látigo lo está subiendo. Dos botones: **Latigazo al effort** (lo sube un nivel: `low → medium → high → xhigh → max`) y **Al modelo** (solo para desahogarse).
- **Tu nivel, con el látigo en miniatura.** Una vista previa del látigo con el color de tu nivel, que se mece y echa chispas según lo alto que estés. Cada latigazo, venga de VS Code, de la terminal o de la app de escritorio, se ve ahí: chasquido, chispas y el grito del combo (`x2 ¡DOBLE!`, `x3 ¡TRIPLE!` … `x20 ¡¡DIOS DEL LÁTIGO!!`). El sonido cae justo en el golpe.
- **14 niveles.** De *Cuero crudo* a *Divino*: el color avanza un poquito con cada latigazo y las chispas se vuelven lluvia en los niveles altos. Al subir de nivel aparece un letrero.
- **Tus números.** Total, hoy, mejor combo, al effort, al modelo y tus 5 mejores días.
- **Se abre solo al entrar al chat de Claude Code** (si el látigo está prendido), sin quitarle el foco a la conversación. Se apaga con el ajuste `latigo.showWithClaude`.
- **Barra de estado.** `🔥 Látigo · Nv 5` abajo a la derecha, o `Látigo · apagado`. Un clic abre el panel.
- **Se lleva con el tema** y **respeta el movimiento reducido**: si tu sistema lo pide, el látigo no se mece y hay menos chispas.

| La fila del sonido | La app de escritorio cerrada |
|---|---|
| ![El interruptor prendido y la fila del sonido: interruptor de sonido, el estilo Real 4 · suufff largo elegido con su descripción y el botón Probar](images/screenshots/sonidos.png) | ![La tarjeta App de escritorio dice Cerrada y ofrece el botón Abrir la app](images/screenshots/app-cerrada.png) |

| Nivel 14 · Divino, subiendo de nivel | Apagado |
|---|---|
| ![Letrero de subida al nivel 14 en la vista previa del látigo](images/screenshots/nivel-14-divino.png) | ![El panel con el látigo apagado: el interruptor apagado, la app abierta con el látigo apagado y el látigo guardado](images/screenshots/apagado.png) |

![El panel en ancho completo: el interruptor con la fila del sonido en una sola línea, la app de escritorio, la sesión, un combo x2 que llegó desde la terminal, las estadísticas y el Top global](images/screenshots/ancho-completo.png)

## El interruptor

Es el único control del látigo:

| | Prendido | Apagado |
|---|---|---|
| Latigazos al effort | Suben el effort de Claude Code un nivel | No hacen nada |
| Sonido y animación | Sí (si el sonido está prendido) | No |
| Con la app de escritorio abierta | Tu puntero es un látigo | Tu puntero es el de siempre |
| Effort de Claude Code | El que haya subido el látigo | Vuelve a ser el de la sesión |

Lo puedes cambiar desde el panel, con `⌃⌘L` (Mac) o `Shift+Alt+L` (Windows y Linux), con el botón del título del panel, con **Látigo: Prender/Apagar** en la paleta, con `/latigo on` y `/latigo off` en Claude Code o desde la app de escritorio. Todos mueven el mismo interruptor, guardado en `~/.claude-latigo/config.json`.

## Sonidos

Elige el sonido en el desplegable del panel. Elegir uno lo guarda y prende el sonido, igual que `/latigo sonido <estilo>` en Claude Code. **Probar** suena un latigazo del estilo elegido aunque el sonido esté apagado. También puedes elegirlo con **Látigo: Elegir sonido**, que solo cambia el estilo y deja el sonido como estaba.

| Sonido | Cómo suena |
|---|---|
| Real · al azar | Cada latigazo usa una de las 6 grabaciones reales. |
| Real 1 · seco | Chasquido limpio y corto. |
| Real 2 · doble | Dos chasquidos casi juntos. |
| Real 3 · corto | Chasquido corto con un eco leve. |
| Real 4 · suufff largo | El siseo del aire se queda sonando. |
| Real 5 · completo | Se oye el látigo cortando el aire antes del golpe. |
| Real 6 · completo 2 | Otro latigazo completo, más seco. |
| Aire · sintético | Hecho imitando las grabaciones; en la app de escritorio cambia con cómo mueves el mouse. |
| Suave · para la oficina | Un chasquido bajito y corto. |

El sonido se elige una vez y lo usan el panel, la banda de Claude Code y la app de escritorio. El volumen del panel se ajusta con `latigo.volume`.

## App de escritorio

La app de escritorio es solo para Mac y sigue el mismo interruptor: con el látigo prendido, tu puntero es un látigo sobre toda la pantalla; `Esc` o `⌃⌘L` lo apagan. Con la app abierta, `⌃⌘L` funciona en cualquier aplicación, no solo en VS Code.

La tarjeta **App de escritorio** del panel muestra su estado:

- **Abierta · tu puntero es un látigo** (punto verde): el látigo está prendido y la app lo tiene en el puntero.
- **Abierta · el látigo está apagado**: prende el interruptor o presiona `⌃⌘L`.
- **Cerrada**: el botón **Abrir la app** la abre (`open -a "Látigo"`).
- **No está instalada**: el botón **Cómo instalarla** te lleva a la [guía de instalación](https://github.com/ronalc90/Visual-code-Latigo-Claude#app-de-escritorio); después, **Reintentar**.
- Si **otra app usa `⌃⌘L`**, la tarjeta te avisa: prende y apaga desde el panel o desde el menú de la app.

La extensión no dibuja nada fuera de VS Code ni le manda órdenes a la app: las dos leen el mismo interruptor, y la app cuenta su estado en `~/.claude-latigo/desktop.json`. En Windows y Linux la tarjeta no aparece y todo lo demás funciona igual.

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

Los latigazos que das en la banda de Claude Code (en la terminal) y con la app de escritorio también se animan en la vista previa del panel, y los conteos y el nivel son los mismos en todos lados.

## Atajos de teclado

| Acción | macOS | Windows | Linux |
|---|---|---|---|
| Prender / apagar el látigo | `⌃⌘L` (Control+Comando+L) | `Shift+Alt+L` | `Shift+Alt+L` |
| Apagar el látigo cuando tu puntero es un látigo | `Esc` (app de escritorio) | — | — |

En Mac, con la app de escritorio abierta, la app atrapa `⌃⌘L` en todo el sistema y hace lo mismo que en VS Code: prende y apaga el látigo.

En Windows y Linux no se usa `Ctrl+Alt+L`. En Windows, `Ctrl+Alt` es la tecla AltGr y taparía letras como la `ł` del teclado polaco; en Linux, `Ctrl+Alt+L` bloquea la pantalla en varios escritorios. Puedes cambiar el atajo en **Preferencias: Atajos de teclado** buscando `latigo.toggle`. Si quieres un atajo para un sonido, asígnale a `latigo.chooseSound` el estilo como argumento (por ejemplo `"args": "real-4"`).

En la banda de Claude Code (terminal) el atajo de VS Code no aplica: allá se apaga con la tecla `o` con la banda enfocada, con el botón **apagar** o con `/latigo on` y `/latigo off`.

## Comandos

Todos están en la paleta (`Cmd+Shift+P` / `Ctrl+Shift+P`), en la categoría **Látigo**.

| Comando | Qué hace |
|---|---|
| Látigo: Abrir el panel | Abre el látigo en la barra lateral |
| Látigo: Prender/Apagar | Prende o apaga el látigo (aquí, en Claude Code y en la app de escritorio) |
| Látigo: Elegir sonido | Elige el sonido de los latigazos entre los 9 estilos |
| Látigo: Prender/Apagar el sonido | Prende o apaga el sonido de los latigazos |
| Látigo: Latigazo al effort | Da un latigazo al effort sin abrir el panel |
| Látigo: Latigazo al modelo | Da un latigazo al modelo (solo visual) |
| Látigo: Ver mis latigazos | Muestra tus números en una notificación |
| Látigo: Instalar el plugin en Claude Code | Abre una terminal con el comando de instalación |

## Ajustes

| Ajuste | Valor por defecto | Para qué |
|---|---|---|
| `latigo.showWithClaude` | `true` | Al entrar a una conversación de Claude Code, abre el látigo en la barra lateral (si está prendido), sin quitarle el foco al chat |
| `latigo.showStatusBar` | `true` | Muestra el nivel en la barra de estado |
| `latigo.reducedMotion` | `"auto"` | `auto` sigue al sistema; `on` siempre reduce el movimiento (el látigo no se mece); `off` siempre anima todo |
| `latigo.volume` | `0.7` | Volumen del latigazo y de la subida de nivel en el panel, de `0` a `1` |

El interruptor, el sonido y el estilo de sonido no son ajustes de VS Code: viven en `~/.claude-latigo/config.json` porque los comparten Claude Code y la app de escritorio.

## Privacidad

- **Sin red.** La extensión no hace ninguna conexión: ni telemetría, ni analítica, ni recursos remotos en el panel (CSP estricta). El único enlace, *Cómo instalarla*, lo abre tu navegador cuando le das clic.
- **Solo una carpeta.** Escribe únicamente en `~/.claude-latigo/` (`config.json`, `stats.json`, `effort.json` y `lash.json`) y además lee ahí `presence.json` (la sesión de Claude Code) y `desktop.json` (la app de escritorio).
- **Un solo programa externo.** En Mac, el botón *Abrir la app* corre `open -a "Látigo"`. Nada más.
- **Sin datos de tu código.** No lee tus archivos, tus conversaciones ni tus prompts.

## Preguntas frecuentes

**¿Interrumpe lo que Claude Code está haciendo?**
No. El latigazo al effort solo cambia el effort de los turnos siguientes de la conversación principal. No manda `Ctrl-C` ni corta nada.

**¿El effort baja alguna vez?**
El látigo nunca lo baja. Si la sesión ya va más alto, se queda como está. Con `/latigo calma` en Claude Code, o apagando el látigo, vuelve a ser el de la sesión.

**¿Por qué el effort dice «sin sesión»?**
Porque no hay una sesión de Claude Code abierta con el plugin instalado. Cuando cierras Claude Code, el panel se entera enseguida. Si Claude Code se cerró de golpe, tarda hasta 15 segundos.

**¿Y si tengo varias sesiones de Claude Code abiertas?**
Todas comparten el látigo: un latigazo al effort desde VS Code las sube a todas, y el panel muestra el modelo y el effort de la que habló último.

**Prendí el látigo y mi puntero sigue normal.**
El puntero solo se vuelve látigo con la app de escritorio abierta (Mac). Mira la tarjeta **App de escritorio**: si dice *Cerrada*, dale a **Abrir la app**. Si se queda en *prendiendo el látigo…* más de unos segundos, actualiza la app. La app se da por cerrada si no avisa durante 6 segundos.

**`⌃⌘L` no hace nada.**
Si la tarjeta de la app avisa que otra app usa `⌃⌘L`, ese atajo lo tiene otra aplicación: prende y apaga desde el panel o desde el menú de la app, o cambia el atajo de VS Code buscando `latigo.toggle` en **Preferencias: Atajos de teclado**.

**No suena.**
Revisa el interruptor **Sonido** del panel y el ajuste `latigo.volume`, y dale a **Probar** para oír el estilo elegido. El sonido de los latigazos de VS Code sale del panel, así que suena cuando el panel está abierto; los de la terminal y los de la app de escritorio suenan allá.

**¿Puedo reiniciar mis números?**
Todavía no. Los conteos solo crecen, y el plugin de Claude Code guarda su propia copia: si borras `~/.claude-latigo/stats.json`, la vuelve a escribir. Reiniciarlos está en la lista para una próxima versión.

**¿Por qué el látigo no se dibuja adentro del chat de Claude?**
Porque VS Code no deja que una extensión dibuje o escuche clics dentro de la ventana de otra. Para eso está la app de escritorio, que va por encima de todo. Adentro del chat también está `/latigazo`.

**¿Y el Top global?**
Viene en una próxima versión: un ranking opcional, con apodo, entre todos los que usan el látigo. Por ahora la sección se ve pero está deshabilitada.

## Licencia

[MIT](LICENSE) © 2026 Ronald Cipagauta
