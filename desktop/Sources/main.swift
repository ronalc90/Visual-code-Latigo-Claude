// Punto de entrada. Sin argumentos arranca la app de la barra de menu.
//   --demo <carpeta> <fondo.png>     fotos del latigo encima de una captura (con el mismo codigo de la app)
//   --frames <carpeta> <fondo.png>   los cuadros de una secuencia, para el GIF del README
//   --render-sounds <carpeta assets> los sonidos sinteticos que usan el plugin y VS Code
//   --diagnostico                    si el atajo esta libre, si hay otra copia abierta y el puente

import AppKit

func loadResource(_ name: String) -> Data {
    let url = Bundle.main.url(forResource: name, withExtension: "json")
        ?? URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("\(name).json")
    guard let data = try? Data(contentsOf: url) else { fatalError("No se encontro \(name).json") }
    return data
}

func loadLevels() -> Levels {
    guard let levels = try? Levels(json: loadResource("niveles")), !levels.tiers.isEmpty else { fatalError("niveles.json no sirve") }
    return levels
}

func loadSounds() -> SoundCatalog {
    guard let sounds = try? SoundCatalog(json: loadResource("sonidos")), !sounds.styles.isEmpty else { fatalError("sonidos.json no sirve") }
    return sounds
}

enum Demo {
    enum Path { case still, straight, curve, zigzag }

    /// Un recorrido del puntero que termina en `end` (dura `seconds`).
    static func position(_ path: Path, end: Vec, t: Double) -> Vec {
        switch path {
        case .still: return end
        case .straight: return end + Vec(x: -300 * (1 - t), y: -50 * (1 - t))
        case .curve:
            let angle = Double.pi * (0.25 + 1.25 * t)
            let finish = Double.pi * 1.5
            return end + Vec(x: 110 * (cos(angle) - cos(finish)), y: 110 * (sin(angle) - sin(finish)))
        case .zigzag: return end + Vec(x: -260 * (1 - t), y: 36 * sin(t * Double.pi * 7))
        }
    }

    /// Lo mismo que hace la app: mueve el puntero, da el clic y deja correr el tiempo.
    struct Run {
        var rope: Rope
        var effects = Effects()
        var motion = MotionTracker()
        var random = SeededRandom(seed: 42)
        var side = 1.0
        var time = 0.0
        var plan: LashPlan?
        var badge: String?
        var combo: Int
        let look: Look
        let screen: (minX: Double, maxX: Double)

        init(start: Vec, look: Look, combo: Int, screen: (minX: Double, maxX: Double)) {
            rope = Rope(at: start)
            self.look = look
            self.combo = combo
            self.screen = screen
        }

        mutating func tick(_ point: Vec, dt: Double = 1.0 / 60) {
            motion.add(point, time: time)
            side = chooseRestSide(current: side, motion: motion.features(now: time), pointer: point, screen: screen)
            for crack in rope.step(pointer: point, dt: dt, restSide: side) {
                effects.crack(crack, look: look, combo: crack.isEcho ? 1 : combo, strength: plan?.strength ?? 1, reducedMotion: false, random: &random)
                if !crack.isEcho, let badge { effects.badge(badge, isMuted: false, at: crack.at, combo: combo) }
            }
            effects.step(dt: dt)
            time += dt
        }

        mutating func move(_ path: Path, to end: Vec, seconds: Double, onFrame: (Run) -> Void = { _ in }) {
            let frames = Int(seconds * 60)
            for i in 0...frames {
                tick(Demo.position(path, end: end, t: Double(i) / Double(max(1, frames))))
                onFrame(self)
            }
        }

        mutating func click(at point: Vec, badge: String?) {
            let features = motion.features(now: time)
            let lash = LashPlan.make(motion: features, target: point, handle: rope.handle, duration: LashPlan.motionDuration(features), combo: combo, random: &random)
            plan = lash
            self.badge = badge
            rope.startLash(lash)
        }

        func scene(level: Int) -> Scene { Scene(rope: rope, effects: effects, look: look, level: level, showWhip: true) }
    }

    struct Shot {
        let name: String
        let total: Int
        let combo: Int
        let path: Path
        /// Donde se da el clic, en proporcion del fondo (0…1, y hacia arriba).
        let point: (x: Double, y: Double)
        /// Proporcion del latigazo cuando se toma la foto (nil: sin clic, la cuerda en reposo).
        let at: Double?
        let badge: String?
    }

    static let shots = [
        Shot(name: "pantalla-curva", total: 230, combo: 1, path: .curve, point: (0.47, 0.42), at: nil, badge: nil),
        Shot(name: "pantalla-zigzag", total: 900, combo: 1, path: .zigzag, point: (0.6, 0.55), at: nil, badge: nil),
        Shot(name: "pantalla-bucle", total: 230, combo: 1, path: .straight, point: (0.47, 0.6), at: 0.6, badge: nil),
        Shot(name: "pantalla-golpe", total: 1320, combo: 1, path: .curve, point: (0.47, 0.6), at: 1.12, badge: "effort ▲ high"),
        Shot(name: "pantalla-combo-nivel14", total: 7100, combo: 6, path: .zigzag, point: (0.47, 0.6), at: 1.2, badge: "effort ▲ max"),
    ]

    static func run(outputDirectory: String, background: String, levels: Levels) {
        let canvas = Canvas(background: background)
        for shot in shots {
            let tip = Vec(x: shot.point.x * canvas.pointsWide, y: shot.point.y * canvas.pointsHigh)
            var run = Run(start: position(shot.path, end: tip, t: 0), look: levels.look(shot.total), combo: shot.combo, screen: (0, canvas.pointsWide))
            for _ in 0..<60 { run.tick(position(shot.path, end: tip, t: 0)) }
            run.move(shot.path, to: tip, seconds: 0.6)
            if let at = shot.at {
                run.click(at: tip, badge: shot.badge)
                let until = run.time + (run.plan?.duration ?? 0.2) * at
                while run.time < until { run.tick(tip) }
            }
            canvas.save(run.scene(level: levels.progress(shot.total).tier.level), to: (outputDirectory as NSString).appendingPathComponent("\(shot.name).png"))
        }
    }

    /// Cuadros a 30 por segundo: una curva y un latigazo, un zigzag y otro (combo x2).
    static func frames(outputDirectory: String, background: String, levels: Levels) {
        let canvas = Canvas(background: background)
        let total = 1320
        let look = levels.look(total), level = levels.progress(total).tier.level
        let first = Vec(x: canvas.pointsWide * 0.36, y: canvas.pointsHigh * 0.45)
        let second = Vec(x: canvas.pointsWide * 0.64, y: canvas.pointsHigh * 0.5)
        var run = Run(start: position(.curve, end: first, t: 0), look: look, combo: 1, screen: (0, canvas.pointsWide))
        var index = 0
        func shoot(_ run: Run) {
            if Int((run.time * 60).rounded()) % 2 == 0 {
                canvas.save(run.scene(level: level), to: (outputDirectory as NSString).appendingPathComponent(String(format: "cuadro-%03d.png", index)))
                index += 1
            }
        }
        for _ in 0..<30 { run.tick(position(.curve, end: first, t: 0)) }
        run.move(.curve, to: first, seconds: 0.7, onFrame: shoot)
        run.click(at: first, badge: "effort ▲ high")
        for _ in 0..<54 { run.tick(first); shoot(run) }
        let across = (second - first).normalized.perpendicular
        let steps = 40
        for i in 0...steps {
            let t = Double(i) / Double(steps)
            run.tick(first + (second - first) * t + across * (34 * sin(t * Double.pi * 6)))
            shoot(run)
        }
        run.combo = 2
        run.click(at: second, badge: "effort ▲ xhigh")
        for _ in 0..<70 { run.tick(second); shoot(run) }
        print("\(index) cuadros en \(outputDirectory)")
    }

    /// El fondo (una captura Retina) y donde se dibuja encima.
    struct Canvas {
        let bitmap: NSBitmapImageRep
        let scale = 2.0
        var pointsWide: Double { Double(bitmap.pixelsWide) / scale }
        var pointsHigh: Double { Double(bitmap.pixelsHigh) / scale }

        init(background: String) {
            guard let image = NSImage(contentsOfFile: background),
                  let bitmap = image.representations.first as? NSBitmapImageRep ?? NSBitmapImageRep(data: image.tiffRepresentation ?? Data())
            else { fatalError("No se pudo leer el fondo \(background)") }
            self.bitmap = bitmap
        }

        func save(_ scene: Scene, to path: String) {
            let width = bitmap.pixelsWide, height = bitmap.pixelsHigh
            guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
                  let background = bitmap.cgImage
            else { return }
            context.draw(background, in: CGRect(x: 0, y: 0, width: width, height: height))
            context.scaleBy(x: scale, y: scale)
            Renderer.draw(scene, in: context, origin: .zero)
            guard let output = context.makeImage() else { return }
            try? NSBitmapImageRep(cgImage: output).representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
            print("listo \(path)")
        }
    }
}

let arguments = CommandLine.arguments
if arguments.count >= 4, arguments[1] == "--demo" {
    Demo.run(outputDirectory: arguments[2], background: arguments[3], levels: loadLevels())
    exit(0)
}
if arguments.count >= 4, arguments[1] == "--frames" {
    Demo.frames(outputDirectory: arguments[2], background: arguments[3], levels: loadLevels())
    exit(0)
}
if arguments.count >= 3, arguments[1] == "--render-sounds" {
    do {
        for path in try SoundRender.renderAll(catalog: loadSounds(), into: URL(fileURLWithPath: arguments[2])) { print("listo \(path)") }
        exit(0)
    } catch {
        print("No se pudieron escribir los sonidos: \(error)")
        exit(1)
    }
}

/// Para cuando "el atajo no sirve": dice quien lo tiene y como esta el puente.
func diagnose() {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    print("Látigo \(version) · diagnóstico")
    let others = NSRunningApplication.runningApplications(withBundleIdentifier: "com.ronalc90.latigo").filter { $0 != .current }
    if others.isEmpty {
        print("Otra copia abierta: no")
    } else {
        for other in others { print("Otra copia abierta: sí · pid \(other.processIdentifier) · \(other.bundleURL?.path ?? "?")") }
    }
    let hotkey = HotKey(keyCode: HotKey.keyL, modifiers: HotKey.controlCommand, id: 9) {}
    // macOS solo deja saber si otra app lo tiene en exclusiva; las demas no se ven.
    print(hotkey.status == .ok ? "Atajo ⌃⌘L: se puede registrar" : "Atajo ⌃⌘L: otra app lo tiene en exclusiva (ciérrala o usa el menú del látigo)")
    hotkey.unregister()
    let sounds = loadSounds()
    let bridge = Bridge(files: .standard(), soundStyles: Set(sounds.styles.map(\.id)), defaultSoundStyle: sounds.defaultId)
    let config = bridge.readConfig()
    print("Puente: \(bridge.files.dir.path)")
    print("Látigo \(config.enabled ? "prendido" : "apagado") · sonido \(config.sound ? sounds.style(config.soundStyle).label : "apagado")")
    if let session = bridge.liveSession(now: Date().timeIntervalSince1970 * 1000) {
        print("Sesión de Claude Code: viva · \(session.model ?? "?") · effort \(session.effort?.rawValue ?? "?")\(session.boost.map { " (látigo: \($0.rawValue))" } ?? "")")
    } else {
        print("Sesión de Claude Code: no hay (el effort sube solo con una sesión abierta)")
    }
}

if arguments.count >= 2, arguments[1] == "--diagnostico" {
    diagnose()
    exit(0)
}

let app = NSApplication.shared
let controller = AppController(levels: loadLevels(), sounds: loadSounds())
app.delegate = controller
app.setActivationPolicy(.accessory)
app.run()
