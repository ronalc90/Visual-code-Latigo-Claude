# Cambios

Todos los cambios importantes de la extensión **Látigo para Claude Code**.

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
