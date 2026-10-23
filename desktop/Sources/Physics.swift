// La fisica del latigo en pantalla, sin AppKit para poder probarla.
//
// La punta del latigo va en el puntero; el mango lo sigue de lejos, abajo a la
// derecha, con resorte. Entre los dos, una cuerda de puntos (integracion de
// Verlet con restricciones de distancia) que cuelga con gravedad y se mece con
// el movimiento. Al dar clic, una onda recorre la cuerda del mango a la punta y
// la punta revienta donde estaba el puntero: ahi salen el destello, la onda de
// choque, las chispas y el grito.
//
// Coordenadas de pantalla de Cocoa: y crece hacia arriba.

import Foundation

struct Vec: Equatable {
    var x: Double, y: Double
    static func + (a: Vec, b: Vec) -> Vec { Vec(x: a.x + b.x, y: a.y + b.y) }
    static func - (a: Vec, b: Vec) -> Vec { Vec(x: a.x - b.x, y: a.y - b.y) }
    static func * (a: Vec, k: Double) -> Vec { Vec(x: a.x * k, y: a.y * k) }
    var length: Double { (x * x + y * y).squareRoot() }
    var normalized: Vec { let l = length; return l > 0 ? Vec(x: x / l, y: y / l) : Vec(x: 0, y: 0) }
    var perpendicular: Vec { Vec(x: -y, y: x) }
}

struct Rope {
    static let segments = 24
    static let length = 300.0
    /// Donde descansa el mango respecto a la punta: abajo a la derecha.
    static let handleOffset = Vec(x: 210, y: -150)

    private(set) var points: [Vec]
    private var previous: [Vec]
    private(set) var handle: Vec
    private var handleVelocity = Vec(x: 0, y: 0)
    /// Tiempo desde el ultimo latigazo (nil: en reposo).
    private(set) var strikeAge: Double?
    private var strikeStrength = 1.0

    var tip: Vec { points[0] }
    var segmentLength: Double { Rope.length / Double(Rope.segments) }
    var isStriking: Bool { strikeAge.map { $0 < Rope.strikeDuration } ?? false }

    static let strikeDuration = 0.22

    init(at tip: Vec) {
        handle = tip + Rope.handleOffset
        points = (0...Rope.segments).map { i in
            let t = Double(i) / Double(Rope.segments)
            return tip + Rope.handleOffset * t
        }
        previous = points
    }

    /// Avanza `dt` segundos con la punta en `tip`.
    mutating func step(tip target: Vec, dt: Double) {
        let dt = min(max(dt, 0), 1.0 / 30)
        // Mango: resorte amortiguado hacia su lugar de descanso (se queda atras y se mece).
        let rest = target + Rope.handleOffset
        let spring = (rest - handle) * 38.0 - handleVelocity * 9.0
        handleVelocity = handleVelocity + spring * dt
        handle = handle + handleVelocity * dt
        // El mango no puede quedar mas lejos que lo que da la cuerda: la punta lo arrastra.
        let reach = handle - target
        let maxReach = Rope.length * 0.94
        if reach.length > maxReach {
            handle = target + reach.normalized * maxReach
            handleVelocity = handleVelocity * 0.5
        }

        // Verlet con gravedad y algo de arrastre.
        let gravity = Vec(x: 0, y: -900)
        for i in 1..<Rope.segments {
            let velocity = (points[i] - previous[i]) * 0.985
            previous[i] = points[i]
            points[i] = points[i] + velocity + gravity * (dt * dt)
        }

        // La onda del latigazo: viaja del mango (indice alto) a la punta.
        if let age = strikeAge {
            let next = age + dt
            strikeAge = next
            if next < Rope.strikeDuration {
                let front = Double(Rope.segments) * (1 - next / Rope.strikeDuration)
                let direction = (target - handle).normalized.perpendicular
                for i in 1..<Rope.segments {
                    let distance = abs(Double(i) - front)
                    if distance < 3 {
                        let push = (1 - distance / 3) * 9.0 * strikeStrength
                        points[i] = points[i] + direction * push
                    }
                }
            }
        }

        // Extremos fijos y restricciones de largo.
        points[0] = target
        points[Rope.segments] = handle
        previous[0] = target
        previous[Rope.segments] = handle
        for _ in 0..<28 {
            for i in 0..<Rope.segments {
                let a = points[i], b = points[i + 1]
                let delta = b - a
                let distance = max(delta.length, 0.0001)
                let difference = (distance - segmentLength) / distance
                let correction = delta * (0.5 * difference)
                if i != 0 { points[i] = points[i] + correction }
                if i + 1 != Rope.segments { points[i + 1] = points[i + 1] - correction }
            }
            points[0] = target
            points[Rope.segments] = handle
        }
    }

    /// Arranca un latigazo. `strength` de 0.5 (suave) a 2 (con mucha velocidad o combo).
    mutating func strike(strength: Double) {
        strikeAge = 0
        strikeStrength = min(2, max(0.5, strength))
        // El mango da un tiron hacia atras: de ahi sale la onda.
        handleVelocity = handleVelocity + Rope.handleOffset.normalized * (420 * strikeStrength)
    }

    var isFinite: Bool { points.allSatisfy { $0.x.isFinite && $0.y.isFinite } && handle.x.isFinite && handle.y.isFinite }
}

/// Velocidad del puntero, suavizada (px/s): da la fuerza del latigazo y el sonido.
struct PointerSpeed {
    private(set) var value = 0.0
    private var last: Vec?

    mutating func update(_ point: Vec, dt: Double) {
        defer { last = point }
        guard let last, dt > 0 else { return }
        let instant = (point - last).length / dt
        value += (instant - value) * min(1, dt * 12)
    }

    /// 0 quieto, 1 un movimiento normal, ~2 un tiron rapido.
    var normalized: Double { min(2, value / 1400) }
}

// MARK: Efectos del golpe

struct Particle {
    var position: Vec
    var velocity: Vec
    var age = 0.0
    let life: Double
    let size: Double
    /// nil: punto de luz; si no, el glifo de la chispa del nivel (✦, ✧, ...).
    let glyph: String?
    let hot: Bool
}

struct Ring {
    let center: Vec
    var age = 0.0
    let life: Double
    let maxRadius: Double
}

struct Shout {
    let text: String
    let center: Vec
    var age = 0.0
    let life: Double
    let isCombo: Bool
}

struct Effects {
    private(set) var particles: [Particle] = []
    private(set) var rings: [Ring] = []
    private(set) var shouts: [Shout] = []
    private(set) var flashAge: Double?
    private(set) var flashCenter = Vec(x: 0, y: 0)
    static let maxParticles = 700

    var isIdle: Bool { particles.isEmpty && rings.isEmpty && shouts.isEmpty && flashAge == nil }

    /// El golpe en `center`: cuanto mas nivel y combo, mas chispas y mas grandes.
    mutating func burst(at center: Vec, look: Look, combo: Int, strength: Double, reducedMotion: Bool, random: inout SeededRandom) {
        flashAge = 0
        flashCenter = center
        rings.append(Ring(center: center, life: 0.42, maxRadius: 70 + 40 * strength))
        if combo >= 3 { rings.append(Ring(center: center, life: 0.6, maxRadius: 130 + 12 * Double(min(combo, 20)))) }

        let base = 14 + Int(look.sparkDensity * 90) + min(combo, 20) * 4
        let count = Int(Double(base) * (reducedMotion ? 0.35 : 1) * (0.7 + 0.3 * strength))
        for _ in 0..<count {
            let angle = random.next() * 2 * Double.pi
            let speed = 140 + random.next() * 520 * strength
            let glyph = look.sparks.isEmpty || random.next() > 0.45 ? nil : look.sparks[min(look.sparks.count - 1, Int(pow(random.next(), 1.6) * Double(look.sparks.count)))]
            particles.append(Particle(position: center, velocity: Vec(x: cos(angle) * speed, y: sin(angle) * speed + 120),
                                      life: 0.45 + random.next() * 0.7, size: 1.5 + random.next() * 3, glyph: glyph, hot: random.next() < 0.3))
        }
        if particles.count > Effects.maxParticles { particles.removeFirst(particles.count - Effects.maxParticles) }

        shouts.append(Shout(text: look.crack, center: center + Vec(x: 0, y: 34), life: 0.9, isCombo: false))
        if combo >= 2 { shouts.append(Shout(text: "x\(combo) \(Rules.comboTitle(combo))", center: center + Vec(x: 0, y: 74), life: 1.2, isCombo: true)) }
    }

    mutating func step(dt: Double) {
        for i in particles.indices {
            particles[i].age += dt
            particles[i].velocity = particles[i].velocity * pow(0.08, dt) + Vec(x: 0, y: -620) * dt
            particles[i].position = particles[i].position + particles[i].velocity * dt
        }
        particles.removeAll { $0.age >= $0.life }
        for i in rings.indices { rings[i].age += dt }
        rings.removeAll { $0.age >= $0.life }
        for i in shouts.indices { shouts[i].age += dt }
        shouts.removeAll { $0.age >= $0.life }
        if let age = flashAge { flashAge = age + dt < 0.12 ? age + dt : nil }
    }
}

/// Aleatorio con semilla (para pruebas reproducibles); en la app se siembra con la hora.
struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E3779B97F4A7C15 : seed }
    /// En [0, 1).
    mutating func next() -> Double {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return Double(state >> 11) / Double(UInt64(1) << 53)
    }
}
