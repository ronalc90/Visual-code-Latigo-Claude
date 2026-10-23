# Visual-code-Latigo-Claude

Un látigo para Claude Code. *¡Suashh… CHAS!*

Encima del prompt aparece una banda con el látigo, el modelo y el effort. Si le das un latigazo al **modelo**, es solo para desahogarse: suena, revienta y no cambia nada. Si se lo das al **effort**, lo sube un nivel. Si das varios seguidos, haces combo.

```
╾━━━━━━~~~~~✸ ¡CHAS!    [ opus-5-5 ]  [ ✸ effort: xhigh ⚡ ✸ ]  x3 ¡TRIPLE!
```

## Qué hace

| Le das a… | Pasa esto |
|---|---|
| `[ modelo ]` | Animación y sonido del latigazo. Solo visual. |
| `[ effort: … ]` | Lo mismo, y además el effort sube un nivel: `low → medium → high → xhigh → max` |
| Varios latigazos seguidos (menos de 1,5 s entre uno y otro) | Combo: `x2 ¡DOBLE!`, `x3 ¡TRIPLE!`, `x5 ¡FURIA!`, `x7 ¡IMPARABLE!`, `x10 ¡LEYENDA!`, `x20 ¡¡DIOS DEL LATIGO!!` |

- **El effort nunca baja.** Si la sesión ya va más alto que el latigazo, se queda como está.
- **Solo afecta la conversación principal**, no los subagentes.
- **El ⚡ indica que el effort está forzado por el látigo.** Con `/latigo calma` vuelve a ser el de la sesión.
- **El effort forzado dura lo que dura la sesión.** Los conteos sí quedan guardados de una sesión a otra.

También funciona con el teclado: con la banda enfocada (`ctrl+x tab` o un clic), la `e` le pega al effort y la `m` al modelo.

## Tabla de latigazos

```
/latigo
```

Muestra cuántos latigazos llevas en total y hoy, cuántos al effort y cuántos al modelo, tu mejor combo y los 5 días con más latigazos.

## Instalación

En una terminal, dentro de `claude`:

```
/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
```

Responde `y` para agregar el marketplace y elige el alcance (Enter toma el de usuario). Queda activo de una vez. Si lo instalas con alcance de usuario, también carga en las sesiones locales de la app de escritorio. La banda está probada para terminal, VS Code y escritorio.

El sonido se reproduce con `afplay`, así que suena en macOS. En Linux y Windows el látigo se ve pero no suena.

## Desarrollo

```
claude --plugin-dir ./           # corre el mod desde esta carpeta
claude plugin validate ./        # revisa el manifiesto y los hooks
claude plugin test ./            # corre las pruebas de tests/
```

| Archivo | Para qué |
|---|---|
| `hooks/register.tsx` | La banda, el latigazo, el cambio de effort y el comando `/latigo` |
| `hooks/logic.ts` | Las reglas: niveles de effort, combos y tabla |
| `types/index.d.ts` | El estado que guarda el mod |
| `assets/latigo.wav` | El sonido, generado desde cero (sin muestras de terceros) |

## Lo que viene

- Ranking global opcional: con un apodo, ver quién da más latigazos.

## Inspiración

[OpenWhip](https://github.com/GitFrog1111/OpenWhip) fue el primer látigo, pero manda un `Ctrl-C` y corta lo que el agente estaba haciendo. Este no interrumpe nada.

## Licencia

[MIT](LICENSE) © Ronald Cipagauta
