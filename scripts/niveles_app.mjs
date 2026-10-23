// Exporta para la app de escritorio los niveles de hooks/levels.ts (una sola
// fuente de verdad) y unas muestras de lookFor para que las pruebas de la app
// comprueben que su interpolacion da lo mismo.
// Uso: npx esbuild hooks/levels.ts --bundle --format=esm --outfile=<tmp>/levels.mjs && node scripts/niveles_app.mjs <tmp>/levels.mjs > desktop/Resources/niveles.json
const { TIERS, lookFor } = await import(process.argv[2])
const samples = [0, 10, 42, 220, 300, 1300, 1301, 2600, 4999, 7000, 99999].map(total => ({ total, look: lookFor(total) }))
console.log(JSON.stringify({ tiers: TIERS, samples }, null, 1))
