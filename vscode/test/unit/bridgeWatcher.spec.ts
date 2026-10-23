import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'

import type { BridgeFile } from '../../src/bridgeWatcher'
import { BridgeWatcher } from '../../src/bridgeWatcher'
import type { TempBridge } from './helpers'
import { tempBridge, waitFor } from './helpers'

describe('BridgeWatcher', function () {
  this.timeout(8000)
  let bridge: TempBridge
  let watcher: BridgeWatcher | undefined

  beforeEach(() => {
    bridge = tempBridge()
  })

  afterEach(() => {
    watcher?.dispose()
    bridge.cleanup()
  })

  it('avisa que archivo del puente cambio', async () => {
    const seen: BridgeFile[] = []
    watcher = new BridgeWatcher(bridge.store.paths, file => seen.push(file), { debounceMs: 20, pollIntervalMs: 100 })
    watcher.start()
    bridge.store.updateConfig({ enabled: false })
    await waitFor(() => seen.includes('config'))
    bridge.store.incrementEffortSeq(1)
    await waitFor(() => seen.includes('effort'))
  })

  it('agrupa varias escrituras seguidas en un solo aviso (debounce)', async () => {
    const seen: BridgeFile[] = []
    watcher = new BridgeWatcher(bridge.store.paths, file => seen.push(file), { debounceMs: 150, pollIntervalMs: 5000 })
    watcher.start()
    for (let i = 0; i < 10; i++) bridge.store.updateConfig({ sound: i % 2 === 0 })
    await waitFor(() => seen.length > 0)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.deepEqual(seen, ['config'])
  })

  it('ignora archivos ajenos y temporales', async () => {
    const seen: BridgeFile[] = []
    watcher = new BridgeWatcher(bridge.store.paths, file => seen.push(file), { debounceMs: 20, pollIntervalMs: 5000 })
    watcher.start()
    fs.writeFileSync(`${bridge.store.paths.dir}/otra-cosa.txt`, 'hola')
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.deepEqual(seen.filter(file => file !== undefined), [])
  })

  it('el sondeo detecta cambios aunque fs.watch no avise', async () => {
    const seen: BridgeFile[] = []
    // Sin carpeta, fs.watch falla y solo queda el sondeo.
    fs.rmSync(bridge.store.paths.dir, { recursive: true, force: true })
    watcher = new BridgeWatcher(bridge.store.paths, file => seen.push(file), { debounceMs: 10, pollIntervalMs: 50 })
    watcher.start()
    bridge.store.writeStats({ total: 1, onModel: 1, onEffort: 0, bestCombo: 1, byDay: {} })
    await waitFor(() => seen.includes('stats'))
  })

  it('despues de dispose no avisa nada mas', async () => {
    const seen: BridgeFile[] = []
    watcher = new BridgeWatcher(bridge.store.paths, file => seen.push(file), { debounceMs: 10, pollIntervalMs: 50 })
    watcher.start()
    watcher.dispose()
    bridge.store.updateConfig({ enabled: false })
    await new Promise(resolve => setTimeout(resolve, 250))
    assert.deepEqual(seen, [])
  })
})
