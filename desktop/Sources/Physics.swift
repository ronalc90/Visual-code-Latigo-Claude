// La fisica del latigo en pantalla, sin AppKit para poder probarla.
//
// En reposo la punta va en el puntero y el resto de la cuerda la sigue por el mismo
// camino: en linea recta, en curva o en zigzag, la cuerda dibuja lo que hiciste con
// el mouse. Quieta, se acomoda como un latigo en la mano. Es una cuerda de puntos
// (Verlet con restricciones de largo), mas rigida hacia el mango.
//
// El latigazo es un bucle que rueda, como en un latigo de verdad: la mano tira
// hacia atras, la cuerda se tiende hacia el clic y un bucle sale del mango y corre
// hacia la punta cada vez mas rapido (la cuerda se afina). Cuando el bucle llega a
// la punta, la punta da la vuelta y revienta justo donde se dio el clic.
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

struct LashPlan {
    /// Donde se dio el clic: ahi revienta.
    var target: Vec
    /// Segundos del clic al golpe.
    var duration: Double
    /// +1 o -1: de que lado de la cuerda se forma el bucle.
    var side: Double
    /// Radio del bucle al salir del mango (px); se achica hacia la punta.
    var loopRadius: Double
    /// Que tanto se estira la cuerda hacia el clic (fraccion del largo): menos, mas curva.
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

    /// El latigazo que sale de ese movimiento: recto, con giro (la cuerda se curva hacia
    /// el giro) o en zigzag (ondula y truena dos veces).
    static func make(motion: MotionFeatures, target: Vec, handle: Vec, duration: Double, combo: Int, random: inout SeededRandom) -> LashPlan {
        let toTarget = target - handle
        let throwDirection = toTarget.length > 1 ? toTarget.normalized : Vec(x: -0.8, y: 0.6)
        // Por defecto el bucle va por encima de la cuerda, como en un latigazo por arriba.
        let above: Double = throwDirection.perpendicular.y >= 0 ? 1 : -1
        let speed = min(2, max(0, motion.speed))
        var plan = LashPlan(target: target, duration: duration, side: above, loopRadius: 40, reach: 0.84, ripple: 0, echoDelay: nil,
                            strength: 0.75 + 0.45 * speed + min(0.4, 0.04 * Double(combo)))
        switch motion.kind {
        case .still:
            break
        case .straight:
            plan.reach = 0.9
            plan.loopRadius = 30 + 10 * speed
            if motion.heading != .zero { plan.side = motion.heading.cross(throwDirection) >= 0 ? -1 : 1 }
        case .turn:
            plan.reach = 0.74
            plan.loopRadius = 42 + 8 * speed
            plan.side = motion.turn > 0 ? 1 : -1
        case .zigzag:
            plan.reach = 0.86
            plan.loopRadius = 30 + 6 * speed
            plan.ripple = 12 + 8 * speed
            plan.echoDelay = 0.03
            plan.side = random.next() < 0.5 ? 1 : -1
        }
        return plan
    }
}

/// De que lado descansa la mano: detras del movimiento (la cuerda se arrastra detras
/// de la punta) y nunca contra el borde de la pantalla (`screen`: su minX y maxX).
func chooseRestSide(current: Double, motion: MotionFeatures, pointer: Vec, screen: (minX: Double, maxX: Double)?) -> Double {
    var side = current
    if motion.speed > 0.15 && abs(motion.heading.x) > 0.35 { side = motion.heading.x > 0 ? -1 : 1 }
    if let screen {
        let room = Rope.length * 0.55
        if pointer.x - screen.minX < room { side = 1 } else if screen.maxX - pointer.x < room { side = -1 }
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
    static var segmentLength: Double { length / Double(segments) }

    private(set) var points: [Vec]
    private var previous: [Vec]
    private(set) var lash: LashState?
    /// Las ultimas posiciones durante el latigazo: se dibujan como estela.
    private(set) var ghosts: [[Vec]] = []
    private var ghostTime = 0.0
    /// Tras el golpe, la punta vuelve del clic al puntero.
    private var returning: (from: Vec, age: Double)?
    /// Hacia que lado descansa la mano: +1 abajo a la derecha, -1 abajo a la izquierda.
    private(set) var restSide = 1.0
    private var quietFrames = 0
    /// Tras soltar el latigazo, la cuerda se frena un poco mas para que el rebote no tiemble.
    private var calmTime = 0.0
    /// El camino reciente de la punta (el mas nuevo primero): la cuerda lo sigue.
    private var trail: [(point: Vec, time: Double)] = []
    private var clock = 0.0

    var tip: Vec { points[0] }
    var handle: Vec { points[Rope.segments] }
    var isLashing: Bool { lash != nil }
    /// Nada se mueve: no hace falta volver a dibujar.
    var isSettled: Bool { lash == nil && ghosts.isEmpty && returning == nil && quietFrames > 45 }
    var isFinite: Bool { points.allSatisfy(\.isFinite) && previous.allSatisfy(\.isFinite) }

    init(at tip: Vec, restSide: Double = 1) {
        self.restSide = restSide
        points = Rope.restShape.map { tip + Vec(x: $0.x * restSide, y: $0.y) }
        previous = points
    }

    /// La forma en la mano, como desplazamientos desde la punta: la cuerda baja hacia
    /// la mano (abajo a la derecha) haciendo una S suave, con el largo exacto.
    static let restShape: [Vec] = {
        let hand = Vec(x: 0.6 * length, y: -0.5 * length)
        let normal = hand.normalized.perpendicular
        func curve(_ bulge: Double, samples: Int) -> [Vec] {
            (0...samples).map { k in
                let s = Double(k) / Double(samples)
                return hand * s + normal * (length * bulge * (sin(Double.pi * s) - 0.35 * sin(2 * Double.pi * s)))
            }
        }
        var low = 0.0, high = 0.6
        for _ in 0..<40 {
            let middle = (low + high) / 2
            if Rope.measure(curve(middle, samples: 200)) < length { low = middle } else { high = middle }
        }
        return Rope.resample(curve((low + high) / 2, samples: 400), count: segments)
    }()

    // MARK: Paso

    /// Avanza `dt` segundos con la punta en `pointer`. Devuelve los golpes que hubo.
    @discardableResult
    mutating func step(pointer: Vec, dt rawDt: Double, restSide side: Double = 1) -> [Crack] {
        let dt = min(max(rawDt.isFinite ? rawDt : 0, 0), 0.1)
        restSide = side
        if lash != nil { return stepLash(dt: dt) }

        var target = pointer
        if var back = returning {
            back.age += dt
            target = back.from + (pointer - back.from) * smoothstep(back.age / 0.14)
            returning = back.age >= 0.14 ? nil : back
        }
        // Un salto enorme (otra pantalla): la cuerda aparece ahi, en reposo.
        if !target.isFinite { return [] }
        if (target - points[0]).length > Rope.length * 2.5 || !isFinite {
            self = Rope(at: target, restSide: side)
            return []
        }

        let simDt = min(dt, 1.0 / 30)
        let damping = pow(calmTime > 0 ? 0.9 : 0.965, simDt * 60)
        calmTime = max(0, calmTime - dt)
        clock += dt
        remember(target)
        let gravity = Vec(x: 0, y: -160 * simDt * simDt)
        let settle = 1 - exp(-simDt * 1.1)
        let before = points
        for i in 1...Rope.segments {
            let velocity = (points[i] - previous[i]) * damping
            previous[i] = points[i]
            var next = points[i] + velocity + gravity
            // Se acomoda de a poco a la forma en la mano (mas firme hacia el mango).
            let rest = target + Vec(x: Rope.restShape[i].x * side, y: Rope.restShape[i].y)
            next = next + (rest - next) * (settle * (0.35 + 0.65 * Double(i) / Double(Rope.segments)))
            points[i] = next
        }
        followTrail(strength: 1 - pow(1 - 0.45, simDt * 60))
        points[0] = target
        previous[0] = target
        solveConstraints()

        if !ghosts.isEmpty {
            ghostTime -= dt
            if ghostTime <= 0 { ghosts.removeAll() } else { remember() }
        }
        let moved = zip(before, points).map { ($0 - $1).length }.max() ?? 0
        quietFrames = moved < 0.03 ? quietFrames + 1 : 0
        return []
    }

    /// Largo entre puntos y algo de rigidez (mas hacia el mango), con la punta fija.
    private mutating func solveConstraints() {
        let segment = Rope.segmentLength
        let pinned = points[0]
        for iteration in 0..<24 {
            for i in 0..<Rope.segments {
                let a = points[i], b = points[i + 1]
                let delta = b - a
                let distance = max(delta.length, 0.0001)
                let difference = (distance - segment) / distance
                if i == 0 {
                    points[1] = b - delta * difference
                } else {
                    let correction = delta * (0.5 * difference)
                    points[i] = a + correction
                    points[i + 1] = b - correction
                }
            }
            if iteration % 2 == 0 {
                // Sin quiebres: cada punto se separa del de dos mas alla si se dobla demasiado.
                for i in 0..<(Rope.segments - 1) {
                    let stiffness = 0.04 + 0.32 * pow(Double(i) / Double(Rope.segments), 1.5)
                    let a = points[i], c = points[i + 2]
                    let delta = c - a
                    let distance = max(delta.length, 0.0001)
                    let rest = segment * 1.96
                    guard distance < rest else { continue }
                    let correction = delta * ((distance - rest) / distance * 0.5 * stiffness)
                    if i != 0 { points[i] = a + correction }
                    points[i + 2] = c - correction
                }
            }
            points[0] = pinned
        }
        // La cuerda no se estira: cada punto sigue al anterior desde la punta. Asi,
        // arrastrada rapido, queda detras del recorrido.
        for i in 1...Rope.segments {
            let delta = points[i] - points[i - 1]
            let distance = delta.length
            if distance > segment { points[i] = points[i - 1] + delta * (segment / distance) }
        }
    }

    private mutating func remember() {
        ghosts.append(points)
        if ghosts.count > 5 { ghosts.removeFirst(ghosts.count - 5) }
    }

    /// Anota por donde paso la punta (hasta un largo de cuerda y un segundo atras).
    private mutating func remember(_ tip: Vec) {
        if let newest = trail.first, (newest.point - tip).length < 1.5 { return }
        trail.insert((tip, clock), at: 0)
        var length = 0.0
        for i in 1..<trail.count {
            length += (trail[i].point - trail[i - 1].point).length
            if length > Rope.length * 1.05 || clock - trail[i].time > 1 {
                trail.removeSubrange(i...)
                break
            }
        }
    }

    /// Cada punto se acerca a donde estuvo la punta a su misma distancia de cuerda:
    /// fuerte si paso hace un instante, nada si ya hace rato.
    private mutating func followTrail(strength: Double) {
        guard trail.count >= 2 else { return }
        var walked = 0.0
        var k = 1
        for i in 1...Rope.segments {
            let wanted = Double(i) * Rope.segmentLength
            while k < trail.count && walked + (trail[k].point - trail[k - 1].point).length < wanted {
                walked += (trail[k].point - trail[k - 1].point).length
                k += 1
            }
            guard k < trail.count else { return }
            let span = max((trail[k].point - trail[k - 1].point).length, 1e-9)
            let t = (wanted - walked) / span
            let point = trail[k - 1].point + (trail[k].point - trail[k - 1].point) * t
            let time = trail[k - 1].time + (trail[k].time - trail[k - 1].time) * t
            let weight = strength * exp(-(clock - time) / 0.3)
            if weight > 0.002 { points[i] = points[i] + (point - points[i]) * weight }
        }
    }

    // MARK: Latigazo

    /// Arranca un latigazo. Si habia otro a medias, ese revienta ya (se devuelve su golpe).
    @discardableResult
    mutating func startLash(_ plan: LashPlan) -> Crack? {
        var interrupted: Crack?
        if let current = lash, !current.cracked {
            interrupted = Crack(at: current.plan.target, direction: current.throwDirection, streak: [], isEcho: false)
        }
        guard plan.target.isFinite, plan.duration.isFinite else { return interrupted }
        var plan = plan
        plan.duration = min(LashPlan.longest, max(0.05, plan.duration))
        lash = LashState(plan: plan, start: points)
        returning = nil
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

        let shape = state.shape(at: state.time)
        if !state.cracked && state.time >= duration {
            state.cracked = true
            let streak = (0...8).map { k in state.shape(at: max(0, duration - 0.05 + 0.05 * Double(k) / 8))[0] }
            let last = streak[streak.count - 1] - streak[streak.count - 3]
            cracks.append(Crack(at: state.plan.target, direction: last.length > 0.5 ? last.normalized : state.throwDirection, streak: streak, isEcho: false))
        }
        if let echo = state.plan.echoDelay, !state.echoed, state.time >= duration + echo {
            state.echoed = true
            cracks.append(Crack(at: state.plan.target, direction: state.throwDirection, streak: [], isEcho: true))
        }

        previous = points
        points = shape
        remember()
        if state.time >= end {
            // Suelta la cuerda a la fisica con la velocidad que traia: el rebote sale solo.
            lash = nil
            returning = (state.plan.target, 0)
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
    /// La cuerda en el momento del clic (0 = punta).
    let start: [Vec]
    let throwDirection: Vec
    /// Donde queda la mano para lanzar: atras del clic, a `reach` del largo.
    let releaseHand: Vec
    var time = 0.0
    var cracked = false
    var echoed = false

    init(plan: LashPlan, start: [Vec]) {
        self.plan = plan
        self.start = start
        let hand = start[start.count - 1]
        let toTarget = plan.target - hand
        throwDirection = toTarget.length > 1 ? toTarget.normalized : Vec(x: -0.8, y: 0.6)
        releaseHand = plan.target - throwDirection * (plan.reach * Rope.length)
    }

    /// La cuerda a los `t` segundos del clic: punta en el clic, bucle rodando hacia ella.
    func shape(at t: Double) -> [Vec] {
        let n = Rope.segments
        let length = Rope.length
        let segment = Rope.segmentLength
        let progress = t / plan.duration

        // 1. La mano tira hacia atras y da un golpe de muñeca hacia adelante.
        let pull = 1 - pow(1 - min(1, progress / 0.35), 3)
        let flick = sin(Double.pi * min(1, max(0, (progress - 0.3) / 0.35))) * 16 * plan.strength
        let hand = start[n] + (releaseHand - start[n]) * pull + throwDirection * flick

        // 2. La cuerda pasa de como estaba a tendida hacia el clic.
        let line = Rope.throwLine(from: plan.target, to: hand, length: length, side: -plan.side, count: n)
        let blend = smoothstep(progress / 0.45)
        var base = (0...n).map { i in start[i] + (line[i] - start[i]) * blend }

        // 3. El zigzag la hace ondular mientras el bucle corre.
        if plan.ripple > 0 {
            let amplitude = plan.ripple * smoothstep(progress / 0.25) * (1 - smoothstep((progress - 0.55) / 0.45))
            let normal = throwDirection.perpendicular
            for i in 1..<n {
                let s = Double(i) / Double(n)
                base[i] = base[i] + normal * (amplitude * sin(2 * Double.pi * 3 * s) * sin(Double.pi * s))
            }
        }

        // 4. El bucle (y el segundo, en el zigzag).
        var result = base
        addLoop(to: &result, base: base, progress: progress, scale: 1, segment: segment)
        if let echo = plan.echoDelay {
            addLoop(to: &result, base: base, progress: (t - echo) / plan.duration, scale: 0.6, segment: segment)
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
    private func addLoop(to result: inout [Vec], base: [Vec], progress: Double, scale: Double, segment: Double) {
        guard progress > 0 else { return }
        let n = Rope.segments
        let length = Rope.length
        let tipHalf = LashState.tipHalf, handleHalf = LashState.handleHalf
        let center = LashState.loopCenter(progress: progress)
        let grow = smoothstep(progress / 0.12)
        for i in 0...n {
            let s = Double(i) * segment
            let along = s / length
            let half = tipHalf + (handleHalf - tipHalf) * along
            let v = (s - center) / half
            guard abs(v) < 1 else { continue }
            let radius = plan.loopRadius * scale * (0.55 + 0.45 * along) * grow
            let angle = Double.pi * (1 - v)
            let tangent = (base[min(i + 1, n)] - base[max(i - 1, 0)]).normalized
            var normal = tangent.perpendicular
            if normal.dot(throwDirection.perpendicular) * plan.side < 0 { normal = normal * -1 }
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
