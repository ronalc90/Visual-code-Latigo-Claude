// Empaqueta la extension (Node) y el webview (navegador) con esbuild, copia los
// sonidos del plugin a media/ y, con --tests, compila las pruebas a out/.
import { build, context } from 'esbuild'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..')
const args = new Set(process.argv.slice(2))
const production = args.has('--production')
const watch = args.has('--watch')
const withTests = args.has('--tests')

function copySounds() {
  mkdirSync(join(root, 'media'), { recursive: true })
  for (const name of ['latigo.wav', 'nivel.wav']) {
    copyFileSync(join(repoRoot, 'assets', name), join(root, 'media', name))
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

copySounds()
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
