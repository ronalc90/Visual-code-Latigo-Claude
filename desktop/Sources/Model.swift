// Reglas del juego para la app de escritorio. Son las mismas de hooks/model.ts
// y hooks/levels.ts: los niveles se leen de niveles.json, que se genera de
// levels.ts al compilar, y las pruebas comparan la interpolacion con la de alla.

import Foundation

enum Target: String { case model, effort }

/// Los niveles de effort de Claude Code, como EFFORTS en hooks/model.ts.
enum Effort: String, CaseIterable {
    case low, medium, high, xhigh, max

    static let standard = Effort.medium

    /// Un nivel mas (nil si ya esta en max).
    var raised: Effort? {
        let all = Effort.allCases
        let index = all.firstIndex(of: self)!
        return index + 1 < all.count ? all[index + 1] : nil
    }

    /// El que de verdad sale: el mayor entre el de la sesion y el forzado (effectiveEffort).
    static func effective(session: Effort?, forced: Effort?) -> Effort? {
        guard let forced else { return session }
        guard let session else { return forced }
        let all = Effort.allCases
        return all.firstIndex(of: forced)! > all.firstIndex(of: session)! ? forced : session
    }
}

/// A que effort sube un latigazo, para mostrarlo en el golpe. La sesion avisa su
/// effort cada 3 s; si los latigazos llegan mas rapido, se cuenta desde el ultimo.
struct EffortForecast {
    private var last: (effort: Effort, at: Double)?

    /// `session` y `boost` como los escribio la sesion a los `presenceAt` ms; `now` en ms.
    /// nil: ya esta en max.
    mutating func next(session: Effort?, boost: Effort?, presenceAt: Double, now: Double) -> Effort? {
        var base = Effort.effective(session: session, forced: boost) ?? .standard
        if let last, last.at > presenceAt { base = Effort.effective(session: base, forced: last.effort) ?? base }
        let raised = base.raised
        last = (raised ?? base, now)
        return raised
    }
}

struct Stats: Equatable {
    var total = 0, onModel = 0, onEffort = 0, bestCombo = 0
    var byDay: [String: Int] = [:]

    static func from(json: Any?) -> Stats {
        guard let raw = json as? [String: Any] else { return Stats() }
        func count(_ value: Any?) -> Int {
            guard let n = value as? NSNumber, n.doubleValue.isFinite, n.doubleValue >= 0 else { return 0 }
            return Int(n.doubleValue.rounded(.down))
        }
        var stats = Stats(total: count(raw["total"]), onModel: count(raw["onModel"]), onEffort: count(raw["onEffort"]), bestCombo: count(raw["bestCombo"]))
        if let days = raw["byDay"] as? [String: Any] {
            for (day, n) in days where day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
                stats.byDay[day] = count(n)
            }
        }
        return stats
    }

    var json: [String: Any] { ["total": total, "onModel": onModel, "onEffort": onEffort, "bestCombo": bestCombo, "byDay": byDay] }

    /// El mayor de cada campo: los conteos solo crecen (como mergeStats).
    func merged(with other: Stats) -> Stats {
        var byDay = self.byDay
        for (day, n) in other.byDay { byDay[day] = max(byDay[day] ?? 0, n) }
        return Stats(total: max(total, other.total), onModel: max(onModel, other.onModel), onEffort: max(onEffort, other.onEffort), bestCombo: max(bestCombo, other.bestCombo), byDay: byDay)
    }

    func recording(_ target: Target, combo: Int, day: String) -> Stats {
        var next = self
        next.total += 1
        if target == .model { next.onModel += 1 } else { next.onEffort += 1 }
        next.bestCombo = max(bestCombo, combo)
        next.byDay[day, default: 0] += 1
        return next
    }
}

enum Rules {
    static let comboWindow: TimeInterval = 1.5

    static func nextCombo(previousAt: TimeInterval?, previousCombo: Int, now: TimeInterval) -> Int {
        guard let previousAt, now >= previousAt, now - previousAt <= comboWindow else { return 1 }
        return previousCombo + 1
    }

    static func comboTitle(_ combo: Int) -> String {
        switch combo {
        case 20...: return "¡¡DIOS DEL LÁTIGO!!"
        case 10...: return "¡LEYENDA!"
        case 7...: return "¡IMPARABLE!"
        case 5...: return "¡FURIA!"
        case 3...: return "¡TRIPLE!"
        case 2: return "¡DOBLE!"
        default: return ""
        }
    }

    /// Dia local YYYY-MM-DD.
    static func day(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

struct RGB: Equatable {
    var r: Double, g: Double, b: Double

    init(r: Double, g: Double, b: Double) { (self.r, self.g, self.b) = (r, g, b) }

    init(hex: String) {
        let n = Int(hex.dropFirst(), radix: 16) ?? 0
        self.init(r: Double((n >> 16) & 255), g: Double((n >> 8) & 255), b: Double(n & 255))
    }

    var hex: String { String(format: "#%02x%02x%02x", Int(r.rounded()), Int(g.rounded()), Int(b.rounded())) }

    func mixed(with other: RGB, _ t: Double) -> RGB {
        let k = min(1, max(0, t))
        // Igual que mixHex: se redondea al final.
        return RGB(r: (r + (other.r - r) * k).rounded(), g: (g + (other.g - g) * k).rounded(), b: (b + (other.b - b) * k).rounded())
    }
}

struct Tier {
    let level: Int, name: String, minLashes: Int
    let handle: RGB, lash: RGB, glow: RGB
    let tip: String, crack: String
    let sparks: [String]
    let sparkDensity: Double
}

struct Look {
    let handle: RGB, lash: RGB, glow: RGB
    let tip: String, crack: String
    let sparks: [String]
    let sparkDensity: Double
}

struct Progress {
    let tier: Tier
    let next: Tier?
    let progress: Double
    let remaining: Int
}

struct Levels {
    let tiers: [Tier]

    init(tiers: [Tier]) { self.tiers = tiers }

    /// Lee niveles.json (generado de hooks/levels.ts).
    init(json data: Data) throws {
        let root = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let list = root?["tiers"] as? [[String: Any]] ?? []
        tiers = list.map { t in
            Tier(level: t["level"] as? Int ?? 1, name: t["name"] as? String ?? "", minLashes: t["minLashes"] as? Int ?? 0,
                 handle: RGB(hex: t["handle"] as? String ?? "#000000"), lash: RGB(hex: t["lash"] as? String ?? "#000000"), glow: RGB(hex: t["glow"] as? String ?? "#000000"),
                 tip: t["tip"] as? String ?? "✸", crack: t["crack"] as? String ?? "¡CHAS!", sparks: t["sparks"] as? [String] ?? [],
                 sparkDensity: (t["sparkDensity"] as? NSNumber)?.doubleValue ?? 0)
        }
    }

    func progress(_ total: Int) -> Progress {
        let lashes = max(0, total)
        var index = 0
        for (i, tier) in tiers.enumerated() where lashes >= tier.minLashes { index = i }
        let tier = tiers[index]
        guard index + 1 < tiers.count else { return Progress(tier: tier, next: nil, progress: 1, remaining: 0) }
        let next = tiers[index + 1]
        let span = Double(next.minLashes - tier.minLashes)
        return Progress(tier: tier, next: next, progress: Double(lashes - tier.minLashes) / span, remaining: next.minLashes - lashes)
    }

    func look(_ total: Int) -> Look {
        let p = progress(total)
        guard let next = p.next else {
            return Look(handle: p.tier.handle, lash: p.tier.lash, glow: p.tier.glow, tip: p.tier.tip, crack: p.tier.crack, sparks: p.tier.sparks, sparkDensity: p.tier.sparkDensity)
        }
        return Look(handle: p.tier.handle.mixed(with: next.handle, p.progress), lash: p.tier.lash.mixed(with: next.lash, p.progress), glow: p.tier.glow.mixed(with: next.glow, p.progress),
                    tip: p.tier.tip, crack: p.tier.crack, sparks: p.tier.sparks,
                    sparkDensity: p.tier.sparkDensity + (next.sparkDensity - p.tier.sparkDensity) * p.progress)
    }
}
