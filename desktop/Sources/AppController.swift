// La app: icono en la barra de menu, modo latigo con Ctrl+Cmd+L (Esc o el mismo
// atajo lo apagan), el latigo pegado al puntero y el golpe en cada clic. Los
// clics siguen llegando a las apps; el latigazo solo se dibuja encima. Un
// latigazo sobre una ventana donde vive Claude Code (VS Code, terminales, la app
// de Claude) sube un nivel de effort a traves del puente.

import AppKit
import ServiceManagement

final class AppController: NSObject, NSApplicationDelegate {
    private let bridge = Bridge(files: .standard())
    private let levels: Levels
    private let audio = WhipAudio()
    private var random = SeededRandom(seed: UInt64(Date().timeIntervalSince1970 * 1000))

    private var stats = Stats()
    private var config = LatigoConfig()
    private var rope = Rope(at: Vec(x: 0, y: 0))
    private var effects = Effects()
    private var speed = PointerSpeed()
    private var whipMode = false
    private var combo = 0
    private var lastLashAt: TimeInterval?
    private var lastFrame = Date()
    private var lastWhipRequestSeq: Int?

    private var overlays: [OverlayWindow] = []
    private var frameTimer: Timer?
    private var bridgeTimer: Timer?
    private var clickMonitor: Any?
    private var toggleKey: HotKey?
    private var escapeKey: HotKey?
    private var statusItem: NSStatusItem!
    private let modeItem = NSMenuItem(title: "Modo látigo", action: #selector(toggleFromMenu), keyEquivalent: "")
    private let soundItem = NSMenuItem(title: "Sonido", action: #selector(toggleSound), keyEquivalent: "")
    private let levelItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Abrir al iniciar sesión", action: #selector(toggleLogin), keyEquivalent: "")

    init(levels: Levels) {
        self.levels = levels
        super.init()
    }

    // MARK: Arranque

    func applicationDidFinishLaunching(_ notification: Notification) {
        config = bridge.readConfig()
        stats = bridge.readStats()
        lastWhipRequestSeq = bridge.readWhipModeRequest()?.seq
        buildStatusItem()
        toggleKey = HotKey(keyCode: HotKey.keyL, modifiers: HotKey.controlCommand, id: 1) { [weak self] in self?.toggleWhipMode() }
        bridgeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.pollBridge() }
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        writePresence()
        refreshMenu()
    }

    func applicationWillTerminate(_ notification: Notification) {
        bridge.writeDesktopPresence(at: 0, whipMode: false)
    }

    // MARK: Modo latigo

    @objc private func toggleFromMenu() { toggleWhipMode() }

    func toggleWhipMode() { setWhipMode(!whipMode) }

    func setWhipMode(_ on: Bool) {
        guard on != whipMode else { return }
        whipMode = on
        if on {
            // Prender el modo prende el latigo si estaba apagado.
            if !config.enabled {
                config.enabled = true
                bridge.writeConfig(config)
            }
            let mouse = NSEvent.mouseLocation
            rope = Rope(at: Vec(x: mouse.x, y: mouse.y))
            showOverlays()
            escapeKey = HotKey(keyCode: HotKey.keyEscape, modifiers: 0, id: 2) { [weak self] in self?.setWhipMode(false) }
            clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] _ in
                let point = NSEvent.mouseLocation
                self?.crack(at: Vec(x: point.x, y: point.y))
            }
            startFrames()
        } else {
            escapeKey?.unregister()
            escapeKey = nil
            if let clickMonitor { NSEvent.removeMonitor(clickMonitor) }
            clickMonitor = nil
            // Las chispas que quedan terminan de caer; despues se esconden las ventanas.
        }
        writePresence()
        refreshMenu()
    }

    /// Un latigazo donde esta el puntero.
    func crack(at point: Vec) {
        guard whipMode else { return }
        let now = Date()
        combo = Rules.nextCombo(previousAt: lastLashAt, previousCombo: combo, now: now.timeIntervalSince1970)
        lastLashAt = now.timeIntervalSince1970

        let owner = TargetApps.ownerName(at: point)
        let target: Target = TargetApps.isClaudeHost(owner) ? .effort : .model
        let before = stats.total
        let result = bridge.recordLash(target: target, combo: combo, now: now, known: stats)
        stats = result.stats
        let level = levels.progress(stats.total).tier.level
        let leveledUp = level > levels.progress(before).tier.level

        let strength = 0.7 + speed.normalized * 0.5 + min(0.4, Double(combo) * 0.04)
        rope.strike(strength: strength)
        effects.burst(at: point, look: levels.look(stats.total), combo: combo, strength: strength,
                      reducedMotion: NSWorkspace.shared.accessibilityDisplayShouldReduceMotion, random: &random)
        if config.sound {
            let samples = WhipSound(speed: speed.normalized, combo: combo, level: level).render(random: &random)
            audio.play(samples)
            if leveledUp { audio.playLevelUp() }
        }
        refreshMenu()
    }

    // MARK: Cuadros

    private func startFrames() {
        guard frameTimer == nil else { return }
        lastFrame = Date()
        let timer = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in self?.frame() }
        RunLoop.main.add(timer, forMode: .common)
        frameTimer = timer
    }

    private func frame() {
        let now = Date()
        let dt = now.timeIntervalSince(lastFrame)
        lastFrame = now
        let mouse = NSEvent.mouseLocation
        let tip = Vec(x: mouse.x, y: mouse.y)
        speed.update(tip, dt: dt)
        rope.step(tip: tip, dt: dt)
        effects.step(dt: dt)
        if !rope.isFinite { rope = Rope(at: tip) }

        if !whipMode && effects.isIdle {
            frameTimer?.invalidate()
            frameTimer = nil
            overlays.forEach { $0.orderOut(nil) }
            return
        }
        overlays.forEach { $0.overlay.needsDisplay = true }
    }

    var currentScene: Scene {
        Scene(rope: rope, effects: effects, look: levels.look(stats.total), level: levels.progress(stats.total).tier.level, showWhip: whipMode)
    }

    private func showOverlays() {
        if overlays.isEmpty { buildOverlays() }
        overlays.forEach { $0.orderFrontRegardless() }
    }

    private func buildOverlays() {
        overlays.forEach { $0.orderOut(nil) }
        overlays = NSScreen.screens.map { screen in
            let window = OverlayWindow(screen: screen)
            window.overlay.scene = { [weak self] in self?.currentScene }
            return window
        }
    }

    @objc private func screensChanged() {
        buildOverlays()
        if whipMode { showOverlays() }
    }

    // MARK: Puente

    private var presenceTick = 0

    private func pollBridge() {
        let fresh = bridge.readConfig()
        if fresh != config {
            config = fresh
            if !config.enabled && whipMode { setWhipMode(false) }
        }
        if let request = bridge.readWhipModeRequest(), request.seq != lastWhipRequestSeq {
            lastWhipRequestSeq = request.seq
            setWhipMode(request.active)
        }
        let onDisk = bridge.readStats()
        if onDisk.total > stats.total { stats = stats.merged(with: onDisk) }
        presenceTick += 1
        if presenceTick % 4 == 0 { writePresence() }
        refreshMenu()
    }

    private func writePresence() {
        bridge.writeDesktopPresence(at: Date().timeIntervalSince1970 * 1000, whipMode: whipMode)
    }

    // MARK: Barra de menu

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()
        modeItem.target = self
        soundItem.target = self
        loginItem.target = self
        levelItem.isEnabled = false
        let hint = NSMenuItem(title: "Ctrl+Cmd+L prende y apaga · Esc sale", action: nil, keyEquivalent: "")
        hint.isEnabled = false
        menu.addItem(modeItem)
        menu.addItem(hint)
        menu.addItem(.separator())
        menu.addItem(levelItem)
        menu.addItem(soundItem)
        menu.addItem(.separator())
        menu.addItem(loginItem)
        let help = NSMenuItem(title: "Cómo se usa…", action: #selector(openHelp), keyEquivalent: "")
        help.target = self
        menu.addItem(help)
        menu.addItem(NSMenuItem(title: "Salir del Látigo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    private func refreshMenu() {
        modeItem.state = whipMode ? .on : .off
        modeItem.title = whipMode ? "Modo látigo: prendido" : "Modo látigo: apagado"
        soundItem.state = config.sound ? .on : .off
        let progress = levels.progress(stats.total)
        let count = stats.total == 1 ? "1 latigazo" : "\(stats.total) latigazos"
        levelItem.title = "Nv \(progress.tier.level) · \(progress.tier.name) · \(count)"
        if #available(macOS 13.0, *) { loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off }
        statusItem.button?.image = StatusIcon.image(active: whipMode, look: levels.look(stats.total))
        statusItem.button?.toolTip = whipMode ? "Látigo: modo látigo prendido (Esc para salir)" : "Látigo: Ctrl+Cmd+L para el modo látigo"
    }

    @objc private func toggleSound() {
        config.sound.toggle()
        bridge.writeConfig(config)
        refreshMenu()
    }

    @objc private func toggleLogin() {
        guard #available(macOS 13.0, *) else { return }
        if SMAppService.mainApp.status == .enabled { try? SMAppService.mainApp.unregister() } else { try? SMAppService.mainApp.register() }
        refreshMenu()
    }

    @objc private func openHelp() {
        NSWorkspace.shared.open(URL(string: "https://github.com/ronalc90/Visual-code-Latigo-Claude#app-de-escritorio")!)
    }
}

/// El icono de la barra de menu: el latigo dibujado (plantilla en reposo, del color del nivel prendido).
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
