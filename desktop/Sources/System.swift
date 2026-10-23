// Lo que habla con macOS: atajos globales, que app esta debajo del clic, el
// audio y las ventanas transparentes encima de toda la pantalla.

import AppKit
import AVFoundation
import Carbon.HIToolbox

// MARK: Atajos globales (Carbon: no piden permisos)

final class HotKey {
    private static var handlers: [UInt32: () -> Void] = [:]
    private static var isInstalled = false
    private var reference: EventHotKeyRef?
    private let id: UInt32
    /// `.ocupado` si otra app ya tenia la combinacion: puede que no llegue aqui.
    private(set) var status = HotKeyStatus.ok

    init(keyCode: Int, modifiers: Int, id: UInt32, handler: @escaping () -> Void) {
        self.id = id
        HotKey.installHandler()
        HotKey.handlers[id] = handler
        let hotKeyID = EventHotKeyID(signature: OSType(0x4C41_5447), id: id) // 'LATG'
        // Primero en exclusiva: si otra app ya la tiene, falla y se avisa.
        var result = RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), hotKeyID, GetEventDispatcherTarget(), OptionBits(kEventHotKeyExclusive), &reference)
        if result != noErr {
            status = .ocupado
            result = RegisterEventHotKey(UInt32(keyCode), UInt32(modifiers), hotKeyID, GetEventDispatcherTarget(), 0, &reference)
            if result != noErr { reference = nil }
        }
    }

    deinit { unregister() }

    func unregister() {
        if let reference { UnregisterEventHotKey(reference) }
        reference = nil
        HotKey.handlers[id] = nil
    }

    private static func installHandler() {
        guard !isInstalled else { return }
        isInstalled = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetEventDispatcherTarget(), { _, event, _ in
            var hotKeyID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            HotKey.handlers[hotKeyID.id]?()
            return noErr
        }, 1, &spec, nil, nil)
    }

    static let controlCommand = controlKey | cmdKey
    static let keyL = kVK_ANSI_L
    static let keyEscape = kVK_Escape
}

// MARK: Que app esta debajo del clic

enum TargetApps {
    /// Donde puede estar una conversacion de Claude Code: editores con la extension,
    /// terminales y la app de escritorio de Claude.
    static let claudeHosts: Set<String> = [
        "Code", "Visual Studio Code", "Code - Insiders", "Cursor", "Windsurf", "VSCodium",
        "Terminal", "iTerm2", "Warp", "Ghostty", "kitty", "Alacritty", "WezTerm", "Hyper", "Tabby", "Claude",
    ]

    static func isClaudeHost(_ ownerName: String?) -> Bool {
        guard let ownerName else { return false }
        return claudeHosts.contains(ownerName)
    }

    /// El dueño de la ventana normal mas al frente en `point` (coordenadas de Cocoa).
    /// El nombre del dueño no necesita el permiso de grabar la pantalla.
    static func ownerName(at point: Vec) -> String? {
        guard let mainHeight = NSScreen.screens.first?.frame.height,
              let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
        else { return nil }
        let quartz = CGPoint(x: point.x, y: mainHeight - point.y)
        for window in list {
            guard (window[kCGWindowLayer as String] as? Int) == 0,
                  (window[kCGWindowOwnerPID as String] as? Int32) != getpid(),
                  let bounds = window[kCGWindowBounds as String] as? NSDictionary,
                  let rect = CGRect(dictionaryRepresentation: bounds), rect.contains(quartz)
            else { continue }
            return window[kCGWindowOwnerName as String] as? String
        }
        return nil
    }
}

// MARK: Audio

final class WhipAudio {
    private let engine = AVAudioEngine()
    private var players: [AVAudioPlayerNode] = []
    private var nextPlayer = 0
    private let format = AVAudioFormat(standardFormatWithSampleRate: WhipSound.sampleRate, channels: 1)!
    private var levelUpPlayer: AVAudioPlayer?
    /// Las grabaciones ya leidas, por ruta.
    private var clips: [String: [Float]] = [:]
    private let resources: URL?

    init(resources: URL? = Bundle.main.resourceURL) {
        self.resources = resources
        // Varios reproductores para que los latigazos de un combo se monten.
        for _ in 0..<6 {
            let player = AVAudioPlayerNode()
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            players.append(player)
        }
        try? engine.start()
    }

    /// Toca `samples` dentro de `delay` segundos.
    func play(_ samples: [Float], volume: Float = 0.9, after delay: Double = 0) {
        guard !samples.isEmpty else { return }
        if delay > 0.001 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.play(samples, volume: volume) }
            return
        }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)) else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { source in
            buffer.floatChannelData![0].update(from: source.baseAddress!, count: samples.count)
        }
        if !engine.isRunning { try? engine.start() }
        let player = players[nextPlayer]
        nextPlayer = (nextPlayer + 1) % players.count
        player.stop()
        player.volume = volume
        player.scheduleBuffer(buffer, completionHandler: nil)
        player.play()
    }

    /// Toca un archivo del catalogo: espera `delay` y arranca `offset` segundos adentro.
    func play(_ file: SoundFile, volume: Float, after delay: Double, from offset: Double) {
        guard let samples = samples(for: file) else { return }
        let start = min(samples.count, Int(offset * WhipSound.sampleRate))
        play(Array(samples[start...]), volume: volume, after: delay)
    }

    func samples(for file: SoundFile) -> [Float]? {
        if let cached = clips[file.path] { return cached }
        guard let url = resources?.appendingPathComponent(file.path), let samples = WhipAudio.load(url) else { return nil }
        clips[file.path] = samples
        return samples
    }

    /// Lee un WAV mono de 44,1 kHz (los de assets/sonidos).
    static func load(_ url: URL) -> [Float]? {
        guard let file = try? AVAudioFile(forReading: url), file.processingFormat.sampleRate == WhipSound.sampleRate,
              let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
              (try? file.read(into: buffer)) != nil, let channel = buffer.floatChannelData?[0]
        else { return nil }
        return Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
    }

    func playLevelUp(after delay: Double = 0) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, let url = self.resources?.appendingPathComponent("nivel.wav") else { return }
            self.levelUpPlayer = try? AVAudioPlayer(contentsOf: url)
            self.levelUpPlayer?.volume = 0.8
            self.levelUpPlayer?.play()
        }
    }
}

// MARK: Ventanas transparentes encima de todo

final class OverlayView: NSView {
    var scene: () -> Scene? = { nil }

    override var isOpaque: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        guard let context = NSGraphicsContext.current?.cgContext, let window, let scene = scene() else { return }
        context.clear(dirtyRect)
        Renderer.draw(scene, in: context, origin: Vec(x: window.frame.origin.x, y: window.frame.origin.y))
    }
}

final class OverlayWindow: NSWindow {
    let overlay = OverlayView()

    init(screen: NSScreen) {
        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        // Encima de todo, en todos los escritorios y sobre apps a pantalla completa.
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        // Los clics pasan a la app de abajo: el latigazo solo se dibuja encima.
        ignoresMouseEvents = true
        isReleasedWhenClosed = false
        contentView = overlay
        setFrame(screen.frame, display: false)
    }

    /// Vuelve a dibujar `rect` (coordenadas de pantalla), o todo si es nil.
    func invalidate(_ rect: CGRect?) {
        guard let rect else {
            overlay.needsDisplay = true
            return
        }
        let local = rect.offsetBy(dx: -frame.origin.x, dy: -frame.origin.y).intersection(overlay.bounds)
        if !local.isNull && !local.isEmpty { overlay.setNeedsDisplay(local) }
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
