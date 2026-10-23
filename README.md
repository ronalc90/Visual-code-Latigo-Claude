# Látigo para Claude Code

*¡Suashh… CHAS!* Un látigo para darle ánimo a Claude Code. Si le pegas al **modelo**, es puro desahogo. Si le pegas al **effort**, sube un nivel. Mientras más lo usas, más dorado, brillante y épico se pone, muy poco a poco.

![Nivel 14, Divino: el golpe con chispas y el effort subiendo](docs/img/terminal-nivel14-golpe.png)

Funciona igual en la consola y en el Claude de VS Code:

| | Consola (`claude`) | Chat de Claude en VS Code |
|---|---|---|
| Subir el effort | Clic en la banda, o `/latigazo` | `/latigazo` en el chat, o el botón **Effort** de la barra lateral |
| Dónde se ve el effort | Indicador `● high · /effort` | Selector "Opus 5.5 **High**" |
| Prender y apagar | Botón `apagar` de la banda, o `/latigo off` | Interruptor de la barra lateral, `Shift+Alt+L` (`Ctrl+Cmd+L` en Mac), o `/latigo off` |
| El látigo animado | En la banda, encima del prompt | En la barra lateral, que se abre sola al entrar al chat |
| Tu tabla | `/latigo` | `/latigo`, o la barra lateral |

Viene en dos piezas que funcionan solas o juntas:

| | Plugin de Claude Code | Extensión de VS Code |
|---|---|---|
| Qué ves | Una banda encima del prompt | Su ícono en la barra de la izquierda, con el látigo animado; se abre solo al entrar a una conversación de Claude |
| Sube el effort | Sí, con `/effort`: el selector de modelo de Claude cambia | Sí, a través de la sesión de Claude Code abierta |
| Prender y apagar | Botón `apagar`/`encender`, tecla `o`, `/latigo on\|off` | Interruptor, botón y tecla global (`Ctrl+Cmd+L` en macOS, `Shift+Alt+L` en Windows y Linux) |
| Instalación | `/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude` | El `.vsix` de la [versión v0.3.0](https://github.com/ronalc90/Visual-code-Latigo-Claude/releases/tag/v0.3.0) (pronto en el Marketplace) |

---

## Contenido

- [Cómo se usa](#cómo-se-usa)
- [En VS Code](#en-vs-code)
- [Niveles: el látigo se va dorando](#niveles-el-látigo-se-va-dorando)
- [Combos](#combos)
- [Prender y apagar](#prender-y-apagar)
- [Instalación](#instalación)
- [Comandos y teclas](#comandos-y-teclas)
- [Cómo funciona el effort](#cómo-funciona-el-effort)
- [Privacidad](#privacidad)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Desarrollo](#desarrollo)

## Cómo se usa

En Claude Code aparece una banda encima del prompt:

![La banda en una sesión de Claude Code](docs/img/terminal-sesion-completa.png)

| Le das a… | Pasa esto |
|---|---|
| `[ opus-5-5 ]` (el modelo) | Latigazo con animación y sonido. Solo visual. |
| `[ effort: … ]` | Lo mismo, y además el effort sube un nivel: `low → medium → high → xhigh → max`. El ⚡ indica que lo está forzando el látigo. |
| `[ apagar ]` | Apaga el látigo. La banda queda en reposo con un botón `encender`. |

Se puede hacer clic o usar el teclado. Con `ctrl+x tab` (o un clic) la banda queda enfocada, y desde ahí `e` le pega al effort, `m` al modelo y `o` prende o apaga.

| Nivel 1 · el primer ¡CHAS! | Nivel 9 · Oro, combo x2 |
|---|---|
| ![Nivel 1](docs/img/terminal-nivel1-golpe.png) | ![Nivel 9](docs/img/terminal-nivel9-combo.png) |

## En VS Code

El látigo tiene su ícono en la **barra de la izquierda**, junto a Explorador, Búsqueda y Extensiones. Un clic y tienes todo a la vista, sin comandos:

- **El látigo animado** en canvas: chispas que caen y se apagan, destello en la punta y sacudida en los combos grandes.
- **El interruptor grande** para prenderlo y apagarlo, y el del sonido.
- **Los botones Modelo y Effort.** El de Effort sube el effort de tu conversación de Claude: el selector "Opus 5.5 Medium" del chat pasa a "High".
- **Tu nivel, tus números, tus mejores días y el Top global**, que por ahora aparece en gris porque llega en una próxima versión.

**Se abre solo:** al hacer clic en una conversación de Claude Code, si el látigo está prendido, aparece en la barra lateral sin quitarle el foco al chat, así sigues escribiendo. Se desactiva con el ajuste `latigo.showWithClaude`.

**Dentro del chat** está `/latigazo`: lo escribes en la conversación, sube el effort y deja el látigo escrito ahí mismo.

| La barra lateral | `/latigazo` en el chat |
|---|---|
| ![El látigo en la barra lateral de VS Code](vscode/images/screenshots/barra-lateral.png) | ![/latigazo sube el effort y deja el látigo en la conversación](docs/img/terminal-latigazo-chat.png) |

**Lo que no se puede (todavía):** dibujar el látigo *adentro* del chat de Claude Code en VS Code, ni que un clic sobre el selector "Opus 5.5 Medium" lo atrape el látigo. En su versión actual, ese chat no muestra interfaz de plugins (en la terminal sí), y VS Code no deja que otra extensión escuche clics dentro de su ventana. La banda ya está programada y probada para VS Code: el día que Claude Code active esa función en el chat, aparece sola.

El panel, en ancho completo:

![Panel de VS Code: nivel 9, combo x3 sobre el effort](vscode/images/screenshots/nivel-9-combo.png)

| Nivel 14 · subiendo a Divino | Sin sesión de Claude Code abierta |
|---|---|
| ![Subida al nivel 14 con lluvia de chispas](vscode/images/screenshots/nivel-14-divino.png) | ![El effort avisa que hay que abrir Claude Code](vscode/images/screenshots/sin-sesion.png) |

| Nivel 1 · Cuero crudo en reposo | Nivel 5 · Bronce en pleno latigazo |
|---|---|
| ![Látigo de cuero crudo](vscode/images/screenshots/nivel-1-reposo.png) | ![Latigazo de bronce](vscode/images/screenshots/nivel-5-latigazo.png) |

Con el interruptor apagado, el panel queda en calma:

![Panel con el látigo apagado](vscode/images/screenshots/apagado.png)

En la barra de estado aparece `Látigo · Nv N`, y un clic abre el panel. Todos los comandos, atajos y ajustes están en la [página de la extensión](vscode/README.md).

## Niveles: el látigo se va dorando

Son 14 niveles. Cada latigazo corre el color **un poquito** hacia el del nivel siguiente, así que no se nota de un golpe a otro, pero sí de una semana a otra. Las chispas aparecen en el nivel 3, se vuelven estrellas en los niveles de plata y oro, y al final son una lluvia. Al subir de nivel suena un arpegio y aparece un aviso.

![Evolución del látigo en los 14 niveles](docs/img/evolucion.png)

| Nv | Nombre | Desde | | Nv | Nombre | Desde |
|---:|---|---:|---|---:|---|---:|
| 1 | Cuero crudo | 0 | | 8 | Oro pálido | 900 |
| 2 | Cuero curtido | 25 | | 9 | Oro | 1.300 |
| 3 | Trenzado | 60 | | 10 | Oro brillante | 1.850 |
| 4 | Cobre | 120 | | 11 | Oro real | 2.600 |
| 5 | Bronce | 220 | | 12 | Dorado épico | 3.600 |
| 6 | Plata vieja | 380 | | 13 | Legendario | 5.000 |
| 7 | Plata | 600 | | 14 | Divino | 7.000 |

## Combos

Dos latigazos con menos de 1,5 s entre uno y otro suman combo:

`x2 ¡DOBLE!` · `x3 ¡TRIPLE!` · `x5 ¡FURIA!` · `x7 ¡IMPARABLE!` · `x10 ¡LEYENDA!` · `x20 ¡¡DIOS DEL LÁTIGO!!`

Tu mejor combo queda guardado en la tabla.

## Prender y apagar

Hay un solo interruptor para las dos piezas: apagarlo en VS Code también lo apaga en Claude Code, y al revés.

| Dónde | Cómo |
|---|---|
| VS Code, desde cualquier parte | `Ctrl+Cmd+L` en macOS, `Shift+Alt+L` en Windows y Linux |
| Panel de VS Code | El interruptor grande o el botón de la barra del panel |
| Barra de estado de VS Code | Clic en `Látigo` para abrir el panel |
| Banda de Claude Code | Botón `apagar` / `encender`, o `o` con la banda enfocada |
| Prompt de Claude Code | `/latigo off` y `/latigo on` |

Con el látigo apagado no hay animación ni sonido, y el effort vuelve a ser el de la sesión: al prenderlo otra vez arranca sin effort forzado.

![Látigo apagado](docs/img/terminal-apagado-banda.png)

## Instalación

### Plugin de Claude Code

En una terminal, dentro de `claude`:

```
/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
```

Responde `y` para agregar el marketplace y elige el alcance (Enter toma el de usuario). Queda activo de una vez. Desde la línea de comandos, fuera de una sesión:

```
claude plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
```

### Extensión de VS Code

Por ahora se instala con el `.vsix` de la [versión v0.3.0](https://github.com/ronalc90/Visual-code-Latigo-Claude/releases/tag/v0.3.0). Pronto estará en el Marketplace de VS Code.

Desde la consola (macOS y Linux):

```
curl -LO https://github.com/ronalc90/Visual-code-Latigo-Claude/releases/download/v0.3.0/latigo-claude-0.3.0.vsix
code --install-extension latigo-claude-0.3.0.vsix
```

En Windows (PowerShell), lo mismo con `curl.exe` en lugar de `curl`.

Sin consola, descarga el `.vsix` de la versión y en VS Code ve a **Extensiones** → menú **…** → **Instalar desde VSIX…**.

Si la consola no reconoce `code` en macOS, en VS Code abre la paleta (`Cmd+Shift+P`) y corre **Shell Command: Install 'code' command in PATH**.

La extensión también trae el comando **Látigo: Instalar el plugin en Claude Code**, que abre una terminal con el comando listo.

## Comandos y teclas

### En Claude Code

| Comando | Hace |
|---|---|
| `/latigazo` | Latigazo al effort desde el chat: lo sube un nivel (también en el selector de modelo) y deja el látigo escrito en la conversación |
| `/latigo` | Tu tabla: nivel, barra de progreso, latigazos (total, hoy, al effort, al modelo), mejor combo, días con más latigazos y el Top global (próximamente) |
| `/latigo on` · `/latigo off` | Prende o apaga el látigo (también en VS Code) |
| `/latigo calma` | Quita el effort que forzó el látigo y devuelve el que tenías |
| `/latigo sonido` | Prende o apaga el sonido |
| `/latigo ayuda` | Esta lista |

| Tecla (con la banda enfocada) | Hace |
|---|---|
| `e` | Latigazo al effort |
| `m` | Latigazo al modelo |
| `o` | Prende o apaga |

### En VS Code

Ver la [página de la extensión](vscode/README.md#comandos).

## Cómo funciona el effort

El látigo cambia el effort con el mismo comando de Claude Code, `/effort`. Por eso lo ves en todas partes: en el selector de modelo del chat de VS Code ("Opus 5.5 High"), en el indicador de la terminal (`● high · /effort`) y en la banda con ⚡. En la conversación queda la línea de `/effort` que lo aplicó.

- **Nunca baja.** Si ya vas en `max`, se queda en `max`. Como respaldo, el plugin también sube cada pedido al modelo si el `/effort` no se pudo aplicar.
- **`/latigo calma` y apagar el látigo devuelven el effort que tenías.** Si tú lo cambiaste a mano por encima, se respeta lo tuyo.
- **Claude Code guarda `/effort` como predeterminado** para sesiones nuevas (salvo `max`, que es solo de la sesión). Calmar el látigo devuelve también ese predeterminado.
- **Solo toca la conversación principal**, no los subagentes.

Los detalles están en [docs/arquitectura.md](docs/arquitectura.md).

## Privacidad

- **No usa la red** en ninguna de las dos piezas.
- **Todo queda en tu máquina:** los conteos y el interruptor viven en `~/.claude-latigo/`, unos archivos JSON pequeños que puedes borrar cuando quieras.
- **No lee tu código ni tus conversaciones.** Del modelo solo ve el nombre y el effort de cada pedido.

## Preguntas frecuentes

**¿Interrumpe lo que Claude está haciendo?**
No. A diferencia de los látigos que mandan `Ctrl-C`, este nunca corta el turno en curso.

**¿Por qué no suena?**
El sonido usa el reproductor de macOS. En Linux y Windows el látigo se ve pero no suena dentro de la terminal; en el panel de VS Code sí suena en todos lados. Revisa también `/latigo sonido`.

**¿Puedo ver el látigo sin tanta animación?**
Sí. Si activas *Reduce motion* en la configuración de Claude Code, el látigo va directo al golpe y las chispas no titilan. En VS Code está el ajuste `latigo.reducedMotion`.

**¿Por qué el látigo no aparece adentro del chat de Claude en VS Code?**
Porque, en su versión actual, ese chat no muestra interfaz de plugins: solo la terminal lo hace. Por eso en VS Code el látigo vive en la barra de la izquierda y se abre solo cuando entras al chat, y adentro del chat está `/latigazo`.

**¿Qué pasa si borro `~/.claude-latigo/`?**
Nada grave. El plugin también guarda los conteos en su propio almacén y los vuelve a escribir en el próximo latigazo, así que todavía no hay forma de reiniciarlos. El interruptor vuelve a quedar encendido.

**¿Y si tengo varias sesiones de Claude Code abiertas?**
Todas comparten el látigo. Un latigazo al effort desde VS Code las sube a todas, y el panel muestra el modelo y el effort de la que habló último. Un latigazo en la banda de una sesión sube solo esa.

**¿Funciona en Windows?**
Sí. El plugin y la extensión buscan la misma carpeta: `LATIGO_HOME`, luego `HOME` y si no la carpeta del usuario (`USERPROFILE`). En la terminal no suena, pero en el panel de VS Code sí.

## Desarrollo

```
claude --plugin-dir ./           # corre el plugin desde esta carpeta
claude plugin validate ./        # revisa manifiesto, marketplace y hooks
claude plugin test ./            # 98 pruebas del plugin
npx tsc -p .                     # tipos (Claude Code los deja en .claude-plugin/types/ al cargar el plugin)
cd vscode && npm ci --include=dev && npm test   # 121 unitarias + 19 de integración de la extensión
python scripts/e2e_puente.py --claude "$(which claude)"   # 22 de punta a punta con Claude Code real
```

| Carpeta | Qué hay |
|---|---|
| `hooks/` | Plugin de Claude Code y las reglas compartidas (`model.ts`, `levels.ts`, `bridge.ts`) |
| `types/` | Tipos y contrato de estado del plugin |
| `assets/` | Sonidos generados desde cero: `latigo.wav` y `nivel.wav` |
| `tests/` | Pruebas del plugin |
| `vscode/` | Extensión de VS Code |
| `scripts/` | Capturas reales del terminal (`capturas_terminal.py`) y la imagen de niveles (`evolucion.py`) |
| `docs/` | [Arquitectura](docs/arquitectura.md), [pruebas](docs/pruebas.md), [cómo publicar](docs/publicar.md) e imágenes |

## Lo que viene

- **Top global:** un ranking opcional, con apodo, de quién da más latigazos. Ya aparece en gris en el panel y en la tabla.

## Inspiración

[OpenWhip](https://github.com/GitFrog1111/OpenWhip) fue el primer látigo. Este nació para hacer lo mismo sin interrumpir el trabajo.

## Licencia

[MIT](LICENSE) © Ronald Cipagauta
