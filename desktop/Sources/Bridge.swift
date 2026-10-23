// El puente con el plugin de Claude Code y la extension de VS Code: los mismos
// archivos JSON de ~/.claude-latigo/ (formatos de hooks/bridge.ts). Las lecturas
// nunca fallan: un archivo roto o que falta da valores por defecto. Las
// escrituras son atomicas.

import Foundation

struct BridgeFiles {
    let dir: URL
    var config: URL { dir.appendingPathComponent("config.json") }
    var stats: URL { dir.appendingPathComponent("stats.json") }
    var effort: URL { dir.appendingPathComponent("effort.json") }
    var lash: URL { dir.appendingPathComponent("lash.json") }
    var presence: URL { dir.appendingPathComponent("presence.json") }
    var desktop: URL { dir.appendingPathComponent("desktop.json") }

    /// La misma regla que el plugin y la extension: LATIGO_HOME, HOME y la carpeta del usuario.
    static func standard(environment: [String: String] = ProcessInfo.processInfo.environment) -> BridgeFiles {
        let candidates = [environment["LATIGO_HOME"], environment["HOME"]].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
        let home = candidates.first { !$0.isEmpty } ?? NSHomeDirectory()
        return BridgeFiles(dir: URL(fileURLWithPath: home).appendingPathComponent(".claude-latigo"))
    }
}

/// El unico interruptor del latigo (en todos lados) y el sonido.
struct LatigoConfig: Equatable {
    var enabled = true
    var sound = true
    var soundStyle = "real"
}

/// Presencia de la sesion de Claude Code (la escribe el plugin cada 3 s).
struct SessionPresence {
    var at: Double
    var model: String?
    var effort: Effort?
    var boost: Effort?
}

/// Si el atajo global quedo registrado o lo tiene otra app.
enum HotKeyStatus: String { case ok, ocupado }

final class Bridge {
    static let version = 1
    static let presenceTTL: Double = 15_000

    let files: BridgeFiles
    /// Los estilos de sonido que existen; uno desconocido en config.json da `defaultSoundStyle`.
    let soundStyles: Set<String>
    let defaultSoundStyle: String

    init(files: BridgeFiles, soundStyles: Set<String> = ["real"], defaultSoundStyle: String = "real") {
        self.files = files
        self.soundStyles = soundStyles
        self.defaultSoundStyle = defaultSoundStyle
    }

    // MARK: Lectura

    func readObject(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url), let object = try? JSONSerialization.jsonObject(with: data) else { return nil }
        return object as? [String: Any]
    }

    func readConfig() -> LatigoConfig {
        guard let raw = readObject(files.config) else { return LatigoConfig(soundStyle: defaultSoundStyle) }
        let style = raw["soundStyle"] as? String
        return LatigoConfig(enabled: raw["enabled"] as? Bool ?? true, sound: raw["sound"] as? Bool ?? true,
                            soundStyle: style.flatMap { soundStyles.contains($0) ? $0 : nil } ?? defaultSoundStyle)
    }

    func readStats() -> Stats { Stats.from(json: readObject(files.stats)?["stats"]) }

    func readEffortSeq() -> Int {
        guard let n = readObject(files.effort)?["seq"] as? NSNumber, n.doubleValue.isFinite, n.doubleValue > 0 else { return 0 }
        return Int(n.doubleValue)
    }

    func readSessionPresence() -> SessionPresence? {
        guard let raw = readObject(files.presence) else { return nil }
        return SessionPresence(at: (raw["at"] as? NSNumber)?.doubleValue ?? 0, model: raw["model"] as? String,
                               effort: (raw["effort"] as? String).flatMap(Effort.init(rawValue:)),
                               boost: (raw["boost"] as? String).flatMap(Effort.init(rawValue:)))
    }

    /// La sesion de Claude Code, si esta viva.
    func liveSession(now: Double) -> SessionPresence? {
        guard let presence = readSessionPresence(), now - presence.at >= 0, now - presence.at < Bridge.presenceTTL else { return nil }
        return presence
    }

    // MARK: Escritura

    func write(_ object: [String: Any], to url: URL) {
        var payload = object
        payload["version"] = Bridge.version
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return }
        try? FileManager.default.createDirectory(at: files.dir, withIntermediateDirectories: true)
        try? (data + Data("\n".utf8)).write(to: url, options: .atomic)
    }

    func writeConfig(_ config: LatigoConfig) {
        write(["enabled": config.enabled, "sound": config.sound, "soundStyle": config.soundStyle], to: files.config)
    }

    /// `whipMode`: el puntero es un latigo en este momento. `hotkey`: si el atajo funciona.
    func writeDesktopPresence(at: Double, whipMode: Bool, hotkey: HotKeyStatus) {
        write(["at": at, "whipMode": whipMode, "hotkey": hotkey.rawValue], to: files.desktop)
    }

    /// Cuenta un latigazo de la app: suma en stats.json (junto con lo que ya habia),
    /// pide un nivel mas de effort si hay sesion viva y avisa en lash.json.
    @discardableResult
    func recordLash(target: Target, combo: Int, now: Date, known: Stats) -> (stats: Stats, effortRequested: Bool) {
        let millis = now.timeIntervalSince1970 * 1000
        let before = known.merged(with: readStats())
        let after = before.recording(target, combo: combo, day: Rules.day(now))
        write(["stats": after.json], to: files.stats)

        var effortRequested = false
        if target == .effort && liveSession(now: millis) != nil {
            write(["seq": readEffortSeq() + 1, "at": millis], to: files.effort)
            effortRequested = true
        }
        let id = "d-\(Int(millis))-\(after.total)"
        write(["id": id, "at": millis, "target": target.rawValue, "combo": combo, "total": after.total, "source": "desktop"], to: files.lash)
        return (after, effortRequested)
    }
}
