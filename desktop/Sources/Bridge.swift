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
    var whipMode: URL { dir.appendingPathComponent("whipmode.json") }

    /// La misma regla que el plugin y la extension: LATIGO_HOME, HOME y la carpeta del usuario.
    static func standard(environment: [String: String] = ProcessInfo.processInfo.environment) -> BridgeFiles {
        let candidates = [environment["LATIGO_HOME"], environment["HOME"]].compactMap { $0?.trimmingCharacters(in: .whitespaces) }
        let home = candidates.first { !$0.isEmpty } ?? NSHomeDirectory()
        return BridgeFiles(dir: URL(fileURLWithPath: home).appendingPathComponent(".claude-latigo"))
    }
}

struct LatigoConfig: Equatable {
    var enabled = true
    var sound = true
}

/// Presencia de la sesion de Claude Code (la escribe el plugin cada 3 s).
struct SessionPresence {
    var at: Double
    var model: String?
}

final class Bridge {
    static let version = 1
    static let presenceTTL: Double = 15_000

    let files: BridgeFiles

    init(files: BridgeFiles) { self.files = files }

    // MARK: Lectura

    func readObject(_ url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url), let object = try? JSONSerialization.jsonObject(with: data) else { return nil }
        return object as? [String: Any]
    }

    func readConfig() -> LatigoConfig {
        guard let raw = readObject(files.config) else { return LatigoConfig() }
        return LatigoConfig(enabled: raw["enabled"] as? Bool ?? true, sound: raw["sound"] as? Bool ?? true)
    }

    func readStats() -> Stats { Stats.from(json: readObject(files.stats)?["stats"]) }

    func readEffortSeq() -> Int {
        guard let n = readObject(files.effort)?["seq"] as? NSNumber, n.doubleValue.isFinite, n.doubleValue > 0 else { return 0 }
        return Int(n.doubleValue)
    }

    func readSessionPresence() -> SessionPresence? {
        guard let raw = readObject(files.presence) else { return nil }
        return SessionPresence(at: (raw["at"] as? NSNumber)?.doubleValue ?? 0, model: raw["model"] as? String)
    }

    func isSessionAlive(now: Double) -> Bool {
        guard let presence = readSessionPresence() else { return false }
        return now - presence.at >= 0 && now - presence.at < Bridge.presenceTTL
    }

    /// El pedido de VS Code para prender o apagar el modo latigo: (seq, active).
    func readWhipModeRequest() -> (seq: Int, active: Bool)? {
        guard let raw = readObject(files.whipMode), let active = raw["active"] as? Bool else { return nil }
        return (Int((raw["seq"] as? NSNumber)?.doubleValue ?? 0), active)
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
        write(["enabled": config.enabled, "sound": config.sound], to: files.config)
    }

    func writeDesktopPresence(at: Double, whipMode: Bool) {
        write(["at": at, "whipMode": whipMode], to: files.desktop)
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
        if target == .effort && isSessionAlive(now: millis) {
            write(["seq": readEffortSeq() + 1, "at": millis], to: files.effort)
            effortRequested = true
        }
        let id = "d-\(Int(millis))-\(after.total)"
        write(["id": id, "at": millis, "target": target.rawValue, "combo": combo, "total": after.total, "source": "desktop"], to: files.lash)
        return (after, effortRequested)
    }
}
