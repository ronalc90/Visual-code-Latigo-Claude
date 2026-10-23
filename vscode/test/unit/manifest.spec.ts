import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { COMMANDS, VIEW_CONTAINER_ID, VIEW_ID } from '../../src/commandIds'

type Manifest = {
  name: string
  publisher: string
  categories: string[]
  main: string
  icon: string
  contributes: {
    commands: Array<{ command: string; title: string; category: string }>
    keybindings: Array<{ command: string; key: string; mac: string; linux?: string; win?: string }>
    viewsContainers: { panel: Array<{ id: string; icon: string }> }
    views: Record<string, Array<{ id: string; type: string }>>
    menus: Record<string, Array<{ command: string; when?: string }>>
    configuration: { properties: Record<string, { default: unknown }> }
  }
}

const root = path.join(__dirname, '..', '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as Manifest

// La lista de categorias que acepta VS Code (la misma que valida el editor).
const VALID_CATEGORIES = ['AI', 'Azure', 'Chat', 'Data Science', 'Debuggers', 'Extension Packs', 'Education', 'Formatters', 'Keymaps', 'Language Packs', 'Linters', 'Machine Learning', 'Notebooks', 'Programming Languages', 'SCM Providers', 'Snippets', 'Testing', 'Themes', 'Visualization', 'Other']

describe('package.json', () => {
  it('declara exactamente los comandos del codigo, todos en la categoria Látigo', () => {
    const declared = manifest.contributes.commands.map(command => command.command).sort()
    assert.deepEqual(declared, Object.values(COMMANDS).sort())
    assert.ok(manifest.contributes.commands.every(command => command.category === 'Látigo'))
  })

  it('el atajo de encender/apagar esta declarado para mac, windows y linux', () => {
    const binding = manifest.contributes.keybindings.find(item => item.command === COMMANDS.toggle)
    assert.ok(binding)
    assert.equal(binding.mac, 'ctrl+cmd+l')
    assert.equal(binding.key, 'shift+alt+l')
    assert.equal(binding.linux, undefined)
    assert.equal(binding.win, undefined)
  })

  it('ningun atajo usa Ctrl+Alt+letra (en Windows es AltGr y tapa letras como la ł)', () => {
    for (const binding of manifest.contributes.keybindings) {
      for (const key of [binding.key, binding.linux, binding.win].filter((value): value is string => value !== undefined)) {
        assert.ok(!/(^|\+)ctrl\+alt\+[a-z]$/.test(key) && !/(^|\+)alt\+ctrl\+[a-z]$/.test(key), key)
      }
    }
  })

  it('el panel vive en su propio contenedor del area inferior', () => {
    const container = manifest.contributes.viewsContainers.panel.find(item => item.id === VIEW_CONTAINER_ID)
    assert.ok(container)
    assert.ok(fs.existsSync(path.join(root, container.icon)))
    assert.deepEqual(manifest.contributes.views[VIEW_CONTAINER_ID]?.map(view => [view.id, view.type]), [[VIEW_ID, 'webview']])
  })

  it('los botones del titulo del panel y los comandos internos ocultos', () => {
    const title = manifest.contributes.menus['view/title'] ?? []
    for (const command of [COMMANDS.turnOn, COMMANDS.turnOff, COMMANDS.soundOn, COMMANDS.soundOff]) {
      assert.ok(title.some(item => item.command === command && item.when?.includes(`view == ${VIEW_ID}`)))
      assert.ok((manifest.contributes.menus.commandPalette ?? []).some(item => item.command === command && item.when === 'false'))
    }
  })

  it('los ajustes tienen los valores por defecto esperados', () => {
    const properties = manifest.contributes.configuration.properties
    assert.equal(properties['latigo.showStatusBar']?.default, true)
    assert.equal(properties['latigo.reducedMotion']?.default, 'auto')
    assert.equal(properties['latigo.volume']?.default, 0.7)
  })

  it('identidad, icono y categorias validas para el Marketplace', () => {
    assert.equal(manifest.name, 'latigo-claude')
    assert.equal(manifest.publisher, 'ronalc90')
    assert.equal(manifest.main, './dist/extension.js')
    assert.ok(fs.existsSync(path.join(root, manifest.icon)))
    assert.ok(manifest.categories.every(category => VALID_CATEGORIES.includes(category)))
  })
})
