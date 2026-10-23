// El menu de la barra: el interruptor del latigo, el sonido, el nivel y el atajo.
// Solo muestra el estado y avisa lo que se eligio; las decisiones las toma el
// controlador.

import AppKit

protocol StatusMenuActions: AnyObject {
    func menuToggleWhip()
    func menuToggleEscape()
    func menuChooseSound(_ id: String)
    func menuToggleSound()
    func menuToggleSwish()
    func menuToggleLogin()
    func menuOpenHelp()
}

struct StatusMenuState {
    var enabled: Bool
    var escapeTurnsOff: Bool
    var sound: Bool
    var soundStyle: String
    var swishOnMove: Bool
    var level: String
    var hotkey: HotKeyStatus
    var opensAtLogin: Bool
    var look: Look
}

final class StatusMenu: NSObject {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private weak var actions: StatusMenuActions?
    private let whipItem = NSMenuItem(title: "Látigo prendido", action: #selector(toggleWhip), keyEquivalent: "")
    private let escapeItem = NSMenuItem(title: "Esc también lo apaga", action: #selector(toggleEscape), keyEquivalent: "")
    private let hotkeyItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let soundItem = NSMenuItem(title: "Sonido", action: nil, keyEquivalent: "")
    private let muteItem = NSMenuItem(title: "Sin sonido", action: #selector(toggleSound), keyEquivalent: "")
    private let swishItem = NSMenuItem(title: "Zumbido al mover el látigo", action: #selector(toggleSwish), keyEquivalent: "")
    private let levelItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Abrir al iniciar sesión", action: #selector(toggleLogin), keyEquivalent: "")
    private var styleItems: [NSMenuItem] = []

    init(styles: [SoundStyle], actions: StatusMenuActions) {
        self.actions = actions
        super.init()
        let menu = NSMenu()
        for item in [whipItem, escapeItem, muteItem, swishItem, loginItem] { item.target = self }
        hotkeyItem.isEnabled = false
        levelItem.isEnabled = false

        let soundMenu = NSMenu()
        for style in styles {
            let item = NSMenuItem(title: style.label, action: #selector(chooseSound(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = style.id
            item.toolTip = style.description
            styleItems.append(item)
            soundMenu.addItem(item)
        }
        soundMenu.addItem(.separator())
        soundMenu.addItem(muteItem)
        soundMenu.addItem(swishItem)
        soundItem.submenu = soundMenu

        menu.addItem(whipItem)
        menu.addItem(escapeItem)
        menu.addItem(hotkeyItem)
        menu.addItem(.separator())
        menu.addItem(soundItem)
        menu.addItem(.separator())
        menu.addItem(levelItem)
        menu.addItem(.separator())
        menu.addItem(loginItem)
        let help = NSMenuItem(title: "Cómo se usa…", action: #selector(openHelp), keyEquivalent: "")
        help.target = self
        menu.addItem(help)
        menu.addItem(NSMenuItem(title: "Salir del Látigo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    func update(_ state: StatusMenuState) {
        whipItem.state = state.enabled ? .on : .off
        whipItem.title = state.enabled ? "Látigo prendido" : "Látigo apagado"
        escapeItem.state = state.escapeTurnsOff ? .on : .off
        hotkeyItem.title = state.hotkey == .ok ? "⌃⌘L lo prende y lo apaga en cualquier app" : "Otra app usa ⌃⌘L: prende y apaga desde aquí"
        for item in styleItems { item.state = state.sound && item.representedObject as? String == state.soundStyle ? .on : .off }
        muteItem.state = state.sound ? .off : .on
        swishItem.state = state.swishOnMove ? .on : .off
        swishItem.isEnabled = state.sound
        soundItem.title = state.sound ? "Sonido: \(styleItems.first { $0.state == .on }?.title ?? "")" : "Sonido: apagado"
        levelItem.title = state.level
        loginItem.state = state.opensAtLogin ? .on : .off
        statusItem.button?.image = StatusIcon.image(active: state.enabled, look: state.look)
        statusItem.button?.toolTip = state.enabled ? "Látigo prendido · ⌃⌘L o Esc lo apagan" : "Látigo apagado · ⌃⌘L lo prende"
    }

    @objc private func toggleWhip() { actions?.menuToggleWhip() }
    @objc private func toggleEscape() { actions?.menuToggleEscape() }
    @objc private func chooseSound(_ sender: NSMenuItem) { if let id = sender.representedObject as? String { actions?.menuChooseSound(id) } }
    @objc private func toggleSound() { actions?.menuToggleSound() }
    @objc private func toggleSwish() { actions?.menuToggleSwish() }
    @objc private func toggleLogin() { actions?.menuToggleLogin() }
    @objc private func openHelp() { actions?.menuOpenHelp() }
}

/// El icono de la barra de menu: el latigo dibujado (plantilla apagado, del color del nivel prendido).
enum StatusIcon {
    static func image(active: Bool, look: Look) -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: true) { _ in
            let color = active ? Renderer.color(look.glow) : NSColor.black
            color.setStroke()
            let grip = NSBezierPath()
            grip.move(to: NSPoint(x: 2.4, y: 15.6))
            grip.line(to: NSPoint(x: 5.6, y: 12.4))
            grip.lineWidth = 2.4
            grip.lineCapStyle = .round
            grip.stroke()
            let lash = NSBezierPath()
            lash.move(to: NSPoint(x: 5.6, y: 12.4))
            lash.curve(to: NSPoint(x: 10.2, y: 5.8), controlPoint1: NSPoint(x: 7.6, y: 10.4), controlPoint2: NSPoint(x: 7.4, y: 7.2))
            lash.curve(to: NSPoint(x: 15.8, y: 8.1), controlPoint1: NSPoint(x: 12.6, y: 4.6), controlPoint2: NSPoint(x: 15.2, y: 5.9))
            lash.curve(to: NSPoint(x: 13.6, y: 10.6), controlPoint1: NSPoint(x: 16.3, y: 9.6), controlPoint2: NSPoint(x: 15.1, y: 10.9))
            lash.lineWidth = 1.3
            lash.lineCapStyle = .round
            lash.stroke()
            return true
        }
        image.isTemplate = !active
        return image
    }
}
