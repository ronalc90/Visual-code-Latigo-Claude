// Imprime los niveles y como se ve el latigo en cada uno, desde hooks/levels.ts.
// Uso: npx esbuild hooks/levels.ts --bundle --format=esm --outfile=<tmp>/levels.mjs && node scripts/niveles_json.mjs <tmp>/levels.mjs
const { TIERS, lookFor, sparkRow } = await import(process.argv[2])
const out = TIERS.map(tier => {
  const look = lookFor(tier.minLashes)
  const mid = tier.level < TIERS.length ? lookFor(Math.floor((tier.minLashes + TIERS[tier.level].minLashes) / 2)) : look
  return { ...tier, look, mid, sky: sparkRow(look, 34, tier.level * 3, 1.4) }
})
console.log(JSON.stringify(out, null, 1))
