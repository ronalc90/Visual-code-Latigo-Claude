// La app: icono en la barra de menu y el latigo encima de toda la pantalla.
//
// Un solo interruptor, el mismo del plugin y de VS Code (`enabled` en config.json):
// prendido, el puntero es un latigo. Ctrl+Cmd+L lo prende y lo apaga desde
// cualquier app, y Esc tambien lo apaga. Los clics siguen llegando a las apps: el
// latigazo solo se dibuja encima y revienta justo donde se dio el clic. Un
// latigazo sobre una ventana donde vive Claude Code (VS Code, terminales, la app
// de Claude) sube un nivel de effort a traves del puente.

import AppKit
import ServiceManagement

/// Lo que es solo de la app (no va al puente).
struct AppPreferences {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.register(defaults: ["escapeTurnsOff": true, "swishOnMove": false])
    }

    var escapeTurnsOff: Bool {
        get { defaults.bool(forKey: "escapeTurnsOff") }
        nonmutating set { defaults.set(newValue, forKey: "escapeTurnsOff") }
    }

    var swishOnMove: Bool {
        get { defaults.bool(forKey: "swishOnMove") }
        nonmutating set { defaults.set(newValue, forKey: "swishOnMove") }
    }

    /// Si ya se dejo la app para abrir al iniciar sesion (se hace una sola vez).
    var loginConfigured: Bool {
        get { defaults.bool(forKey: "loginConfigured") }
        nonmutating set { defaults.set(newValue, forKey: "loginConfigured") }
    }
}

/// Un golpe en camino: se dibuja cuando la punta llega al clic.
private struct PendingHit {
    let combo: Int
    let strength: Double
    let badge: (text: String, isMuted: Bool)?
}

private enum ToggleSource { case shortcut, escape, menu, elsewhere }

final class AppController: NSObject, NSApplicationDelegate {
    private let bridge: Bridge
    private let levels: Levels
    private let sounds: SoundCatalog
    private let audio = WhipAudio()
    private let preferences = AppPreferences()
    private var random = SeededRandom(seed: UInt64(Date().timeIntervalSince1970 * 1000))

    private var stats = Stats()
    private var config = LatigoConfig()
    private var rope = Rope(at: .zero)
    private var effects = Effects()
    private var motion = MotionTracker()
    private var forecast = EffortForecast()
    private var restSide = 1.0
    private var combo = 0
    private var lastLashAt: TimeInterval?
    private var lastFrame = Date()
    private var lastSwishAt = 0.0
    private var pendingHits: [PendingHit] = []
    private var lastWhipBounds = CGRect.null
    private var effectsWereActive = false
    private var presenceTick = 0
    private var opensAtLogin = false

    private var overlays: [OverlayWindow] = []
    private var frameTimer: Timer?
    private var bridgeTimer: Timer?
    private var clickMonitor: Any?
    private var toggleKey: HotKey?
    private var escapeKey: HotKey?
    private var menu: StatusMenu?

    init(levels: Levels, sounds: SoundCatalog) {
        self.levels = levels
        self.sounds = sounds
        bridge = Bridge(files: .standard(), soundStyles: Set(sounds.styles.map(\.id)), defaultSoundStyle: sounds.defaultId)
        super.init()
    }

    // MARK: Arranque

    func applicationDidFinishLaunching(_ notification: Notification) {
        quitOtherCopies()
        config = bridge.readConfig()
        stats = bridge.readStats()
        menu = StatusMenu(styles: sounds.styles, actions: self)
        toggleKey = HotKey(keyCode: HotKey.keyL, modifiers: HotKey.controlCommand, id: 1) { [weak self] in
            guard let self else { return }
            self.setEnabled(!self.config.enabled, from: .shortcut)
        }
        bridgeTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.pollBridge() }
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        openAtLoginOnce()
        opensAtLogin = SMAppService.mainApp.status == .enabled
        rope = Rope(at: pointer, restSide: restSide)
        applyEnabled()
        announce(atLaunch: true)
        writePresence()
        refreshMenu()
    }

    func applicationWillTerminate(_ notification: Notification) {
        bridge.writeDesktopPresence(at: 0, whipMode: false, hotkey: toggleKey?.status ?? .ok)
    }

    /// Una sola copia: la que se abre ahora (la mas nueva) cierra las demas, que se
    /// quedarian con el atajo.
    private func quitOtherCopies() {
        guard let id = Bundle.main.bundleIdentifier else { return }
        for other in NSRunningApplication.runningApplications(withBundleIdentifier: id) where other != .current {
            other.terminate()
        }
    }

    /// La primera vez, la app queda para abrir al iniciar sesion: asi el atajo siempre esta.
    private func openAtLoginOnce() {
        guard !preferences.loginConfigured, Bundle.main.bundlePath.contains("/Applications/") else { return }
        preferences.loginConfigured = true
        try? SMAppService.mainApp.register()
    }

    /// Cambia config.json sobre lo que hay en disco: asi no se pisa un cambio de VS Code.
    private func updateConfig(_ change: (inout LatigoConfig) -> Void) {
        var fresh = bridge.readConfig()
        change(&fresh)
        config = fresh
        bridge.writeConfig(fresh)
    }

    private var pointer: Vec {
        let mouse = NSEvent.mouseLocation
        return Vec(x: mouse.x, y: mouse.y)
    }

    private var reducedMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    // MARK: El interruptor

    private func setEnabled(_ on: Bool, from source: ToggleSource) {
        guard on != config.enabled else { return }
        if source == .elsewhere { config.enabled = on } else { updateConfig { $0.enabled = on } }
        applyEnabled()
        announce(atLaunch: false)
        writePresence()
        refreshMenu()
    }

    /// Prendido: ventanas encima, clics y Esc. Apagado: nada (salvo el aviso que se apaga solo).
    private func applyEnabled() {
        if config.enabled {
            rope = Rope(at: pointer, restSide: restSide)
            pendingHits.removeAll()
            if clickMonitor == nil {
                clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] _ in self?.click() }
            }
        } else {
            if let clickMonitor { NSEvent.removeMonitor(clickMonitor) }
            clickMonitor = nil
            pendingHits.removeAll()
        }
        updateEscapeKey()
        showOverlays()
        startFrames()
    }

    private func updateEscapeKey() {
        let wanted = config.enabled && preferences.escapeTurnsOff
        if wanted && escapeKey == nil {
            escapeKey = HotKey(keyCode: HotKey.keyEscape, modifiers: 0, id: 2) { [weak self] in self?.setEnabled(false, from: .escape) }
        } else if !wanted {
            escapeKey?.unregister()
            escapeKey = nil
        }
    }

    /// El aviso junto al puntero: que paso y como se deshace.
    private func announce(atLaunch: Bool) {
        let shortcutWorks = toggleKey?.status != .ocupado
        let title: String, subtitle: String
        if config.enabled {
            title = "Látigo prendido"
            let off = preferences.escapeTurnsOff ? (shortcutWorks ? "Esc o ⌃⌘L lo apagan" : "Esc lo apaga") : (shortcutWorks ? "⌃⌘L lo apaga" : "se apaga desde el menú")
            subtitle = "Clic para dar latigazos · \(off)"
        } else {
            title = atLaunch ? "Látigo listo" : "Látigo apagado"
            subtitle = shortcutWorks ? "⌃⌘L lo prende" : "Otra app usa ⌃⌘L: préndelo desde el menú"
        }
        effects.showHud(title: title, subtitle: subtitle, at: pointer)
        showOverlays()
        startFrames()
    }

    // MARK: El latigazo

    private func click() {
        guard config.enabled else { return }
        let point = pointer
        let now = Date()
        let millis = now.timeIntervalSince1970 * 1000
        combo = Rules.nextCombo(previousAt: lastLashAt, previousCombo: combo, now: now.timeIntervalSince1970)
        lastLashAt = now.timeIntervalSince1970

        let target: Target = TargetApps.isClaudeHost(TargetApps.ownerName(at: point)) ? .effort : .model
        let session = target == .effort ? bridge.liveSession(now: millis) : nil
        let before = stats.total
        stats = bridge.recordLash(target: target, combo: combo, now: now, known: stats).stats
        let leveledUp = levels.progress(stats.total).tier.level > levels.progress(before).tier.level

        // Como venia el mouse decide el latigazo; el sonido elegido, cuanto tarda.
        let features = motion.features(now: ProcessInfo.processInfo.systemUptime)
        let style = sounds.style(config.soundStyle)
        let file = config.sound && !style.isLiveSynth ? sounds.pick(style.id, random: random.next()) : nil
        let duration = reducedMotion ? 0.08 : SoundTiming.lashDuration(motion: LashPlan.motionDuration(features), file: file)
        let plan = LashPlan.make(motion: features, target: point, handle: rope.handle, duration: duration, combo: combo, random: &random)
        if let interrupted = rope.startLash(plan) { land(interrupted) }
        pendingHits.append(PendingHit(combo: combo, strength: plan.strength, badge: badge(for: target, session: session, now: millis)))

        if config.sound {
            if let file {
                let timing = SoundTiming.schedule(crackAt: file.crackAt, impact: duration)
                audio.play(file, volume: Float(0.82 + 0.12 * random.next()), after: timing.delay, from: timing.offset)
            } else if style.isLiveSynth {
                let sound = WhipSound(crackAt: duration, speed: features.speed, isDouble: plan.echoDelay != nil ? true : nil, doubleGap: plan.echoDelay)
                audio.play(sound.render(random: &random))
            }
            if leveledUp { audio.playLevelUp(after: duration) }
        }
        startFrames()
        refreshMenu()
    }

    /// Lo que el latigazo le hace al effort, para mostrarlo en el golpe.
    private func badge(for target: Target, session: SessionPresence?, now: Double) -> (text: String, isMuted: Bool)? {
        guard target == .effort else { return nil }
        guard let session else { return ("sin sesión de Claude Code", true) }
        guard let next = forecast.next(session: session.effort, boost: session.boost, presenceAt: session.at, now: now) else {
            return ("effort ya en max", false)
        }
        return ("effort ▲ \(next.rawValue)", false)
    }

    /// La punta llego al clic: el golpe se ve.
    private func land(_ crack: Crack) {
        let look = levels.look(stats.total)
        guard !crack.isEcho else {
            effects.crack(crack, look: look, combo: 1, strength: 1, reducedMotion: reducedMotion, random: &random)
            return
        }
        let hit = pendingHits.isEmpty ? PendingHit(combo: combo, strength: 1, badge: nil) : pendingHits.removeFirst()
        effects.crack(crack, look: look, combo: hit.combo, strength: hit.strength, reducedMotion: reducedMotion, random: &random)
        if let badge = hit.badge { effects.badge(badge.text, isMuted: badge.isMuted, at: crack.at, combo: hit.combo) }
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
        let point = pointer
        let uptime = ProcessInfo.processInfo.systemUptime
        motion.add(point, time: uptime)

        if config.enabled {
            let features = motion.features(now: uptime)
            let screen = NSScreen.screens.first { $0.frame.contains(NSPoint(x: point.x, y: point.y)) }?.frame
            restSide = chooseRestSide(current: restSide, motion: features, pointer: point, screen: screen.map { ($0.minX, $0.maxX) })
            for crack in rope.step(pointer: point, dt: dt, restSide: restSide) { land(crack) }
            swishIfFast(features, now: uptime)
        }
        effects.step(dt: dt)

        if !config.enabled && effects.isIdle {
            frameTimer?.invalidate()
            frameTimer = nil
            overlays.forEach { $0.orderOut(nil) }
            lastWhipBounds = .null
            return
        }
        redraw()
    }

    /// Solo se redibuja lo que cambio: la zona de la cuerda, o todo si hay efectos (y
    /// una vez mas cuando terminan, para borrarlos).
    private func redraw() {
        let active = !effects.isIdle || !config.enabled
        if active || effectsWereActive {
            overlays.forEach { $0.invalidate(nil) }
            effectsWereActive = active
            lastWhipBounds = .null
            return
        }
        guard !rope.isSettled || lastWhipBounds.isNull else { return }
        let bounds = Renderer.whipBounds(rope)
        let dirty = lastWhipBounds.isNull ? bounds : bounds.union(lastWhipBounds)
        lastWhipBounds = bounds
        overlays.forEach { $0.invalidate(dirty) }
    }

    private func swishIfFast(_ features: MotionFeatures, now: Double) {
        guard preferences.swishOnMove, config.sound, !rope.isLashing, features.speed > 1.3, now - lastSwishAt > 0.35 else { return }
        lastSwishAt = now
        audio.play(WhipSound.pass(speed: features.speed, random: &random), volume: 0.35)
    }

    private var currentScene: Scene {
        Scene(rope: rope, effects: effects, look: levels.look(stats.total), level: levels.progress(stats.total).tier.level,
              showWhip: config.enabled, reducedMotion: reducedMotion)
    }

    private func showOverlays() {
        if overlays.isEmpty { buildOverlays() }
        overlays.forEach {
            $0.invalidate(nil)
            $0.orderFrontRegardless()
        }
        lastWhipBounds = .null
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
        if config.enabled || !effects.isIdle { showOverlays() }
    }

    // MARK: Puente

    private func pollBridge() {
        let fresh = bridge.readConfig()
        if fresh != config {
            let switched = fresh.enabled != config.enabled
            config.sound = fresh.sound
            config.soundStyle = fresh.soundStyle
            // Lo prendieron o apagaron desde VS Code o la consola.
            if switched { setEnabled(fresh.enabled, from: .elsewhere) }
        }
        let onDisk = bridge.readStats()
        if onDisk.total > stats.total { stats = stats.merged(with: onDisk) }
        presenceTick += 1
        if presenceTick % 4 == 0 { writePresence() }
        refreshMenu()
    }

    private func writePresence() {
        bridge.writeDesktopPresence(at: Date().timeIntervalSince1970 * 1000, whipMode: config.enabled, hotkey: toggleKey?.status ?? .ok)
    }

    // MARK: Menu

    private func refreshMenu() {
        let progress = levels.progress(stats.total)
        let count = stats.total == 1 ? "1 latigazo" : "\(stats.total) latigazos"
        menu?.update(StatusMenuState(enabled: config.enabled, escapeTurnsOff: preferences.escapeTurnsOff, sound: config.sound, soundStyle: config.soundStyle,
                                     swishOnMove: preferences.swishOnMove, level: "Nv \(progress.tier.level) · \(progress.tier.name) · \(count)",
                                     hotkey: toggleKey?.status ?? .ok, opensAtLogin: opensAtLogin, look: levels.look(stats.total)))
    }
}

extension AppController: StatusMenuActions {
    func menuToggleWhip() { setEnabled(!config.enabled, from: .menu) }

    func menuToggleEscape() {
        preferences.escapeTurnsOff.toggle()
        updateEscapeKey()
        refreshMenu()
    }

    /// Elegir un sonido lo prende y deja oirlo.
    func menuChooseSound(_ id: String) {
        updateConfig {
            $0.soundStyle = id
            $0.sound = true
        }
        let style = sounds.style(id)
        if style.isLiveSynth {
            audio.play(WhipSound(crackAt: 0.16, speed: 1).render(random: &random))
        } else {
            audio.play(sounds.pick(id, random: random.next()), volume: 0.9, after: 0, from: 0)
        }
        refreshMenu()
    }

    func menuToggleSound() {
        updateConfig { $0.sound.toggle() }
        refreshMenu()
    }

    func menuToggleSwish() {
        preferences.swishOnMove.toggle()
        refreshMenu()
    }

    func menuToggleLogin() {
        if SMAppService.mainApp.status == .enabled { try? SMAppService.mainApp.unregister() } else { try? SMAppService.mainApp.register() }
        opensAtLogin = SMAppService.mainApp.status == .enabled
        refreshMenu()
    }

    func menuOpenHelp() {
        NSWorkspace.shared.open(URL(string: "https://github.com/ronalc90/Visual-code-Latigo-Claude#app-de-escritorio")!)
    }
}
