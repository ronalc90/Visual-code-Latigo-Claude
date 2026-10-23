// Los sonidos para elegir. Salen de hooks/sounds.ts (sonidos.json, que build.sh
// genera al compilar): las grabaciones reales y los sinteticos ya hechos para el
// plugin y VS Code. En la app, el estilo "aire" no usa archivos: se sintetiza en
// el momento con el movimiento del mouse.

import Foundation

struct SoundFile: Equatable {
    /// Dentro de assets/ (en la app, dentro de Resources/).
    let path: String
    /// Segundos desde que empieza el archivo hasta el golpe.
    let crackAt: Double
}

struct SoundStyle: Equatable {
    let id: String
    let label: String
    let description: String
    let files: [SoundFile]

    /// "aire" se hace en el momento; el resto son archivos.
    var isLiveSynth: Bool { id == SoundCatalog.liveSynthId }
}

struct SoundCatalog {
    static let liveSynthId = "aire"

    let styles: [SoundStyle]
    let defaultId: String

    init(styles: [SoundStyle], defaultId: String) {
        self.styles = styles
        self.defaultId = defaultId
    }

    /// Lee sonidos.json (generado de hooks/sounds.ts).
    init(json data: Data) throws {
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let list = root?["styles"] as? [[String: Any]] ?? []
        styles = list.map { raw in
            let files = (raw["files"] as? [[String: Any]] ?? []).map { file in
                SoundFile(path: file["path"] as? String ?? "", crackAt: ((file["crackAtMs"] as? NSNumber)?.doubleValue ?? 150) / 1000)
            }
            return SoundStyle(id: raw["id"] as? String ?? "", label: raw["label"] as? String ?? "", description: raw["description"] as? String ?? "", files: files)
        }
        defaultId = root?["default"] as? String ?? styles.first?.id ?? "real"
    }

    func contains(_ id: String) -> Bool { styles.contains { $0.id == id } }

    /// El estilo con ese id; uno desconocido da el de siempre.
    func style(_ id: String) -> SoundStyle {
        styles.first { $0.id == id } ?? styles.first { $0.id == defaultId } ?? styles[0]
    }

    /// Un archivo del estilo, elegido con `random` en [0, 1).
    func pick(_ id: String, random: Double) -> SoundFile {
        let files = style(id).files
        return files[min(files.count - 1, Int(max(0, random) * Double(files.count)))]
    }
}

/// Como sincronizar un archivo con el latigazo.
enum SoundTiming {
    /// El golpe de un archivo no hace esperar mas que esto (los completos golpean a los ~0,35 s).
    static let longestWait = 0.36

    /// Lo que dura el latigazo si suena `file`: lo que pide el movimiento, o mas si
    /// el archivo golpea despues (asi se oye entero).
    static func lashDuration(motion: Double, file: SoundFile?) -> Double {
        guard let file else { return motion }
        return max(motion, min(file.crackAt, longestWait))
    }

    /// Cuando dar play y desde donde, para que el golpe del archivo caiga a los
    /// `impact` segundos del clic: si el golpe del archivo llega antes se espera;
    /// si llega despues, se salta el comienzo.
    static func schedule(crackAt: Double, impact: Double) -> (delay: Double, offset: Double) {
        crackAt <= impact ? (impact - crackAt, 0) : (0, crackAt - impact)
    }
}

/// Los sinteticos que van como archivo para el plugin y VS Code (`--render-sounds`).
enum SoundRender {
    struct Preset {
        let speed: Double
        let isDouble: Bool
        let character: WhipSound.Character
        let seed: UInt64
    }

    static let presets: [String: Preset] = [
        "sonidos/aire-1.wav": Preset(speed: 1.0, isDouble: false, character: .aire, seed: 11),
        "sonidos/aire-2.wav": Preset(speed: 1.8, isDouble: false, character: .aire, seed: 23),
        "sonidos/aire-3.wav": Preset(speed: 0.4, isDouble: false, character: .aire, seed: 37),
        "sonidos/aire-4.wav": Preset(speed: 1.2, isDouble: true, character: .aire, seed: 41),
        "sonidos/suave-1.wav": Preset(speed: 0.6, isDouble: false, character: .suave, seed: 53),
        "sonidos/suave-2.wav": Preset(speed: 0.8, isDouble: false, character: .suave, seed: 67),
    ]

    /// Escribe en `folder` (la carpeta assets/) cada archivo sintetico del catalogo,
    /// con el golpe en el momento que dice sonidos.json.
    static func renderAll(catalog: SoundCatalog, into folder: URL) throws -> [String] {
        var written: [String] = []
        for style in catalog.styles {
            for file in style.files {
                guard let preset = presets[file.path] else { continue }
                var random = SeededRandom(seed: preset.seed)
                let samples = WhipSound(crackAt: file.crackAt, speed: preset.speed, isDouble: preset.isDouble, character: preset.character).render(random: &random)
                let url = folder.appendingPathComponent(file.path)
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try WavFile.data(samples).write(to: url, options: .atomic)
                written.append(file.path)
            }
        }
        return written
    }
}
