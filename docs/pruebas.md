# Pruebas

Son cuatro capas, de la regla más chica al programa real funcionando. Todas pasan en la versión 0.3.0.

| Capa | Dónde | Cuántas | Cómo se corre |
|---|---|---:|---|
| Reglas compartidas y banda | `tests/rules.test.ts` | 42 | `claude plugin test ./` |
| Plugin de Claude Code | `tests/mod.test.tsx` | 56 | `claude plugin test ./` |
| Extensión, unitarias | `vscode/test/unit/` | 121 | `cd vscode && npm run test:unit` |
| Extensión, integración (VS Code real) | `vscode/test/integration/` | 19 | `cd vscode && npm run test:integration` |
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

## Extensión de VS Code

Las detalla [la extensión](../vscode/README.md).

- **Unitarias (121):**
  - Lectura y escritura atómica del puente, incluidos 9 tipos de JSON roto y escrituras concurrentes.
  - El servicio de latigazos: combos, `seq` de effort, día local, fusión con la terminal, subida de nivel, apagado y sonido.
  - Vigilancia de archivos, formato de la barra de estado y el protocolo del webview (18 mensajes inválidos rechazados).
  - Ajustes, la CSP del HTML y que el manifiesto coincida con el código, sin atajos `Ctrl+Alt+letra`.
  - La carpeta del puente con la misma regla que el plugin.
  - El renombrado que reintenta cuando Windows tiene el archivo ocupado.
  - Un `stats.json` ilegible no baja los conteos.
- **Integración (19):** corre la extensión dentro de un VS Code real, con carpetas temporales.
  - Activa la extensión y registra los comandos.
  - Declara el atajo y verifica que no choca con los de fábrica.
  - El interruptor, el sonido y los latigazos al effort, con sesión y sin ella.
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
