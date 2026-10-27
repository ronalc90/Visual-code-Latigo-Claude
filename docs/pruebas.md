# Pruebas

Son cinco capas, de la regla más chica al programa real funcionando. Todas pasan en la versión 0.5.0.

| Capa | Dónde | Cuántas | Cómo se corre |
|---|---|---:|---|
| Reglas compartidas y banda | `tests/rules.test.ts` | 47 | `claude plugin test ./` |
| Plugin de Claude Code | `tests/mod.test.tsx` | 63 | `claude plugin test ./` |
| Extensión, unitarias | `vscode/test/unit/` | 191 | `cd vscode && npm run test:unit` |
| Extensión, integración (VS Code real) | `vscode/test/integration/` | 36 | `cd vscode && npm run test:integration` |
| App de escritorio | `desktop/Tests/main.swift` | 209 comprobaciones | `desktop/build.sh --test` |
| Punta a punta con Claude Code real | `scripts/e2e_puente.py` | 22 | `python scripts/e2e_puente.py --claude "$(which claude)"` |

Además, `claude plugin validate ./` revisa el manifiesto, el marketplace y los hooks, y los dos lados pasan la revisión de tipos de TypeScript en modo estricto.

## Reglas compartidas y banda (`tests/rules.test.ts`)

- **Effort:**
  - Sube un nivel por latigazo, se queda en `max` y sube varios niveles de una sin pasarse.
  - El que sale es el mayor entre el de la sesión y el forzado, y el ⚡ solo aparece cuando el látigo de verdad sube algo.
- **Combos:** la ventana de 1,5 s y sus bordes, un reloj que va hacia atrás, y el grito de cada umbral.
- **Estadísticas:**
  - Cuentan por blanco y por día local (no UTC).
  - No mutan la copia anterior.
  - Lo roto se limpia y el valor vacío compartido no se puede ensuciar.
  - Al fusionar dos copias se queda el mayor de cada campo, y los mejores días salen ordenados.
- **Niveles:**
  - Son 14 y cada vez más espaciados, con el progreso de 0 a 1 dentro de cada nivel.
  - Totales raros (`NaN`, negativos, infinito) no rompen nada.
  - Se detecta el latigazo exacto que sube de nivel.
  - Un latigazo casi no cambia el color, y los niveles altos son dorados y brillantes.
- **Partículas:** el mismo cuadro da las mismas chispas, la fila mide exactamente su ancho, no hay chispas en los primeros niveles y hay más mientras más nivel.
- **Puente:**
  - Las rutas viven en `~/.claude-latigo`.
  - Cada archivo va y vuelve, y lo roto o ajeno da valores por defecto.
  - La lectura estricta de `effort.json` no inventa un contador cuando la lectura falla.
  - La presencia caduca a los 15 s.
  - La presencia de la app trae si el puntero es un látigo y el estado del atajo.
  - El sonido elegido va y vuelve en `config.json`, y uno desconocido da el de siempre.
- **Sonidos:** son nueve, cada uno con sus archivos y sin repetir. Elegir al azar cubre todo el estilo y nunca se sale. El play se adelanta lo justo para que el golpe caiga en el impacto.
- **Banda:**
  - Los cuadros se estiran y se recogen sin salirse de su zona.
  - La fila de arriba siempre mide igual y el grito sale de la punta.
  - Cuando no cabe, la banda suelta piezas en orden; lo elegido cabe en cualquier ancho desde 86 columnas.
  - La tabla de `/latigo` trae el nivel, los conteos, los mejores días y el Top global en camino.

## Plugin de Claude Code (`tests/mod.test.tsx`)

Corre el plugin dentro del motor de pruebas de Claude Code, con el disco, el reloj, el almacén, el sonido y los avisos en memoria para poder revisarlos.

- **Arranque:** crea la configuración compartida, escribe la presencia, respeta un látigo apagado y fusiona los conteos del almacén con los del disco.
- **Banda, en terminal, VS Code y escritorio:**
  - El latigazo al effort lo sube, suena y queda en disco.
  - Dos seguidos hacen combo y el golpe se ve.
  - El latigazo al modelo es solo visual.
  - El botón apaga y prende.
- **Effort de verdad (`turn.step`):**
  - El pedido sale con el effort forzado.
  - Nunca baja un effort más alto.
  - No toca los subagentes.
  - Apagado, el effort vuelve a ser el de la sesión.
- **Límites:**
  - El effort no pasa de `max` y lo avisa.
  - Subir de nivel suena distinto y avisa.
  - Hay chispas en los niveles altos y no en los primeros.
  - Con movimiento reducido no titila.
  - Sin sonido no suena.
  - Con una encuesta encima, la banda cede.
- **`/clear`:**
  - Recupera los conteos enseguida y respeta un látigo apagado.
  - Otros finales de sesión no recargan nada.
  - Sin cargar, la banda no dibuja ceros.
- **Apagar:** al volver a prender, el effort arranca como el de la sesión. `LATIGO_HOME` cambia la carpeta del puente.
- **Lo que encontró la revisión de código:**
  - En Windows, sin `HOME`, usa `USERPROFILE`, la misma carpeta que VS Code.
  - Apagar en la banda no lo deshace el sondeo, ni pisa un cambio de sonido hecho en VS Code.
  - Un `effort.json` reiniciado vuelve a contar, y una lectura fallida no se confunde con un reinicio.
  - Al salir, la presencia queda vencida enseguida.
  - El latigazo sube desde el effort real de la sesión.
  - Una recarga en pleno latigazo no congela la banda.
  - `/latigo` se vuelve a registrar tras `/clear`.
- **Puente con VS Code:**
  - La tecla de VS Code apaga y prende.
  - Los latigazos al effort llegan, salvo que el látigo esté apagado.
  - Los latigazos dados en VS Code se cuentan y se animan.
  - Los archivos rotos no tumban nada, y sin `HOME` funciona solo en la sesión.
- **`/latigo`:** la tabla, `on`, `off`, `sonido`, `calma` y `ayuda`.
- **Sonidos:**
  - `/latigo sonidos` lista los nueve y marca el elegido.
  - `/latigo sonido <nombre>` lo elige, lo guarda, deja oírlo y lo usa en cada latigazo. Con el sonido apagado, lo prende.
  - Uno que no existe no cambia nada y muestra la lista.
  - `sonido on` y `sonido off` dicen lo que hacen.
  - El sonido elegido en VS Code o en la app se usa también aquí.
  - El chasquido suena a tiempo con la banda (con movimiento reducido, enseguida).
- **Si Claude Code rechaza registrar los comandos,** el látigo sigue andando (banda y effort) y lo reintenta.

## App de escritorio (`desktop/Tests/main.swift`)

- **Niveles:** los 14 salen de `levels.ts`, y la interpolación de colores y chispas da lo mismo que `lookFor` en TypeScript.
- **Reglas:** combos, conteos y fusión por el mayor.
- **Effort:** sube de a un nivel con tope en `max` y sale el mayor entre el de la sesión y el forzado. El pronóstico del golpe sigue a los latigazos rápidos (high, xhigh, max, ya en max) y vuelve a contar cuando la sesión habla.
- **El látigo en la mano:**
  - La mano va en el puntero, y el mango mide lo suyo y apunta arriba, a la derecha o a la izquierda.
  - La cuerda cuelga, con el largo estable.
  - Quieta, deja de redibujarse (la corrección que impide que se estire no le mete energía).
- **Arrastrada, va detrás:** hacia la derecha, la punta queda atrás. Recto, con giro y en zigzag, la mitad pegada al mango queda a menos de 15 px del camino que hizo el mango, y en zigzag ondula. Quieta, vuelve a colgar.
- **Aguanta todo:** movimientos bruscos, `dt` de 0, negativo, NaN, infinito o enorme, un salto a otra pantalla y un puntero roto, sin NaN y con el largo estable.
- **El lado del mango:** el del movimiento y lejos del borde de la pantalla.
- **El movimiento se reconoce:** quieto, recto, con giro (con su signo), zigzag y sacudida. Más rápido, más velocidad, y un reloj que va hacia atrás empieza de nuevo.
- **El plan del latigazo cambia con el movimiento:**
  - quieto, se lanza hacia donde apunta el mango; en movimiento, hacia donde iba el mouse;
  - revienta a un mango y casi una cuerda de la mano;
  - en una esquina sale del otro lado, y en una pantalla baja se acuesta hasta caber, siempre con lugar para el grito y la insignia;
  - el bucle sale del lado del giro;
  - con giro, la cuerda va más curva;
  - en zigzag ondula y truena dos veces;
  - más velocidad y combo dan un golpe más fuerte;
  - la duración va de 0,14 a 0,36 s, y un tirón rápido truena antes.
- **El latigazo:**
  - La punta revienta lejos de la mano, donde dice el plan, justo a la duración pedida (con un cuadro de margen), con la raya de la punta y el mango apuntando al lanzamiento.
  - Si la mano se mueve durante el latigazo, el látigo va con ella.
  - La cuerda se cruza consigo misma: es un rizo de verdad. El bucle entra por el mango, va siempre hacia la punta y acelera.
  - En zigzag hay un eco a los 30 ms.
  - Un clic encima del otro no pierde el primer golpe.
  - Con movimiento reducido es casi inmediato.
  - Después la cuerda sigue en la mano, sana.
- **El golpe:**
  - Más chispas con más nivel y combo.
  - La raya y la V de la onda de choque, que desaparecen con movimiento reducido.
  - El eco es más chico y sin gritos.
  - La insignia del effort va encima del combo, y el aviso de prendido o apagado se apaga solo.
- **El sonido sintético:**
  - Dos golpes iguales suenan distinto, sin saturar.
  - El golpe cae en el milisegundo pedido.
  - El zumbido queda entre 25 y 70 dB por debajo, y después viene un siseo que se apaga.
  - El doble chasquido llega cuando se pide.
  - *Suave* es más bajito y más corto, y el zumbido al mover es corto.
- **Los sonidos para elegir:**
  - Los nueve de `hooks/sounds.ts`, en orden.
  - Uno desconocido da el de siempre.
  - Cada uno de los 12 archivos existe, es un WAV mono de 44,1 kHz y tiene su golpe donde dice el catálogo.
  - Los sintéticos salen idénticos del sintetizador actual: si alguien cambia `Synth.swift` sin regenerarlos, falla.
- **La sincronía:** el latigazo espera a un archivo que golpea más tarde (hasta 0,36 s), y el sonido espera o salta su comienzo para caer en el golpe.
- **Dónde sube el effort:** solo sobre VS Code, terminales o Claude.
- **El puente con archivos reales:**
  - Sin sesión no pide effort y con sesión sí.
  - La sesión trae su effort y caduca a los 15 s.
  - Un `stats.json` roto no baja los conteos.
  - La presencia de la app trae el estado del atajo.
  - Ya no existe `whipmode.json`.
  - El sonido elegido va y vuelve, y uno desconocido da el de siempre.

## Extensión de VS Code

Las detalla [la extensión](../vscode/README.md).

- **Unitarias (191):**
  - Lectura y escritura atómica del puente, incluidos 9 tipos de JSON roto y escrituras concurrentes.
  - El servicio de latigazos: combos, `seq` de effort, día local, fusión con la terminal, subida de nivel, apagado y sonido.
  - El interruptor único y el estilo de sonido: elegirlo lo guarda y prende el sonido; uno desconocido se rechaza.
  - La tarjeta de la app de escritorio: oculta fuera de Mac, abierta, abierta con el látigo apagado, cerrada, no instalada y el aviso de atajo ocupado.
  - El plan del sonido del panel: qué archivo suena y cuándo, para que el chasquido caiga con el golpe de la animación. *Probar* suena aunque el sonido esté apagado.
  - El build copia los 13 sonidos y, si falta uno, se detiene sin tocar `media/` (se corre de verdad con un sonido faltante).
  - Vigilancia de archivos, formato de la barra de estado y el protocolo del webview (mensajes inválidos rechazados).
  - Ajustes, la CSP del HTML y que el manifiesto coincida con el código. Los atajos son `⌃⌘L` en Mac y `Shift+Alt+L` en los demás, sin `Ctrl+Alt+letra` y sin chocar con los de fábrica.
  - La carpeta del puente con la misma regla que el plugin.
  - El renombrado que reintenta cuando Windows tiene el archivo ocupado.
  - Un `stats.json` ilegible no baja los conteos.
- **Integración (36):** corre la extensión dentro de un VS Code real, con carpetas temporales.
  - Activa la extensión y registra los comandos (sin el del modo látigo, que ya no existe).
  - Declara los atajos y verifica que no chocan con los de fábrica.
  - El interruptor, el sonido, elegir sonido y los latigazos al effort, con sesión y sin ella.
  - Los 13 sonidos están dentro de la extensión instalada y `latigo.wav` ya no.
  - La barra de estado y los cambios hechos desde afuera.
  - El panel con su CSP y la terminal de instalación.
  - Al entrar a una conversación de Claude Code, el látigo aparece en la barra lateral sin quitarle el foco; no aparece si está apagado o con `latigo.showWithClaude` en falso; prenderlo estando en el chat lo muestra.

## Punta a punta con Claude Code real (`scripts/e2e_puente.py`)

Abre `claude` de verdad en una terminal virtual, con el plugin cargado desde la carpeta. El script hace de extensión de VS Code escribiendo el puente. Revisa en la pantalla y en disco:

1. La banda aparece y toma los conteos que ya estaban.
2. Los latigazos al effort de antes de arrancar no se aplican.
3. Claude Code escribe su presencia.
4. Un latigazo al effort desde VS Code sube el effort, y dos juntos suben dos niveles.
5. Un combo dado en VS Code se anima en la banda y sus conteos se ven.
6. Apagar y prender desde VS Code funciona en los dos sentidos.
7. Un latigazo en la banda queda en disco para VS Code.
8. `/latigo off` y `/latigo on` llegan a VS Code.
9. Después de `/clear`, la banda conserva los conteos, `/latigo` sigue disponible y un látigo apagado sigue apagado.
10. Al cerrar Claude Code, la presencia queda vencida enseguida para VS Code.
11. El latigazo al effort cambia el effort de verdad (el indicador de Claude Code pasa a `high`).
12. `/latigo calma` lo devuelve, y `/latigazo` en el chat lo sube y lo cuenta en la conversación.

Como el látigo usa `/effort`, que Claude Code guarda en `~/.claude/settings.json`, los scripts respaldan ese archivo y lo devuelven tal cual al terminar (y antes de cada escena de las capturas).

El script no toca tus datos:

- **Puente propio.** Usa uno en una carpeta temporal (`LATIGO_HOME`), así nunca escribe en tu `~/.claude-latigo/` ni le llega a una sesión de Claude Code que tengas abierta.
- **Limpieza al salir.** Borra lo que dejan las sesiones de prueba: el almacén del plugin cargado con `--plugin-dir` y las transcripciones vacías.

Necesita Python con `pyte`, `pillow` y `fonttools`:

```
python -m venv .venv && .venv/bin/pip install pyte==0.8.2 pillow==11.3.0 fonttools==4.55.3
.venv/bin/python scripts/e2e_puente.py --claude "$(which claude)"
```

## Capturas

Las fotos de la app (`docs/img/pantalla-*.png`) y el GIF (`docs/img/latigazo.gif`) los dibuja la misma app, con su física y su dibujo, encima de una captura real:

```
desktop/build/Látigo.app/Contents/MacOS/Latigo --demo docs/img docs/img/terminal-latigazo-chat.png
desktop/build/Látigo.app/Contents/MacOS/Latigo --frames /tmp/cuadros docs/img/terminal-latigazo-chat.png
ffmpeg -framerate 30 -i /tmp/cuadros/cuadro-%03d.png -vf "crop=1660:900:276:40,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 docs/img/latigazo.gif
```

Las capturas de `docs/img/terminal-*.png` también son de Claude Code real. `scripts/capturas_terminal.py` lo abre igual que la prueba de punta a punta, prepara los conteos de cada escena, le da latigazos con el teclado y dibuja la pantalla con sus colores. Las del panel (`vscode/images/screenshots/`) salen del mismo HTML y JavaScript de la extensión, renderizados en Chrome sin interfaz con una semilla fija (`npm run screenshots`). La imagen de niveles (`docs/img/evolucion.png`) sale de los datos de `hooks/levels.ts`.

```
.venv/bin/python scripts/capturas_terminal.py --claude "$(which claude)"
npx esbuild@0.24.0 hooks/levels.ts --bundle --format=esm --outfile=/tmp/levels.mjs
node scripts/niveles_json.mjs /tmp/levels.mjs > /tmp/niveles.json
.venv/bin/python scripts/evolucion.py /tmp/niveles.json docs/img/evolucion.png
```

Las capturas sirvieron para encontrar errores que las pruebas automáticas no veían:

- La banda se partía en dos líneas cuando no cabía.
- Después de `/clear` volvía a nivel 1 con 0 latigazos.
- El ⏻ no existe en muchas fuentes.
- El grito duraba muy poco para verlo.
