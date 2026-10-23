import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { SOUND_STYLES } from '../../../hooks/sounds'
import { LEVEL_SOUND, lashSoundPaths, missingSoundAssets, missingSoundsMessage, soundAssetPaths } from '../../src/soundAssets'

const root = path.join(__dirname, '..', '..', '..')
const assetsDir = path.join(root, '..', 'assets')
const mediaDir = path.join(root, 'media')

/** Todos los archivos de una carpeta, con su ruta relativa en formato de URL. */
function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative]
  })
}

/** Corre el build de verdad con otra carpeta de sonidos. */
function buildWithAssets(dir: string) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
    cwd: root,
    env: { ...process.env, LATIGO_ASSETS_DIR: dir },
    encoding: 'utf8',
  })
}

describe('sonidos que lleva la extension', () => {
  it('son los 12 archivos de los 9 estilos, sin repetir, y el de subir de nivel', () => {
    const fromStyles = new Set(SOUND_STYLES.flatMap(style => style.files.map(file => file.path)))
    assert.deepEqual(lashSoundPaths(), [...fromStyles])
    assert.equal(lashSoundPaths().length, 12)
    assert.deepEqual(soundAssetPaths(), [...lashSoundPaths(), LEVEL_SOUND])
    assert.equal(LEVEL_SOUND, 'nivel.wav')
    assert.ok(!soundAssetPaths().some(file => /latigo(-\d)?\.wav$/.test(file)), 'los latigo*.wav viejos ya no se usan')
  })

  it('todos existen en assets/', () => {
    assert.deepEqual(missingSoundAssets(soundAssetPaths(), file => fs.existsSync(path.join(assetsDir, file))), [])
  })

  it('el build los copio todos a media/, iguales, y no dejo sonidos viejos', () => {
    for (const file of soundAssetPaths()) {
      const copied = path.join(mediaDir, file)
      assert.ok(fs.existsSync(copied), `falta media/${file}`)
      assert.ok(fs.readFileSync(copied).equals(fs.readFileSync(path.join(assetsDir, file))), `media/${file} no es igual al de assets/`)
    }
    assert.deepEqual(listFiles(mediaDir).sort(), soundAssetPaths().sort())
  })

  it('el paquete .vsix los incluye (.vscodeignore)', () => {
    const lines = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split('\n').map(line => line.trim())
    assert.ok(lines.includes('!media/nivel.wav'))
    assert.ok(lines.includes('!media/sonidos/*.wav'))
    assert.ok(!lines.some(line => line.includes('latigo.wav')))
    assert.ok(lashSoundPaths().every(file => /^sonidos\/[^/]+\.wav$/.test(file)), 'todo latigazo tiene que caer en media/sonidos/*.wav')
  })

  it('dice cuales faltan y que hacer', () => {
    const missing = missingSoundAssets(['sonidos/real-1.wav', 'sonidos/aire-9.wav', 'nivel.wav'], file => file !== 'sonidos/aire-9.wav')
    assert.deepEqual(missing, ['sonidos/aire-9.wav'])
    const message = missingSoundsMessage(missing, '/repo/assets')
    assert.match(message, /^Faltan 1 sonido del látigo en \/repo\/assets:\n {2}- sonidos\/aire-9\.wav\n/)
    assert.match(message, /hooks\/sounds\.ts/)
    assert.match(missingSoundsMessage(['a.wav', 'b.wav'], 'x'), /^Faltan 2 sonidos del látigo en x:/)
  })

  describe('el build', function () {
    this.timeout(30000)
    let scratch: string

    beforeEach(() => {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'latigo-sonidos-'))
    })

    afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }))

    it('falla con un error claro si falta un sonido, y no toca media/', () => {
      for (const file of soundAssetPaths().filter(file => file !== 'sonidos/aire-3.wav')) {
        fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true })
        fs.copyFileSync(path.join(assetsDir, file), path.join(scratch, file))
      }
      const result = buildWithAssets(scratch)
      assert.equal(result.status, 1, result.stdout)
      assert.equal(result.stderr.trim(), missingSoundsMessage(['sonidos/aire-3.wav'], scratch))
      assert.deepEqual(listFiles(mediaDir).sort(), soundAssetPaths().sort())
    })

    it('sin carpeta de sonidos los nombra todos', () => {
      const result = buildWithAssets(path.join(scratch, 'no-existe'))
      assert.equal(result.status, 1)
      assert.match(result.stderr, /^Faltan 13 sonidos del látigo en /)
      for (const file of soundAssetPaths()) assert.ok(result.stderr.includes(`  - ${file}\n`), file)
    })
  })
})
