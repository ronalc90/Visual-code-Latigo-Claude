import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { COMMANDS, VIEW_CONTAINER_ID, VIEW_ID } from '../../src/commandIds'
import { TOGGLE_KEY_LABEL, TOGGLE_KEYBINDING, toggleKeyLabel } from '../../src/shortcuts'

type Manifest = {
  name: string
  version: string
  publisher: string
  categories: string[]
  main: string
  icon: string
  contributes: {
    commands: Array<{ command: string; title: string; category: string }>
    keybindings: Array<{ command: string; key: string; mac?: string; linux?: string; win?: string }>
    viewsContainers: { activitybar: Array<{ id: string; icon: string }> }
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

  it('el interruptor tiene su atajo: ⌃⌘L en Mac y Shift+Alt+L en Windows y Linux', () => {
    const binding = manifest.contributes.keybindings.find(item => item.command === COMMANDS.toggle)
    // Exacto: Windows y Linux usan `key`, sin `win` ni `linux` que lo pisen.
    assert.deepEqual(binding, { command: COMMANDS.toggle, key: 'shift+alt+l', mac: 'ctrl+cmd+l' })
  })

  it('el panel muestra el mismo atajo que declara el manifiesto', () => {
    const binding = manifest.contributes.keybindings.find(item => item.command === COMMANDS.toggle)
    assert.equal(binding?.mac, TOGGLE_KEYBINDING.mac)
    assert.equal(binding?.key, TOGGLE_KEYBINDING.other)
    assert.equal(TOGGLE_KEY_LABEL.mac, '⌃⌘L')
    assert.equal(TOGGLE_KEY_LABEL.other, 'Shift+Alt+L')
    assert.equal(toggleKeyLabel('MacIntel'), '⌃⌘L')
    assert.equal(toggleKeyLabel('darwin'), '⌃⌘L')
    assert.equal(toggleKeyLabel('Win32'), 'Shift+Alt+L')
    assert.equal(toggleKeyLabel('Linux x86_64'), 'Shift+Alt+L')
  })

  it('un solo atajo y un solo interruptor: no hay un modo latigo aparte', () => {
    assert.deepEqual(manifest.contributes.keybindings.map(item => item.command), [COMMANDS.toggle])
    assert.ok(!manifest.contributes.commands.some(item => /modo látigo/i.test(item.title) || item.command === 'latigo.toggleWhipMode'))
    const titles = Object.fromEntries(manifest.contributes.commands.map(item => [item.command, item.title]))
    assert.equal(titles[COMMANDS.toggle], 'Prender/Apagar')
    assert.equal(titles[COMMANDS.chooseSound], 'Elegir sonido')
  })

  it('ningun atajo usa Ctrl+Alt+letra (en Windows es AltGr y tapa letras como la ł)', () => {
    for (const binding of manifest.contributes.keybindings) {
      for (const key of [binding.key, binding.linux, binding.win].filter((value): value is string => value !== undefined)) {
        assert.ok(!/(^|\+)ctrl\+alt\+[a-z]$/.test(key) && !/(^|\+)alt\+ctrl\+[a-z]$/.test(key), key)
      }
    }
  })

  it('el latigo tiene su icono en la barra de actividad de la izquierda', () => {
    const container = manifest.contributes.viewsContainers.activitybar.find(item => item.id === VIEW_CONTAINER_ID)
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

  it('la version del manifiesto tiene su entrada en el CHANGELOG', () => {
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
    const latest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1]
    assert.equal(latest, manifest.version)
  })

  it('identidad, icono y categorias validas para el Marketplace', () => {
    assert.equal(manifest.name, 'latigo-claude')
    assert.equal(manifest.publisher, 'ronalc90')
    assert.equal(manifest.main, './dist/extension.js')
    assert.ok(fs.existsSync(path.join(root, manifest.icon)))
    assert.ok(manifest.categories.every(category => VALID_CATEGORIES.includes(category)))
  })
})
