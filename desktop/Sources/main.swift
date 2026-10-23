// Punto de entrada. Sin argumentos arranca la app de la barra de menu.
// Con `--demo <carpeta> <fondo.png>` dibuja, con el mismo codigo de la app, el
// latigo y sus golpes encima de una captura de pantalla y guarda las fotos.

import AppKit

func loadLevels() -> Levels {
    let url = Bundle.main.url(forResource: "niveles", withExtension: "json")
        ?? URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("niveles.json")
    guard let data = try? Data(contentsOf: url), let levels = try? Levels(json: data), !levels.tiers.isEmpty else {
        fatalError("No se encontro niveles.json")
    }
    return levels
}

enum Demo {
    struct Shot {
        let name: String
        let total: Int
        let combo: Int
        /// Punta del latigo y lugar del golpe, en proporcion del fondo (0…1, y hacia arriba).
        let point: (x: Double, y: Double)
        /// Segundos despues del golpe (nil: sin golpe, el latigo en reposo).
        let after: Double?
    }

    static func run(outputDirectory: String, background: String, levels: Levels) {
        guard let image = NSImage(contentsOfFile: background),
              let bitmap = image.representations.first as? NSBitmapImageRep ?? NSBitmapImageRep(data: image.tiffRepresentation ?? Data())
        else { fatalError("No se pudo leer el fondo \(background)") }
        let width = bitmap.pixelsWide, height = bitmap.pixelsHigh
        // Las capturas son Retina (2 pixeles por punto); la app dibuja en puntos.
        let scale = 2.0
        let pointsWide = Double(width) / scale, pointsHigh = Double(height) / scale
        let shots = [
            Shot(name: "pantalla-reposo", total: 230, combo: 1, point: (0.55, 0.62), after: nil),
            Shot(name: "pantalla-golpe-nivel1", total: 4, combo: 1, point: (0.42, 0.66), after: 0.05),
            Shot(name: "pantalla-combo-nivel9", total: 1320, combo: 3, point: (0.5, 0.56), after: 0.07),
            Shot(name: "pantalla-golpe-nivel14", total: 7100, combo: 6, point: (0.46, 0.56), after: 0.08),
        ]
        for shot in shots {
            var random = SeededRandom(seed: 42)
            let tip = Vec(x: shot.point.x * pointsWide, y: shot.point.y * pointsHigh)
            var rope = Rope(at: tip + Vec(x: -90, y: 40))
            var effects = Effects()
            // La punta llega moviendose: asi la cuerda tiene forma natural.
            for i in 0..<90 {
                let t = Double(i) / 89
                rope.step(tip: tip + Vec(x: -90 * (1 - t), y: 40 * (1 - t)), dt: 1.0 / 60)
            }
            let look = levels.look(shot.total)
            if let after = shot.after {
                rope.strike(strength: 1.3)
                effects.burst(at: tip, look: look, combo: shot.combo, strength: 1.3, reducedMotion: false, random: &random)
                var elapsed = 0.0
                while elapsed < after {
                    rope.step(tip: tip, dt: 1.0 / 60)
                    effects.step(dt: 1.0 / 60)
                    elapsed += 1.0 / 60
                }
            }
            let scene = Scene(rope: rope, effects: effects, look: look, level: levels.progress(shot.total).tier.level, showWhip: true)
            guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                          space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
                  let backgroundImage = bitmap.cgImage
            else { continue }
            context.draw(backgroundImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            context.scaleBy(x: scale, y: scale)
            Renderer.draw(scene, in: context, origin: Vec(x: 0, y: 0))
            guard let output = context.makeImage() else { continue }
            let rep = NSBitmapImageRep(cgImage: output)
            let path = (outputDirectory as NSString).appendingPathComponent("\(shot.name).png")
            try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
            print("listo \(path)")
        }
    }
}

let arguments = CommandLine.arguments
if arguments.count >= 4, arguments[1] == "--demo" {
    Demo.run(outputDirectory: arguments[2], background: arguments[3], levels: loadLevels())
    exit(0)
}

let app = NSApplication.shared
let controller = AppController(levels: loadLevels())
app.delegate = controller
app.setActivationPolicy(.accessory)
app.run()
