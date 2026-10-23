// Empaqueta la extension (Node) y el webview (navegador) con esbuild, copia a
// media/ los sonidos que usa el panel y, con --tests, compila las pruebas a out/.
import { build, context } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..')
/** De donde salen los sonidos. LATIGO_ASSETS_DIR la cambia (la usan las pruebas del build). */
const assetsDir = process.env.LATIGO_ASSETS_DIR ?? join(repoRoot, 'assets')
const args = new Set(process.argv.slice(2))
const production = args.has('--production')
const watch = args.has('--watch')
const withTests = args.has('--tests')

/** src/soundAssets.ts compilado en memoria: la lista de sonidos sale de hooks/sounds.ts, la unica fuente. */
async function loadSoundAssets() {
  const result = await build({ entryPoints: [join(root, 'src/soundAssets.ts')], bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

/** Copia a media/ los archivos de todos los estilos de sonido y el de subir de nivel. Si falta uno, no compila. */
async function copySounds() {
  const { soundAssetPaths, missingSoundAssets, missingSoundsMessage } = await loadSoundAssets()
  const files = soundAssetPaths()
  const missing = missingSoundAssets(files, file => existsSync(join(assetsDir, file)))
  if (missing.length > 0) {
    console.error(missingSoundsMessage(missing, assetsDir))
    process.exit(1)
  }
  const media = join(root, 'media')
  // Se arma de cero para que no queden sonidos que ya no se usan.
  rmSync(media, { recursive: true, force: true })
  for (const file of files) {
    mkdirSync(dirname(join(media, file)), { recursive: true })
    copyFileSync(join(assetsDir, file), join(media, file))
  }
}

const shared = {
  bundle: true,
  logLevel: 'info',
  sourcemap: production ? false : 'linked',
  minify: production,
  legalComments: 'none',
}

const extension = {
  ...shared,
  entryPoints: [join(root, 'src/extension.ts')],
  outfile: join(root, 'dist/extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
}

const webview = {
  ...shared,
  entryPoints: { webview: join(root, 'webview/main.ts') },
  outdir: join(root, 'dist'),
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  loader: { '.css': 'css' },
}

function testFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...testFiles(full))
    else if (entry.name.endsWith('.ts')) found.push(full)
  }
  return found
}

const tests = {
  ...shared,
  sourcemap: 'inline',
  minify: false,
  entryPoints: Object.fromEntries(
    testFiles(join(root, 'test')).map(file => [relative(root, file).replace(/\.ts$/, ''), file]),
  ),
  outdir: join(root, 'out'),
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode', 'mocha', '@vscode/test-electron'],
  logLevel: 'warning',
}

await copySounds()
if (watch) {
  const contexts = await Promise.all([context(extension), context(webview)])
  await Promise.all(contexts.map(c => c.watch()))
} else {
  rmSync(join(root, 'dist'), { recursive: true, force: true })
  await Promise.all([build(extension), build(webview)])
  if (withTests) {
    rmSync(join(root, 'out'), { recursive: true, force: true })
    await build(tests)
  }
}
