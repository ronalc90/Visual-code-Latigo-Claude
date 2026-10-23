// Exporta para la app de escritorio los sonidos de hooks/sounds.ts (una sola
// fuente de verdad): los estilos, sus archivos y cuando suena el golpe en cada uno.
// Uso: npx esbuild hooks/sounds.ts --bundle --format=esm --outfile=<tmp>/sounds.mjs && node scripts/sonidos_app.mjs <tmp>/sounds.mjs > desktop/Resources/sonidos.json
const { SOUND_STYLES, DEFAULT_SOUND_STYLE } = await import(process.argv[2])
console.log(JSON.stringify({ default: DEFAULT_SOUND_STYLE, styles: SOUND_STYLES }, null, 1))
