// La fisica del latigo en pantalla, sin AppKit para poder probarla.
//
// El puntero es la mano y sostiene el mango por el pomo. La cuerda sale del mango,
// cuelga con gravedad y se mece con el movimiento; arrastrada rapido, sigue el
// camino del mango (en linea recta, en curva o en zigzag). Es una cuerda de puntos
// (Verlet con restricciones de largo), mas rigida cerca del mango.
//
// El latigazo es un bucle que rueda, como en un latigo de verdad: la muñeca apunta
// el mango hacia donde se lanza, la cuerda se tiende y un bucle sale del mango y
// corre hacia la punta cada vez mas rapido (la cuerda se afina). Cuando llega, la
// punta da la vuelta y revienta lejos de la mano, hacia donde se lanzo.
//
// Coordenadas de pantalla de Cocoa: y crece hacia arriba.

import Foundation

struct Vec: Equatable {
    var x: Double, y: Double
    static let zero = Vec(x: 0, y: 0)
    static func + (a: Vec, b: Vec) -> Vec { Vec(x: a.x + b.x, y: a.y + b.y) }
    static func - (a: Vec, b: Vec) -> Vec { Vec(x: a.x - b.x, y: a.y - b.y) }
    static func * (a: Vec, k: Double) -> Vec { Vec(x: a.x * k, y: a.y * k) }
    var length: Double { (x * x + y * y).squareRoot() }
    var normalized: Vec { let l = length; return l > 0 ? Vec(x: x / l, y: y / l) : .zero }
    /// Girado 90° en sentido antihorario.
    var perpendicular: Vec { Vec(x: -y, y: x) }
    func dot(_ other: Vec) -> Double { x * other.x + y * other.y }
    func cross(_ other: Vec) -> Double { x * other.y - y * other.x }
    var isFinite: Bool { x.isFinite && y.isFinite }
}

func smoothstep(_ t: Double) -> Double {
    let k = min(1, max(0, t))
    return k * k * (3 - 2 * k)
}

// MARK: Como se movio el mouse

enum MotionKind: String { case still, straight, turn, zigzag }

struct MotionFeatures: Equatable {
    /// 0 quieto · 1 normal (~1400 px/s) · 2 tiron rapido.
    var speed = 0.0
    /// Radianes girados en el ultimo rato (positivo: antihorario).
    var turn = 0.0
    /// Veces que el movimiento cambio de sentido.
    var reversals = 0
    /// Hacia donde iba al final (unitario; cero si estaba quieto).
    var heading = Vec.zero
    var kind = MotionKind.still
}

/// Mira el recorrido del puntero en el ultimo rato y lo resume.
struct MotionTracker {
    static let window = 0.4
    private var samples: [(time: Double, point: Vec)] = []

    mutating func add(_ point: Vec, time: Double) {
        if let last = samples.last, time < last.time { samples.removeAll() }
        samples.append((time, point))
        samples.removeAll { time - $0.time > MotionTracker.window }
    }

    func features(now: Double) -> MotionFeatures {
        let recent = samples.filter { now - $0.time <= MotionTracker.window && $0.time <= now }
        guard recent.count >= 2 else { return MotionFeatures() }

        let fresh = recent.filter { now - $0.time <= 0.12 }
        var speed = 0.0
        if fresh.count >= 2 {
            var distance = 0.0
            for i in 1..<fresh.count { distance += (fresh[i].point - fresh[i - 1].point).length }
            speed = min(2, distance / max(fresh[fresh.count - 1].time - fresh[0].time, 1.0 / 120) / 1400)
        }

        // Rumbos por tramos de al menos 6 px, para que el temblor de la mano no cuente.
        var directions: [Vec] = []
        var path = 0.0
        var anchor = recent[0].point
        for sample in recent.dropFirst() {
            let step = sample.point - anchor
            if step.length >= 6 {
                directions.append(step.normalized)
                path += step.length
                anchor = sample.point
            }
        }
        var turn = 0.0, reversals = 0, lastSign = 0.0
        for i in directions.indices.dropFirst() {
            let a = directions[i - 1], b = directions[i]
            if a.dot(b) < -0.3 {
                // Ida y vuelta: una sacudida.
                reversals += 1
                lastSign = 0
                continue
            }
            let angle = atan2(a.cross(b), a.dot(b))
            turn += angle
            if abs(angle) > 0.35 {
                let sign: Double = angle > 0 ? 1 : -1
                if lastSign != 0 && sign != lastSign { reversals += 1 }
                lastSign = sign
            }
        }

        let kind: MotionKind
        if path < 40 && speed < 0.06 { kind = .still }
        else if reversals >= 2 { kind = .zigzag }
        else if abs(turn) > 1.2 { kind = .turn }
        else { kind = .straight }
        return MotionFeatures(speed: speed, turn: turn, reversals: reversals, heading: directions.last ?? .zero, kind: kind)
    }
}

// MARK: El plan de un latigazo

/// Los bordes de una pantalla (coordenadas de Cocoa).
struct Bounds: Equatable {
    var minX: Double, maxX: Double, minY: Double, maxY: Double

    func contains(_ point: Vec, margin: Double) -> Bool {
        point.x >= minX + margin && point.x <= maxX - margin && point.y >= minY + margin && point.y <= maxY - margin
    }

    /// Cabe el golpe entero: el destello a los lados y abajo, y arriba el grito y la insignia.
    func fitsCrack(_ point: Vec) -> Bool {
        contains(point, margin: 40) && point.y <= maxY - 130
    }
}

struct LashPlan {
    /// Hacia donde se lanza (unitario).
    var direction: Vec
    /// Segundos del clic al golpe.
    var duration: Double
    /// +1 o -1: de que lado de la cuerda se forma el bucle.
    var side: Double
    /// Radio del bucle al salir del mango (px); se achica hacia la punta.
    var loopRadius: Double
    /// Que tanto se estira la cuerda (fraccion del largo): menos, mas curva y mas cerca.
    var reach: Double
    /// Ondulacion de la cuerda (zigzag), en px.
    var ripple: Double
    /// Un segundo bucle detras del primero (zigzag): segundos despues del golpe.
    var echoDelay: Double?
    /// 0,6 a 2: el tamaño del golpe.
    var strength: Double

    static let shortest = 0.14
    static let longest = 0.36

    /// Lo que tarda el latigazo segun como se mueve el mouse: un tiron rapido truena antes.
    static func motionDuration(_ motion: MotionFeatures) -> Double {
        let raw: Double
        switch motion.kind {
        case .still: raw = 0.26
        case .straight: raw = 0.3 - 0.08 * motion.speed
        case .turn: raw = 0.26 - 0.05 * motion.speed
        case .zigzag: raw = 0.24 - 0.05 * motion.speed
        }
        return min(longest, max(shortest, raw))
    }

    /// Donde revienta la punta si la mano esta en `hand` (el mango ya apuntando al lanzamiento).
    func crackPoint(hand: Vec) -> Vec {
        hand + direction * (Rope.stockLength + reach * Rope.length)
    }

    func withDirection(_ newDirection: Vec) -> LashPlan {
        var copy = self
        copy.direction = newDirection
        return copy
    }

    /// El latigazo que sale de ese movimiento. Se lanza hacia donde iba el mouse o, quieto,
    /// hacia donde apunta el mango; con giro la cuerda se curva hacia el giro y en zigzag
    /// ondula y truena dos veces. Si el golpe cayera fuera de la pantalla, sale hacia el otro lado.
    static func make(motion: MotionFeatures, hand: Vec, handleDirection: Vec, screen: Bounds?, duration: Double, combo: Int, random: inout SeededRandom) -> LashPlan {
        let speed = min(2, max(0, motion.speed))
        var direction = handleDirection.length > 1e-6 ? handleDirection.normalized : Vec(x: 0.44, y: 0.9).normalized
        if motion.kind != .still && motion.heading != .zero && speed > 0.25 { direction = motion.heading }
        var plan = LashPlan(direction: direction, duration: duration, side: 1, loopRadius: 40, reach: 0.84, ripple: 0, echoDelay: nil,
                            strength: 0.75 + 0.45 * speed + min(0.4, 0.04 * Double(combo)))
        switch motion.kind {
        case .still:
            break
        case .straight:
            plan.reach = 0.9
            plan.loopRadius = 30 + 10 * speed
        case .turn:
            plan.reach = 0.74
            plan.loopRadius = 42 + 8 * speed
            // Se adelanta un poco hacia donde giraba.
            let lead = motion.turn > 0 ? 0.35 : -0.35
            plan.direction = Vec(x: direction.x * cos(lead) - direction.y * sin(lead), y: direction.x * sin(lead) + direction.y * cos(lead))
        case .zigzag:
            plan.reach = 0.86
            plan.loopRadius = 30 + 6 * speed
            plan.ripple = 12 + 8 * speed
            plan.echoDelay = 0.03
        }
        if let screen {
            // Primero tal cual o en espejo; si no cabe, cada vez mas acostado.
            let wanted = plan.direction
            let flips = [Vec(x: 1, y: 1), Vec(x: -1, y: 1), Vec(x: 1, y: -1), Vec(x: -1, y: -1)]
            var candidates: [Vec] = []
            for flatten in [1.0, 0.6, 0.3, 0.0] {
                for flip in flips {
                    let x = wanted.x == 0 && flatten == 0 ? 1.0 : wanted.x
                    candidates.append(Vec(x: x * flip.x, y: wanted.y * flip.y * flatten).normalized)
                }
            }
            plan.direction = candidates.first { screen.fitsCrack(plan.withDirection($0).crackPoint(hand: hand)) } ?? wanted
        }
        // El bucle va por encima de la cuerda (como un latigazo por arriba); con giro, del lado del giro.
        plan.side = plan.direction.perpendicular.y >= 0 ? 1 : -1
        if motion.kind == .turn { plan.side = motion.turn > 0 ? 1 : -1 }
        if motion.kind == .zigzag { plan.side = random.next() < 0.5 ? 1 : -1 }
        return plan
    }
}

/// Hacia que lado apunta el mango: el del ultimo movimiento, y nunca contra el borde
/// de la pantalla (asi la cuerda y el golpe quedan a la vista). +1 derecha, -1 izquierda.
func chooseHandleSide(current: Double, motion: MotionFeatures, hand: Vec, screen: Bounds?) -> Double {
    var side = current
    if motion.speed > 0.15 && abs(motion.heading.x) > 0.35 { side = motion.heading.x > 0 ? 1 : -1 }
    if let screen {
        let room = Rope.length * 0.5
        if hand.x - screen.minX < room { side = 1 } else if screen.maxX - hand.x < room { side = -1 }
    }
    return side
}

/// El golpe: donde, hacia donde iba la punta y el camino que hizo al dar la vuelta.
struct Crack: Equatable {
    let at: Vec
    let direction: Vec
    let streak: [Vec]
    /// El segundo chasquido del zigzag.
    let isEcho: Bool
}

// MARK: La cuerda

struct Rope {
    static let segments = 40
    static let length = 330.0
    /// El mango rigido, del pomo (en la mano) a donde nace la cuerda.
    static let stockLength = 66.0
    static var segmentLength: Double { length / Double(segments) }

    /// 0 = punta (libre) … `segments` = raiz, donde la cuerda sale del mango.
    private(set) var points: [Vec]
    private var previous: [Vec]
    /// La mano: el puntero, en el pomo del mango.
    private(set) var hand: Vec
    /// Hacia donde apunta el mango desde la mano (unitario).
    private(set) var handleDirection: Vec
    private(set) var lash: LashState?
    /// Las ultimas posiciones durante el latigazo: se dibujan como estela.
    private(set) var ghosts: [[Vec]] = []
    private var ghostTime = 0.0
    /// +1: el mango apunta arriba a la derecha; -1: arriba a la izquierda.
    private(set) var side = 1.0
    private var handVelocity = Vec.zero
    private var quietFrames = 0
    /// Tras soltar el latigazo, la cuerda se frena un poco mas para que el rebote no tiemble.
    private var calmTime = 0.0
    /// El camino reciente de la raiz (el mas nuevo primero): arrastrada rapido, la cuerda lo sigue.
    private var trail: [(point: Vec, time: Double)] = []
    private var clock = 0.0

    var tip: Vec { points[0] }
    var root: Vec { points[Rope.segments] }
    var isLashing: Bool { lash != nil }
    /// Nada se mueve: no hace falta volver a dibujar.
    var isSettled: Bool { lash == nil && ghosts.isEmpty && quietFrames > 45 }
    var isFinite: Bool { points.allSatisfy(\.isFinite) && previous.allSatisfy(\.isFinite) && hand.isFinite }

    /// Hacia donde apunta el mango en reposo: arriba, un poco hacia el lado.
    static func restHandle(side: Double) -> Vec { Vec(x: 0.44 * (side >= 0 ? 1 : -1), y: 0.9).normalized }

    init(hand: Vec, side: Double = 1) {
        self.hand = hand
        self.side = side >= 0 ? 1 : -1
        handleDirection = Rope.restHandle(side: side)
        let root = hand + handleDirection * Rope.stockLength
        // Cuelga derecha desde la raiz; la fisica la acomoda en un instante.
        points = (0...Rope.segments).map { i in root - Vec(x: 0, y: Double(Rope.segments - i) * Rope.segmentLength) }
        previous = points
    }

    // MARK: Paso

    /// Avanza `dt` segundos con la mano en `pointer`. Devuelve los golpes que hubo.
    @discardableResult
    mutating func step(pointer: Vec, dt rawDt: Double, side newSide: Double = 1) -> [Crack] {
        let dt = min(max(rawDt.isFinite ? rawDt : 0, 0), 0.1)
        guard pointer.isFinite else { return [] }
        if dt > 0 {
            let velocity = (pointer - hand) * (1 / dt)
            if velocity.isFinite { handVelocity = handVelocity + (velocity - handVelocity) * min(1, dt * 14) }
        }
        hand = pointer
        side = newSide >= 0 ? 1 : -1
        if lash != nil { return stepLash(dt: dt) }

        // La muñeca: el mango apunta arriba y se inclina contra el movimiento.
        let tilt = min(0.55, max(-0.55, handVelocity.x / 2500))
        let rest = Rope.restHandle(side: side)
        let target = Vec(x: rest.x * cos(tilt) - rest.y * sin(tilt), y: rest.x * sin(tilt) + rest.y * cos(tilt))
        let turned = handleDirection + (target - handleDirection) * (1 - exp(-dt / 0.1))
        handleDirection = turned.length > 1e-6 ? turned.normalized : target
        let root = hand + handleDirection * Rope.stockLength

        // Un salto enorme (otra pantalla) o algo roto: el latigo aparece ahi, colgando.
        if (root - points[Rope.segments]).length > Rope.length * 2.5 || !isFinite {
            self = Rope(hand: pointer, side: side)
            return []
        }

        let n = Rope.segments
        let simDt = min(dt, 1.0 / 30)
        let damping = pow(calmTime > 0 ? 0.9 : 0.965, simDt * 60)
        calmTime = max(0, calmTime - dt)
        clock += dt
        remember(root)
        let gravity = Vec(x: 0, y: -1500 * simDt * simDt)
        let before = points
        for i in 0..<n {
            let velocity = (points[i] - previous[i]) * damping
            previous[i] = points[i]
            points[i] = points[i] + velocity + gravity
        }
        followTrail(strength: 1 - pow(1 - 0.3, simDt * 60))
        // La cuerda sale del mango en su misma direccion y despues cae.
        for k in 1...3 {
            let want = root + handleDirection * (Rope.segmentLength * Double(k))
            points[n - k] = points[n - k] + (want - points[n - k]) * (0.6 / Double(k))
        }
        points[n] = root
        previous[n] = root
        solveConstraints()

        if !ghosts.isEmpty {
            ghostTime -= dt
            if ghostTime <= 0 { ghosts.removeAll() } else { rememberShape() }
        }
        let moved = zip(before, points).map { ($0 - $1).length }.max() ?? 0
        quietFrames = moved < 0.03 ? quietFrames + 1 : 0
        return []
    }

    /// Largo entre puntos y rigidez (mas cerca del mango), con la raiz fija.
    private mutating func solveConstraints() {
        let n = Rope.segments
        let segment = Rope.segmentLength
        let pinned = points[n]
        for iteration in 0..<24 {
            for i in stride(from: n - 1, through: 0, by: -1) {
                let a = points[i + 1], b = points[i]
                let delta = b - a
                let distance = max(delta.length, 0.0001)
                let difference = (distance - segment) / distance
                if i + 1 == n {
                    points[i] = b - delta * difference
                } else {
                    let correction = delta * (0.5 * difference)
                    points[i + 1] = a + correction
                    points[i] = b - correction
                }
            }
            if iteration % 2 == 0 {
                // Sin quiebres: cada punto se separa del de dos mas alla si se dobla demasiado.
                for i in 0..<(n - 1) {
                    let stiffness = 0.04 + 0.4 * pow(Double(i + 1) / Double(n), 1.5)
                    let a = points[i], c = points[i + 2]
                    let delta = c - a
                    let distance = max(delta.length, 0.0001)
                    let rest = segment * 1.96
                    guard distance < rest else { continue }
                    let correction = delta * ((distance - rest) / distance * 0.5 * stiffness)
                    points[i] = a + correction
                    if i + 2 != n { points[i + 2] = c - correction }
                }
            }
            points[n] = pinned
        }
        // La cuerda no se estira: cada punto sigue al anterior desde el mango. La
        // correccion no se vuelve velocidad (si no, la cuerda nunca se queda quieta).
        for i in stride(from: n - 1, through: 0, by: -1) {
            let delta = points[i] - points[i + 1]
            let distance = delta.length
            guard distance > segment else { continue }
            let corrected = points[i + 1] + delta * (segment / distance)
            previous[i] = previous[i] + (corrected - points[i])
            points[i] = corrected
        }
    }

    private mutating func rememberShape() {
        ghosts.append(points)
        if ghosts.count > 5 { ghosts.removeFirst(ghosts.count - 5) }
    }

    /// Anota por donde paso la raiz (hasta un largo de cuerda y un segundo atras).
    private mutating func remember(_ root: Vec) {
        if let newest = trail.first, (newest.point - root).length < 1.5 { return }
        trail.insert((root, clock), at: 0)
        var length = 0.0
        for i in 1..<trail.count {
            length += (trail[i].point - trail[i - 1].point).length
            if length > Rope.length * 1.05 || clock - trail[i].time > 1 {
                trail.removeSubrange(i...)
                break
            }
        }
    }

    /// Cada punto se acerca a donde estuvo la raiz a su misma distancia de cuerda:
    /// fuerte si paso hace un instante, nada si ya hace rato.
    private mutating func followTrail(strength: Double) {
        guard trail.count >= 2 else { return }
        var walked = 0.0
        var k = 1
        for distance in 1...Rope.segments {
            let i = Rope.segments - distance
            let wanted = Double(distance) * Rope.segmentLength
            while k < trail.count && walked + (trail[k].point - trail[k - 1].point).length < wanted {
                walked += (trail[k].point - trail[k - 1].point).length
                k += 1
            }
            guard k < trail.count else { return }
            let span = max((trail[k].point - trail[k - 1].point).length, 1e-9)
            let t = (wanted - walked) / span
            let point = trail[k - 1].point + (trail[k].point - trail[k - 1].point) * t
            let time = trail[k - 1].time + (trail[k].time - trail[k - 1].time) * t
            let weight = strength * exp(-(clock - time) / 0.25)
            if weight > 0.002 { points[i] = points[i] + (point - points[i]) * weight }
        }
    }

    // MARK: Latigazo

    /// Arranca un latigazo. Si habia otro a medias, ese revienta ya (se devuelve su golpe).
    @discardableResult
    mutating func startLash(_ plan: LashPlan) -> Crack? {
        var interrupted: Crack?
        if let current = lash, !current.cracked {
            interrupted = Crack(at: current.crackPoint(hand: hand), direction: current.plan.direction, streak: [], isEcho: false)
        }
        guard plan.direction.isFinite, plan.direction != .zero, plan.duration.isFinite else { return interrupted }
        var plan = plan
        plan.direction = plan.direction.normalized
        plan.duration = min(LashPlan.longest, max(0.05, plan.duration))
        lash = LashState(plan: plan, start: points, handle: handleDirection)
        trail.removeAll()
        quietFrames = 0
        return interrupted
    }

    private mutating func stepLash(dt: Double) -> [Crack] {
        guard var state = lash else { return [] }
        var cracks: [Crack] = []
        let duration = state.plan.duration
        let end = duration + (state.plan.echoDelay ?? 0)
        state.time = min(state.time + dt, end)

        let shape = state.shape(at: state.time, hand: hand)
        handleDirection = state.handleDirection(at: state.time / duration)
        if !state.cracked && state.time >= duration {
            state.cracked = true
            let streak = (0...8).map { k in state.shape(at: max(0, duration - 0.05 + 0.05 * Double(k) / 8), hand: hand)[0] }
            let last = streak[streak.count - 1] - streak[streak.count - 3]
            cracks.append(Crack(at: state.crackPoint(hand: hand), direction: last.length > 0.5 ? last.normalized : state.plan.direction, streak: streak, isEcho: false))
        }
        if let echo = state.plan.echoDelay, !state.echoed, state.time >= duration + echo {
            state.echoed = true
            cracks.append(Crack(at: state.crackPoint(hand: hand), direction: state.plan.direction, streak: [], isEcho: true))
        }

        previous = points
        points = shape
        rememberShape()
        if state.time >= end {
            // Suelta la cuerda a la fisica con la velocidad que traia: el rebote sale solo.
            lash = nil
            ghostTime = 0.12
            calmTime = 0.3
        } else {
            lash = state
        }
        return cracks
    }

    // MARK: Geometria

    static func measure(_ path: [Vec]) -> Double {
        zip(path, path.dropFirst()).reduce(0) { $0 + ($1.1 - $1.0).length }
    }

    /// `count + 1` puntos a la misma distancia a lo largo de `path`.
    static func resample(_ path: [Vec], count: Int) -> [Vec] {
        guard path.count >= 2 else { return Array(repeating: path.first ?? .zero, count: count + 1) }
        var cumulative = [0.0]
        for i in 1..<path.count { cumulative.append(cumulative[i - 1] + (path[i] - path[i - 1]).length) }
        let total = cumulative[cumulative.count - 1]
        var result: [Vec] = []
        var j = 1
        for k in 0...count {
            let wanted = total * Double(k) / Double(count)
            while j < path.count - 1 && cumulative[j] < wanted { j += 1 }
            let span = max(cumulative[j] - cumulative[j - 1], 1e-9)
            let t = min(1, max(0, (wanted - cumulative[j - 1]) / span))
            result.append(path[j - 1] + (path[j] - path[j - 1]) * t)
        }
        return result
    }

    /// Una curva de `a` a `b` que mide `length` (o lo mas cerca posible), arqueada hacia `side`.
    static func throwLine(from a: Vec, to b: Vec, length: Double, side: Double, count: Int) -> [Vec] {
        let chord = b - a
        let normal = (chord.length > 1e-6 ? chord.normalized : Vec(x: 1, y: 0)).perpendicular * (side >= 0 ? 1 : -1)
        let middle = (a + b) * 0.5
        func curve(_ height: Double, samples: Int) -> [Vec] {
            let control = middle + normal * height
            return (0...samples).map { k in
                let t = Double(k) / Double(samples)
                return a * ((1 - t) * (1 - t)) + control * (2 * (1 - t) * t) + b * (t * t)
            }
        }
        var height = 0.0
        if chord.length < length {
            var low = 0.0, high = length * 0.6
            for _ in 0..<24 {
                let mid = (low + high) / 2
                if measure(curve(mid, samples: 40)) < length { low = mid } else { high = mid }
            }
            height = (low + high) / 2
        }
        return resample(curve(height, samples: 120), count: count)
    }
}

/// Un latigazo en curso.
struct LashState {
    let plan: LashPlan
    /// La cuerda en el momento del clic, relativa a su raiz: asi sigue a la mano si se mueve.
    let start: [Vec]
    /// Hacia donde apuntaba el mango al dar el clic.
    let startHandle: Vec
    var time = 0.0
    var cracked = false
    var echoed = false

    init(plan: LashPlan, start points: [Vec], handle: Vec) {
        self.plan = plan
        let root = points[points.count - 1]
        start = points.map { $0 - root }
        startHandle = handle
    }

    /// La muñeca apunta el mango hacia el lanzamiento en el primer tercio del latigazo.
    func handleDirection(at progress: Double) -> Vec {
        let aim = 1 - pow(1 - min(1, max(0, progress) / 0.35), 3)
        let blended = startHandle * (1 - aim) + plan.direction * aim
        return blended.length > 1e-6 ? blended.normalized : plan.direction
    }

    /// Donde revienta la punta con la mano en `hand`.
    func crackPoint(hand: Vec) -> Vec { plan.crackPoint(hand: hand) }

    /// La cuerda a los `t` segundos del clic con la mano en `hand`: tendida hacia el
    /// lanzamiento, con el bucle rodando hacia la punta.
    func shape(at t: Double, hand: Vec) -> [Vec] {
        let n = Rope.segments
        let progress = t / plan.duration

        // 1. El mango apunta al lanzamiento y la muñeca da un golpe hacia adelante.
        let root = hand + handleDirection(at: progress) * Rope.stockLength
        let flick = sin(Double.pi * min(1, max(0, (progress - 0.3) / 0.35))) * 10 * plan.strength
        let rootNow = root + plan.direction * flick

        // 2. La cuerda pasa de como estaba a tendida hacia donde va a reventar.
        let target = root + plan.direction * (plan.reach * Rope.length)
        let line = Rope.throwLine(from: target, to: rootNow, length: Rope.length, side: -plan.side, count: n)
        let blend = smoothstep(progress / 0.45)
        var base = (0...n).map { i -> Vec in
            let before = rootNow + start[i]
            return before + (line[i] - before) * blend
        }

        // 3. El zigzag la hace ondular mientras el bucle corre.
        if plan.ripple > 0 {
            let amplitude = plan.ripple * smoothstep(progress / 0.25) * (1 - smoothstep((progress - 0.55) / 0.45))
            let normal = plan.direction.perpendicular
            for i in 1..<n {
                let s = Double(i) / Double(n)
                base[i] = base[i] + normal * (amplitude * sin(2 * Double.pi * 3 * s) * sin(Double.pi * s))
            }
        }

        // 4. El bucle (y el segundo, en el zigzag).
        var result = base
        addLoop(to: &result, base: base, progress: progress, scale: 1)
        if let echo = plan.echoDelay {
            addLoop(to: &result, base: base, progress: (t - echo) / plan.duration, scale: 0.6)
        }
        return result
    }

    /// El medio ancho del bucle (a lo largo de la cuerda) en la punta y en el mango.
    static let tipHalf = 0.09 * Rope.length
    static let handleHalf = 0.16 * Rope.length

    /// Donde va el centro del bucle, medido desde la punta: entra por el mango y, cada
    /// vez mas rapido, sale por la punta justo en `progress` = 1.
    static func loopCenter(progress: Double) -> Double {
        let travel = Rope.length + handleHalf + tipHalf
        return Rope.length + handleHalf - travel * pow(min(max(progress, 0), 1.2), 1.5)
    }

    /// Un bucle que sale del mango y llega a la punta justo en `progress` = 1, acelerando.
    private func addLoop(to result: inout [Vec], base: [Vec], progress: Double, scale: Double) {
        guard progress > 0 else { return }
        let n = Rope.segments
        let length = Rope.length
        let center = LashState.loopCenter(progress: progress)
        let grow = smoothstep(progress / 0.12)
        for i in 0...n {
            let s = Double(i) * Rope.segmentLength
            let along = s / length
            let half = LashState.tipHalf + (LashState.handleHalf - LashState.tipHalf) * along
            let v = (s - center) / half
            guard abs(v) < 1 else { continue }
            let radius = plan.loopRadius * scale * (0.55 + 0.45 * along) * grow
            let angle = Double.pi * (1 - v)
            let tangent = (base[min(i + 1, n)] - base[max(i - 1, 0)]).normalized
            var normal = tangent.perpendicular
            if normal.dot(plan.direction.perpendicular) * plan.side < 0 { normal = normal * -1 }
            // Un rizo de verdad: la cuerda sube, se cruza hacia atras y baja.
            result[i] = result[i] + normal * (radius * (1 - cos(angle))) - tangent * (radius * 1.3 * sin(angle))
        }
    }
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

/// El camino de la punta al dar la vuelta: una raya de luz que se apaga enseguida.
struct Streak {
    let points: [Vec]
    var age = 0.0
    let life = 0.16
}

/// La onda de choque de la punta: una V que se abre hacia atras.
struct MachCone {
    let tip: Vec
    let direction: Vec
    let size: Double
    var age = 0.0
    let life = 0.14
}

/// "effort ▲ high" sobre el golpe (encima de los gritos).
struct Badge {
    let text: String
    let isMuted: Bool
    let center: Vec
    /// Cuanto mas arriba del golpe: sobre el ¡CHAS! o sobre el combo.
    let lift: Double
    var age = 0.0
    let life = 1.6
}

/// El aviso de prendido o apagado.
struct Hud {
    let title: String
    let subtitle: String
    let anchor: Vec
    var age = 0.0
    let life = 2.0
}

struct Effects {
    private(set) var particles: [Particle] = []
    private(set) var rings: [Ring] = []
    private(set) var shouts: [Shout] = []
    private(set) var streaks: [Streak] = []
    private(set) var cones: [MachCone] = []
    private(set) var badges: [Badge] = []
    private(set) var hud: Hud?
    private(set) var flashAge: Double?
    private(set) var flashCenter = Vec.zero
    static let maxParticles = 700

    var isIdle: Bool {
        particles.isEmpty && rings.isEmpty && shouts.isEmpty && streaks.isEmpty && cones.isEmpty && badges.isEmpty && hud == nil && flashAge == nil
    }

    /// El golpe: cuanto mas nivel y combo, mas chispas y mas grandes. El eco del zigzag es mas chico.
    mutating func crack(_ crack: Crack, look: Look, combo: Int, strength: Double, reducedMotion: Bool, random: inout SeededRandom) {
        let center = crack.at
        let power = crack.isEcho ? strength * 0.45 : strength
        flashAge = 0
        flashCenter = center
        rings.append(Ring(center: center, life: 0.42, maxRadius: 60 + 40 * power))
        if !crack.isEcho && combo >= 3 { rings.append(Ring(center: center, life: 0.6, maxRadius: 130 + 12 * Double(min(combo, 20)))) }
        if !reducedMotion {
            if crack.streak.count >= 2 { streaks.append(Streak(points: crack.streak)) }
            if crack.direction != .zero { cones.append(MachCone(tip: center, direction: crack.direction, size: 36 + 26 * power)) }
        }

        let base = 14 + Int(look.sparkDensity * 90) + min(combo, 20) * 4
        let count = Int(Double(base) * (reducedMotion ? 0.35 : 1) * (0.7 + 0.3 * power) * (crack.isEcho ? 0.4 : 1))
        for _ in 0..<count {
            let angle = random.next() * 2 * Double.pi
            let speed = 140 + random.next() * 520 * power
            let glyph = look.sparks.isEmpty || random.next() > 0.45 ? nil : look.sparks[min(look.sparks.count - 1, Int(pow(random.next(), 1.6) * Double(look.sparks.count)))]
            particles.append(Particle(position: center, velocity: Vec(x: cos(angle) * speed, y: sin(angle) * speed + 120),
                                      life: 0.45 + random.next() * 0.7, size: 1.5 + random.next() * 3, glyph: glyph, hot: random.next() < 0.3))
        }
        if particles.count > Effects.maxParticles { particles.removeFirst(particles.count - Effects.maxParticles) }

        guard !crack.isEcho else { return }
        shouts.append(Shout(text: look.crack, center: center + Vec(x: 0, y: 34), life: 0.9, isCombo: false))
        if combo >= 2 { shouts.append(Shout(text: "x\(combo) \(Rules.comboTitle(combo))", center: center + Vec(x: 0, y: 74), life: 1.2, isCombo: true)) }
    }

    mutating func badge(_ text: String, isMuted: Bool, at center: Vec, combo: Int) {
        badges.removeAll()
        badges.append(Badge(text: text, isMuted: isMuted, center: center, lift: combo >= 2 ? 112 : 72))
    }

    mutating func showHud(title: String, subtitle: String, at anchor: Vec) {
        hud = Hud(title: title, subtitle: subtitle, anchor: anchor)
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
        for i in streaks.indices { streaks[i].age += dt }
        streaks.removeAll { $0.age >= $0.life }
        for i in cones.indices { cones[i].age += dt }
        cones.removeAll { $0.age >= $0.life }
        for i in badges.indices { badges[i].age += dt }
        badges.removeAll { $0.age >= $0.life }
        if var current = hud {
            current.age += dt
            hud = current.age >= current.life ? nil : current
        }
        if let age = flashAge { flashAge = age + dt < 0.12 ? age + dt : nil }
    }
}

/// Aleatorio con semilla (para pruebas reproducibles); en la app se siembra con la hora.
struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed }
    /// En [0, 1).
    mutating func next() -> Double {
        state ^= state << 13
        state ^= state >> 7
        state ^= state << 17
        return Double(state >> 11) / Double(UInt64(1) << 53)
    }
}
