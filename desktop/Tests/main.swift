// Pruebas de la app de escritorio. Sin XCTest (no hace falta Xcode completo):
// un ejecutable que corre cada caso y sale con 1 si alguno falla.
// Uso: desktop/build.sh --test

import Foundation

var failures = 0
var passed = 0

func check(_ condition: @autoclosure () -> Bool, _ message: String, file: String = #fileID, line: Int = #line) {
    if condition() { passed += 1 } else {
        failures += 1
        print("FALLA \(message) (\(file):\(line))")
    }
}

func test(_ name: String, _ body: () throws -> Void) {
    let before = failures
    do { try body() } catch { failures += 1; print("FALLA \(name): \(error)") }
    print(failures == before ? "PASA  \(name)" : "FALLA \(name)")
}

let arguments = CommandLine.arguments
let levelsData = try! Data(contentsOf: URL(fileURLWithPath: arguments.count > 1 ? arguments[1] : "Resources/niveles.json"))
let soundsData = try! Data(contentsOf: URL(fileURLWithPath: arguments.count > 2 ? arguments[2] : "Resources/sonidos.json"))
let assets = URL(fileURLWithPath: arguments.count > 3 ? arguments[3] : "../assets")
let levels = try! Levels(json: levelsData)
let sounds = try! SoundCatalog(json: soundsData)
let frame = 1.0 / 60

// MARK: Ayudas

func ropeLength(_ rope: Rope) -> Double { Rope.measure(rope.points) }

/// Cuantas veces se cruza la cuerda consigo misma (un bucle de verdad se cruza).
func crossings(_ points: [Vec]) -> Int {
    func intersects(_ a: Vec, _ b: Vec, _ c: Vec, _ d: Vec) -> Bool {
        let d1 = (b - a).cross(c - a), d2 = (b - a).cross(d - a)
        let d3 = (d - c).cross(a - c), d4 = (d - c).cross(b - c)
        return d1 * d2 < 0 && d3 * d4 < 0
    }
    var count = 0
    for i in 0..<(points.count - 1) {
        for j in (i + 2)..<max(i + 2, points.count - 1) where intersects(points[i], points[i + 1], points[j], points[j + 1]) { count += 1 }
    }
    return count
}

/// Cuanto gira la cuerda de punta a mango (radianes, sin signo) y cuantas veces cambia de lado la curva.
func bending(_ points: [Vec]) -> (turn: Double, signChanges: Int) {
    var turn = 0.0, changes = 0, lastSign = 0.0
    for i in 1..<(points.count - 1) {
        let a = (points[i] - points[i - 1]).normalized, b = (points[i + 1] - points[i]).normalized
        let angle = atan2(a.cross(b), a.dot(b))
        turn += angle
        if abs(angle) > 0.02 {
            let sign: Double = angle > 0 ? 1 : -1
            if lastSign != 0 && sign != lastSign { changes += 1 }
            lastSign = sign
        }
    }
    return (abs(turn), changes)
}

/// Mueve la punta por `path(t)` durante `seconds`, como lo hace la app.
func drive(_ rope: inout Rope, motion: inout MotionTracker, time: inout Double, seconds: Double, side: inout Double, _ path: (Double) -> Vec) {
    let frames = Int(seconds * 60)
    for i in 0...frames {
        let point = path(Double(i) / Double(max(frames, 1)))
        motion.add(point, time: time)
        side = chooseRestSide(current: side, motion: motion.features(now: time), pointer: point, screen: nil)
        rope.step(pointer: point, dt: frame, restSide: side)
        time += frame
    }
}

func features(of path: (Double) -> Vec, seconds: Double = 0.4) -> MotionFeatures {
    var tracker = MotionTracker()
    var time = 0.0
    let frames = Int(seconds * 60)
    for i in 0...frames {
        tracker.add(path(Double(i) / Double(frames)), time: time)
        time += frame
    }
    return tracker.features(now: time - frame)
}

let straightPath: (Double) -> Vec = { t in Vec(x: 200 + 420 * t, y: 500) }
let turnPath: (Double) -> Vec = { t in Vec(x: 500 + 140 * cos(Double.pi * 1.6 * t), y: 500 + 140 * sin(Double.pi * 1.6 * t)) }
let zigzagPath: (Double) -> Vec = { t in Vec(x: 200 + 300 * t, y: 500 + 45 * sin(Double.pi * 8 * t)) }

// MARK: Reglas del juego

test("los 14 niveles salen de levels.ts") {
    check(levels.tiers.count == 14, "son 14")
    check(levels.tiers.first?.name == "Cuero crudo", "empieza en Cuero crudo")
    check(levels.tiers.last?.name == "Divino", "termina en Divino")
}

test("la interpolacion de colores da lo mismo que lookFor en TypeScript") {
    let root = try JSONSerialization.jsonObject(with: levelsData) as! [String: Any]
    for sample in root["samples"] as! [[String: Any]] {
        let total = sample["total"] as! Int
        let expected = sample["look"] as! [String: Any]
        let look = levels.look(total)
        check(look.lash.hex == expected["lash"] as! String, "lash en \(total): \(look.lash.hex) vs \(expected["lash"]!)")
        check(look.handle.hex == expected["handle"] as! String, "handle en \(total)")
        check(look.glow.hex == expected["glow"] as! String, "glow en \(total)")
        check(abs(look.sparkDensity - (expected["sparkDensity"] as! NSNumber).doubleValue) < 1e-9, "chispas en \(total)")
        check(look.crack == expected["crack"] as! String, "grito en \(total)")
    }
}

test("progreso, nivel maximo y totales raros") {
    check(levels.progress(0).remaining == 25, "faltan 25 al empezar")
    check(levels.progress(24).tier.level == 1 && levels.progress(25).tier.level == 2, "sube en 25")
    check(levels.progress(1_000_000).next == nil && levels.progress(1_000_000).progress == 1, "nivel maximo")
    check(levels.progress(-5).tier.level == 1, "negativo cae en el primero")
}

test("combos: ventana de 1,5 s, reloj hacia atras y gritos") {
    check(Rules.nextCombo(previousAt: nil, previousCombo: 0, now: 10) == 1, "primero")
    check(Rules.nextCombo(previousAt: 10, previousCombo: 1, now: 11.5) == 2, "dentro de la ventana")
    check(Rules.nextCombo(previousAt: 10, previousCombo: 4, now: 11.51) == 1, "fuera de la ventana")
    check(Rules.nextCombo(previousAt: 10, previousCombo: 3, now: 9) == 1, "reloj hacia atras")
    check(Rules.comboTitle(2) == "¡DOBLE!" && Rules.comboTitle(3) == "¡TRIPLE!" && Rules.comboTitle(25) == "¡¡DIOS DEL LÁTIGO!!", "gritos")
}

test("conteos: por blanco, por dia, mejor combo y fusion por el mayor") {
    let a = Stats().recording(.effort, combo: 2, day: "2026-10-22").recording(.model, combo: 1, day: "2026-10-22")
    check(a.total == 2 && a.onEffort == 1 && a.onModel == 1 && a.bestCombo == 2 && a.byDay["2026-10-22"] == 2, "registro")
    let b = Stats(total: 5, onModel: 0, onEffort: 5, bestCombo: 1, byDay: ["2026-10-21": 5])
    let merged = a.merged(with: b)
    check(merged.total == 5 && merged.onEffort == 5 && merged.onModel == 1 && merged.bestCombo == 2 && merged.byDay.count == 2, "fusion")
    check(Stats.from(json: ["total": -3, "byDay": ["hackeo": 4, "2026-10-01": 2]]) == Stats(total: 0, onModel: 0, onEffort: 0, bestCombo: 0, byDay: ["2026-10-01": 2]), "lo roto se limpia")
}

test("effort: sube de a un nivel, el que sale es el mayor y el pronostico sigue a los latigazos rapidos") {
    check(Effort.medium.raised == .high && Effort.xhigh.raised == .max && Effort.max.raised == nil, "un nivel por latigazo y tope en max")
    check(Effort.effective(session: .medium, forced: .xhigh) == .xhigh && Effort.effective(session: .max, forced: .high) == .max, "el mayor")
    check(Effort.effective(session: nil, forced: nil) == nil && Effort.effective(session: nil, forced: .low) == .low, "sin datos")
    var forecast = EffortForecast()
    // La sesion dijo "medium" hace rato; tres latigazos seguidos llegan antes de que lo vuelva a decir.
    check(forecast.next(session: .medium, boost: nil, presenceAt: 1000, now: 2000) == .high, "primero: high")
    check(forecast.next(session: .medium, boost: nil, presenceAt: 1000, now: 2300) == .xhigh, "segundo: xhigh")
    check(forecast.next(session: .medium, boost: nil, presenceAt: 1000, now: 2600) == .max, "tercero: max")
    check(forecast.next(session: .medium, boost: nil, presenceAt: 1000, now: 2900) == nil, "cuarto: ya en max")
    // La sesion vuelve a hablar (la calmaron): se cuenta desde lo que dice.
    check(forecast.next(session: .low, boost: nil, presenceAt: 5000, now: 6000) == .medium, "una presencia nueva manda")
    var fresh = EffortForecast()
    check(fresh.next(session: nil, boost: nil, presenceAt: 0, now: 1) == .high, "sin effort conocido parte de medium")
}

test("objetivos: el effort solo sube sobre donde vive Claude Code") {
    check(TargetApps.isClaudeHost("Code"), "VS Code")
    check(TargetApps.isClaudeHost("iTerm2") && TargetApps.isClaudeHost("Terminal") && TargetApps.isClaudeHost("Claude"), "terminales y Claude")
    check(!TargetApps.isClaudeHost("Safari") && !TargetApps.isClaudeHost(nil), "otras apps no")
}

// MARK: La cuerda

test("la cuerda en reposo: punta en el puntero, mango en la mano y largo exacto") {
    check(Rope.restShape.count == Rope.segments + 1 && Rope.restShape[0] == .zero, "la forma de reposo empieza en la punta")
    check(abs(Rope.measure(Rope.restShape) - Rope.length) < 1, "la forma de reposo mide el largo de la cuerda")
    var right = Rope(at: Vec(x: 600, y: 600), restSide: 1)
    var left = Rope(at: Vec(x: 600, y: 600), restSide: -1)
    for _ in 0..<240 {
        right.step(pointer: Vec(x: 600, y: 600), dt: frame, restSide: 1)
        left.step(pointer: Vec(x: 600, y: 600), dt: frame, restSide: -1)
    }
    check(right.tip == Vec(x: 600, y: 600), "la punta va en el puntero")
    check(right.handle.x > 600 && right.handle.y < 600, "mano abajo a la derecha")
    check(left.handle.x < 600 && left.handle.y < 600, "o abajo a la izquierda")
    check(abs(ropeLength(right) - Rope.length) < Rope.length * 0.03, "largo estable: \(ropeLength(right))")
    check(right.isSettled, "quieta, deja de redibujarse")
}

test("la cuerda sigue el recorrido: recto queda tendida, con giro se curva y en zigzag ondula") {
    var time = 0.0
    var straight = Rope(at: straightPath(0)), motion = MotionTracker(), side = 1.0
    drive(&straight, motion: &motion, time: &time, seconds: 0.5, side: &side, straightPath)
    check(side == -1 && straight.handle.x < straight.tip.x, "hacia la derecha, la mano queda detras (a la izquierda)")

    var curved = Rope(at: turnPath(0)), turnMotion = MotionTracker(), turnSide = 1.0
    drive(&curved, motion: &turnMotion, time: &time, seconds: 0.5, side: &turnSide, turnPath)
    var wavy = Rope(at: zigzagPath(0)), zigzagMotion = MotionTracker(), zigzagSide = 1.0
    drive(&wavy, motion: &zigzagMotion, time: &time, seconds: 0.5, side: &zigzagSide, zigzagPath)

    // La mitad de la cuerda cerca de la punta queda sobre el camino del mouse.
    func distanceToPath(_ rope: Rope, _ path: (Double) -> Vec) -> Double {
        let route = (0...400).map { path(Double($0) / 400) }
        let near = rope.points[1...(Rope.segments / 2)]
        return near.map { p in route.map { ($0 - p).length }.min()! }.reduce(0, +) / Double(near.count)
    }
    check(distanceToPath(straight, straightPath) < 12, "recto: la cuerda va por donde paso el mouse (\(distanceToPath(straight, straightPath)) px)")
    check(distanceToPath(curved, turnPath) < 12, "con giro: igual (\(distanceToPath(curved, turnPath)) px)")
    check(distanceToPath(wavy, zigzagPath) < 12, "en zigzag: igual (\(distanceToPath(wavy, zigzagPath)) px)")
    let half = Rope.segments / 2
    let straightBend = bending(Array(straight.points[0...half])), curvedBend = bending(Array(curved.points[0...half])), wavyBend = bending(Array(wavy.points[0...half]))
    check(straightBend.turn < 0.3, "recto queda tendida: \(straightBend.turn) rad")
    check(curvedBend.turn > 0.9, "con giro se curva (media cuerda en un circulo de radio 140 gira 1,18 rad): \(curvedBend.turn) rad")
    check(wavyBend.signChanges >= 3, "en zigzag ondula: \(wavyBend.signChanges) cambios de curva")
    // Quieta, se acomoda en la mano.
    for _ in 0..<240 { curved.step(pointer: turnPath(1), dt: frame, restSide: turnSide) }
    check(curved.handle.y < turnPath(1).y && distanceToPath(curved, turnPath) > 12, "quieta, deja el camino y vuelve a la mano")
    for rope in [straight, curved, wavy] {
        check(rope.isFinite, "sin NaN")
        check(abs(ropeLength(rope) - Rope.length) < Rope.length * 0.08, "largo estable: \(ropeLength(rope))")
    }
}

test("la cuerda aguanta saltos, tiempos raros y movimientos bruscos") {
    var rope = Rope(at: Vec(x: 500, y: 500))
    var tip = Vec(x: 500, y: 500)
    for i in 0..<600 {
        tip = Vec(x: 500 + 400 * sin(Double(i) / 9), y: 500 + 260 * cos(Double(i) / 13))
        rope.step(pointer: tip, dt: frame)
    }
    check(rope.isFinite && rope.tip == tip, "movimientos bruscos: sin NaN y con la punta en el puntero")
    check(abs(ropeLength(rope) - Rope.length) < Rope.length * 0.08, "largo estable: \(ropeLength(rope))")
    for dt in [0, -1, .nan, .infinity, 5] as [Double] { rope.step(pointer: tip, dt: dt) }
    check(rope.isFinite, "dt raros no rompen nada")
    rope.step(pointer: Vec(x: 5000, y: -3000), dt: frame)
    check(rope.tip == Vec(x: 5000, y: -3000) && rope.isFinite, "un salto a otra pantalla la lleva entera")
    rope.step(pointer: Vec(x: .nan, y: 1), dt: frame)
    check(rope.isFinite, "un puntero roto se ignora")
}

test("el lado de la mano: detras del movimiento y lejos del borde") {
    let right = MotionFeatures(speed: 0.8, turn: 0, reversals: 0, heading: Vec(x: 1, y: 0), kind: .straight)
    let left = MotionFeatures(speed: 0.8, turn: 0, reversals: 0, heading: Vec(x: -1, y: 0), kind: .straight)
    let still = MotionFeatures()
    check(chooseRestSide(current: 1, motion: right, pointer: Vec(x: 800, y: 500), screen: (0, 1600)) == -1, "yendo a la derecha, mano a la izquierda")
    check(chooseRestSide(current: -1, motion: left, pointer: Vec(x: 800, y: 500), screen: (0, 1600)) == 1, "yendo a la izquierda, mano a la derecha")
    check(chooseRestSide(current: -1, motion: still, pointer: Vec(x: 800, y: 500), screen: (0, 1600)) == -1, "quieto, no cambia")
    check(chooseRestSide(current: -1, motion: right, pointer: Vec(x: 60, y: 500), screen: (0, 1600)) == 1, "pegado al borde izquierdo, la mano va a la derecha")
    check(chooseRestSide(current: 1, motion: left, pointer: Vec(x: 1570, y: 500), screen: (0, 1600)) == -1, "pegado al borde derecho, a la izquierda")
}

// MARK: Como se mueve el mouse

test("el movimiento se reconoce: quieto, recto, con giro y en zigzag") {
    check(features(of: { _ in Vec(x: 300, y: 300) }).kind == .still, "quieto")
    let straight = features(of: straightPath)
    check(straight.kind == .straight && straight.speed > 0.5 && straight.heading.x > 0.9, "recto: \(straight)")
    let turn = features(of: turnPath)
    check(turn.kind == .turn && turn.turn > 1.2, "con giro: \(turn)")
    check(features(of: { t in turnPath(1 - t) }).turn < -1.2, "el giro al otro lado da negativo")
    let zigzag = features(of: zigzagPath)
    check(zigzag.kind == .zigzag && zigzag.reversals >= 2, "zigzag: \(zigzag)")
    let shake = features(of: { t in Vec(x: 400 + 60 * sin(Double.pi * 10 * t), y: 400) })
    check(shake.kind == .zigzag, "sacudir de lado a lado tambien es zigzag")
    let slow = features(of: { t in Vec(x: 200 + 60 * t, y: 500) }), fast = features(of: { t in Vec(x: 200 + 900 * t, y: 500) })
    check(fast.speed > slow.speed * 3, "mas rapido, mas velocidad")
    var tracker = MotionTracker()
    tracker.add(Vec(x: 0, y: 0), time: 10)
    tracker.add(Vec(x: 500, y: 0), time: 5)
    check(tracker.features(now: 5).kind == .still, "un reloj que va hacia atras empieza de nuevo")
}

test("el plan del latigazo cambia con el movimiento") {
    var random = SeededRandom(seed: 3)
    let target = Vec(x: 500, y: 500), handle = Vec(x: 700, y: 330)
    let still = LashPlan.make(motion: MotionFeatures(), target: target, handle: handle, duration: 0.26, combo: 1, random: &random)
    let turn = LashPlan.make(motion: features(of: turnPath), target: target, handle: handle, duration: 0.2, combo: 1, random: &random)
    let otherTurn = LashPlan.make(motion: features(of: { t in turnPath(1 - t) }), target: target, handle: handle, duration: 0.2, combo: 1, random: &random)
    let zigzag = LashPlan.make(motion: features(of: zigzagPath), target: target, handle: handle, duration: 0.2, combo: 6, random: &random)
    check(still.echoDelay == nil && still.ripple == 0, "quieto: un solo chasquido, sin ondas")
    check(turn.side != otherTurn.side, "el bucle sale del lado del giro")
    check(turn.reach < still.reach, "con giro la cuerda va mas curva")
    check(zigzag.echoDelay != nil && zigzag.ripple > 0, "zigzag: ondula y truena dos veces")
    check(zigzag.strength > still.strength, "mas velocidad y combo, golpe mas fuerte")
    let durations = [MotionFeatures(), features(of: straightPath), features(of: turnPath), features(of: zigzagPath)].map(LashPlan.motionDuration)
    check(durations.allSatisfy { $0 >= LashPlan.shortest && $0 <= LashPlan.longest }, "duraciones entre 0,14 y 0,36 s: \(durations)")
    let slow = LashPlan.motionDuration(MotionFeatures(speed: 0.2, kind: .straight)), fast = LashPlan.motionDuration(MotionFeatures(speed: 2, kind: .straight))
    check(fast < slow, "un tiron rapido truena antes")
}

// MARK: El latigazo

/// Da un latigazo y lo deja correr cuadro a cuadro. Devuelve los golpes con su tiempo y las cuerdas.
func lash(motion: MotionFeatures, combo: Int = 1, duration: Double? = nil, extra: Double = 0.6) -> (cracks: [(time: Double, crack: Crack)], shapes: [(time: Double, points: [Vec])], plan: LashPlan, rope: Rope) {
    var random = SeededRandom(seed: 11)
    let target = Vec(x: 600, y: 520)
    var rope = Rope(at: target)
    for _ in 0..<120 { rope.step(pointer: target, dt: frame) }
    let plan = LashPlan.make(motion: motion, target: target, handle: rope.handle, duration: duration ?? LashPlan.motionDuration(motion), combo: combo, random: &random)
    rope.startLash(plan)
    var time = 0.0
    var cracks: [(Double, Crack)] = [], shapes: [(Double, [Vec])] = []
    while time < plan.duration + extra {
        time += frame
        for crack in rope.step(pointer: target, dt: frame) { cracks.append((time, crack)) }
        shapes.append((time, rope.points))
    }
    return (cracks, shapes, plan, rope)
}

test("el latigazo revienta justo en el clic, a tiempo con el sonido") {
    let result = lash(motion: features(of: straightPath))
    check(result.cracks.count == 1, "un golpe")
    if let first = result.cracks.first {
        check(first.crack.at == result.plan.target, "en el punto del clic")
        check(abs(first.time - result.plan.duration) <= frame + 1e-9, "a los \(result.plan.duration) s (llego a los \(first.time))")
        check(first.crack.streak.count >= 2 && first.crack.direction != .zero, "con la raya de la punta y su direccion")
    }
    let atCrack = result.shapes.first { $0.time >= result.plan.duration }!.points
    check((atCrack[0] - result.plan.target).length < 0.5, "la punta esta en el clic al reventar")
    check(result.rope.tip == result.plan.target && !result.rope.isLashing, "despues vuelve al puntero")
    check(result.rope.isFinite && abs(ropeLength(result.rope) - Rope.length) < Rope.length * 0.08, "y la cuerda queda sana")
}

test("se ve un bucle de verdad que corre del mango a la punta, cada vez mas rapido") {
    let result = lash(motion: MotionFeatures(), duration: 0.26)
    let during = result.shapes.filter { $0.time > 0.2 * 0.26 && $0.time < 0.95 * 0.26 }
    check(during.contains { crossings($0.points) >= 1 }, "la cuerda se cruza consigo misma: es un rizo, no una onda")
    let centers = stride(from: 0.0, through: 1.0, by: 0.1).map(LashState.loopCenter)
    check(centers[0] >= Rope.length && centers[10] <= 0, "entra por el mango y sale por la punta: \(centers[0]) → \(centers[10])")
    check(zip(centers, centers.dropFirst()).allSatisfy { $0 > $1 }, "siempre hacia la punta")
    check(centers[5] - centers[10] > 1.5 * (centers[0] - centers[5]), "y cada vez mas rapido: \(centers[0] - centers[5]) en la primera mitad, \(centers[5] - centers[10]) en la segunda")
    check(result.rope.ghosts.isEmpty, "las estelas se apagan solas")
}

test("en zigzag truena dos veces; un clic encima del otro no se pierde") {
    let result = lash(motion: features(of: zigzagPath))
    check(result.cracks.count == 2 && result.cracks[1].crack.isEcho, "dos golpes, el segundo es el eco")
    if result.cracks.count == 2, let echo = result.plan.echoDelay {
        check(abs(result.cracks[1].time - result.cracks[0].time - echo) <= frame + 1e-9, "separados \(echo) s")
    }
    var random = SeededRandom(seed: 1)
    var rope = Rope(at: Vec(x: 400, y: 400))
    let first = LashPlan.make(motion: MotionFeatures(), target: Vec(x: 400, y: 400), handle: rope.handle, duration: 0.26, combo: 1, random: &random)
    rope.startLash(first)
    rope.step(pointer: Vec(x: 400, y: 400), dt: frame)
    let second = LashPlan.make(motion: MotionFeatures(), target: Vec(x: 420, y: 410), handle: rope.handle, duration: 0.26, combo: 2, random: &random)
    let interrupted = rope.startLash(second)
    check(interrupted?.at == Vec(x: 400, y: 400), "el golpe del primero sale enseguida")
}

test("con movimiento reducido el latigazo es casi inmediato") {
    let result = lash(motion: MotionFeatures(), duration: 0.08, extra: 0.3)
    check(result.cracks.count == 1 && result.cracks[0].time <= 0.08 + frame, "golpe a los 0,08 s")
}

// MARK: Los efectos

test("el golpe: chispas segun nivel y combo, raya, onda de choque, insignia y todo se apaga solo") {
    var random = SeededRandom(seed: 7)
    let crack = Crack(at: .zero, direction: Vec(x: 1, y: 0), streak: [Vec(x: -20, y: 0), .zero], isEcho: false)
    var low = Effects(), high = Effects()
    low.crack(crack, look: levels.look(0), combo: 1, strength: 1, reducedMotion: false, random: &random)
    high.crack(crack, look: levels.look(7000), combo: 6, strength: 1, reducedMotion: false, random: &random)
    check(high.particles.count > low.particles.count * 2, "mas nivel y combo, mas chispas")
    check(high.shouts.contains { $0.text == "x6 ¡FURIA!" }, "grito del combo")
    check(low.shouts.count == 1 && low.shouts[0].text == "¡CHAS!", "grito del nivel 1")
    check(low.streaks.count == 1 && low.cones.count == 1, "la raya y la V de la onda de choque")
    var reduced = Effects()
    reduced.crack(crack, look: levels.look(7000), combo: 6, strength: 1, reducedMotion: true, random: &random)
    check(reduced.particles.count < high.particles.count / 2 && reduced.streaks.isEmpty && reduced.cones.isEmpty, "movimiento reducido: menos chispas y sin rayas")
    var echo = Effects()
    echo.crack(Crack(at: .zero, direction: .zero, streak: [], isEcho: true), look: levels.look(7000), combo: 6, strength: 1, reducedMotion: false, random: &random)
    check(echo.shouts.isEmpty && echo.particles.count < high.particles.count, "el eco es mas chico y sin gritos")
    high.badge("effort ▲ high", isMuted: false, at: .zero, combo: 6)
    high.showHud(title: "Látigo prendido", subtitle: "Esc o ⌃⌘L lo apagan", at: .zero)
    check(high.badges.count == 1 && high.badges[0].lift > 100 && high.hud != nil, "insignia encima del combo y aviso")
    for _ in 0..<200 { high.step(dt: frame) }
    check(high.isIdle, "a los pocos segundos no queda nada")
}

// MARK: El sonido

/// Indice de la muestra mas fuerte.
func loudest(_ samples: [Float]) -> Int { samples.indices.max { abs(samples[$0]) < abs(samples[$1]) }! }

func rms(_ samples: ArraySlice<Float>) -> Double {
    sqrt(samples.reduce(0) { $0 + Double($1) * Double($1) } / Double(max(1, samples.count)))
}

test("el sonido sintetico tiene la forma de un latigo real") {
    var random = SeededRandom(seed: 99)
    let rate = WhipSound.sampleRate
    let a = WhipSound(crackAt: 0.18, speed: 1).render(random: &random)
    let b = WhipSound(crackAt: 0.18, speed: 1).render(random: &random)
    check(a != b, "dos latigazos iguales suenan distinto")
    check(a.allSatisfy { $0.isFinite && abs($0) <= 1 }, "sin saturar ni NaN")
    let peak = loudest(a)
    check(abs(Double(peak) / rate - 0.18) < 0.002, "el golpe cae en crackAt: \(Double(peak) / rate)")
    let level = Double(abs(a[peak]))
    let swish = 20 * log10(rms(a[Int(rate * 0.05)..<Int(rate * 0.15)]) / level)
    check(swish < -25 && swish > -70, "el zumbido casi no se oye, pero algo: \(swish) dB")
    let tailStart = 20 * log10(rms(a[(peak + Int(rate * 0.01))..<(peak + Int(rate * 0.04))]) / level)
    let tailEnd = 20 * log10(rms(a[(a.count - Int(rate * 0.06))..<a.count]) / level)
    check(tailStart > -35 && tailEnd < tailStart - 15, "y despues el siseo que se apaga (suufff): \(tailStart) → \(tailEnd) dB")
    let double = WhipSound(crackAt: 0.15, speed: 1, isDouble: true, doubleGap: 0.03).render(random: &random)
    let second = Int(rate * 0.18)
    check(double[(second - 40)...(second + 80)].map { abs($0) }.max()! > abs(double[loudest(double)]) * 0.3, "el doble chasquido llega a los 30 ms")
    let soft = WhipSound(crackAt: 0.1, speed: 1, character: .suave).render(random: &random)
    check(abs(soft[loudest(soft)]) < 0.3 && soft.count < a.count, "suave: mas bajito y mas corto")
    let pass = WhipSound.pass(speed: 1.8, random: &random)
    check(pass.count < Int(rate * 0.25) && pass.allSatisfy { abs($0) < 0.6 }, "el zumbido al mover es corto y bajito")
}

test("los sonidos para elegir: los mismos de hooks/sounds.ts y bien medidos") {
    check(sounds.styles.map(\.id) == ["real", "real-1", "real-2", "real-3", "real-4", "real-5", "real-6", "aire", "suave"], "nueve estilos en orden")
    check(sounds.defaultId == "real" && sounds.style("tambor").id == "real", "uno desconocido da el de siempre")
    check(sounds.style("aire").isLiveSynth && !sounds.style("real-2").isLiveSynth, "aire se hace en el momento")
    check(sounds.pick("real", random: 0).path == "sonidos/real-1.wav" && sounds.pick("real", random: 0.999).path == "sonidos/real-6.wav", "elegir al azar cubre todo el estilo")
    var seen = Set<String>()
    for style in sounds.styles {
        for file in style.files where !seen.contains(file.path) {
            seen.insert(file.path)
            guard let samples = WhipAudio.load(assets.appendingPathComponent(file.path)) else {
                check(false, "\(file.path) existe y es WAV mono de 44,1 kHz")
                continue
            }
            let peak = Double(loudest(samples)) / WhipSound.sampleRate
            // El golpe del archivo cae donde dice el catalogo (en el doble, el pico es el segundo).
            check(peak >= file.crackAt - 0.002 && peak <= file.crackAt + 0.025, "\(file.path): golpe a los \(Int(peak * 1000)) ms, el catalogo dice \(Int(file.crackAt * 1000))")
        }
    }
    check(seen.count == 12, "doce archivos")
}

test("los sinteticos del plugin salen de este mismo sintetizador") {
    for (path, preset) in SoundRender.presets.sorted(by: { $0.key < $1.key }) {
        guard let file = sounds.styles.flatMap(\.files).first(where: { $0.path == path }), let onDisk = WhipAudio.load(assets.appendingPathComponent(path)) else {
            check(false, "\(path) esta en el catalogo y en assets")
            continue
        }
        var random = SeededRandom(seed: preset.seed)
        let rendered = WhipSound(crackAt: file.crackAt, speed: preset.speed, isDouble: preset.isDouble, character: preset.character).render(random: &random)
        let same = rendered.count == onDisk.count && zip(rendered, onDisk).allSatisfy { abs($0 - $1) < 2.0 / 32767 }
        check(same, "\(path) coincide con el sintetizador (si cambiaste Synth.swift, corre Latigo --render-sounds assets)")
    }
}

test("el latigazo espera al sonido elegido y el sonido al latigazo") {
    let short = SoundFile(path: "x", crackAt: 0.15), complete = SoundFile(path: "y", crackAt: 0.353), late = SoundFile(path: "z", crackAt: 0.6)
    check(SoundTiming.lashDuration(motion: 0.2, file: short) == 0.2, "un archivo que golpea antes no alarga el latigazo")
    check(SoundTiming.lashDuration(motion: 0.2, file: complete) == 0.353, "uno completo se oye entero")
    check(SoundTiming.lashDuration(motion: 0.2, file: late) == SoundTiming.longestWait, "pero nunca se espera mas de 0,36 s")
    check(SoundTiming.lashDuration(motion: 0.2, file: nil) == 0.2, "sin archivo manda el movimiento")
    let early = SoundTiming.schedule(crackAt: 0.15, impact: 0.2)
    check(abs(early.delay - 0.05) < 1e-9 && early.offset == 0, "golpe antes: se espera la diferencia")
    let after = SoundTiming.schedule(crackAt: 0.5, impact: 0.36)
    check(after.delay == 0 && abs(after.offset - 0.14) < 1e-9, "golpe despues: se salta el comienzo")
}

// MARK: El puente

test("el puente: latigazo, effort solo con sesion, presencia, atajo y un solo interruptor") {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("latigo-app-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let files = BridgeFiles.standard(environment: ["LATIGO_HOME": dir.path])
    check(files.dir.lastPathComponent == ".claude-latigo", "carpeta del puente")
    let bridge = Bridge(files: files, soundStyles: Set(sounds.styles.map(\.id)), defaultSoundStyle: sounds.defaultId)
    let now = Date()

    // Sin sesion viva: cuenta, pero no pide effort.
    var result = bridge.recordLash(target: .effort, combo: 1, now: now, known: Stats())
    check(result.stats.total == 1 && !result.effortRequested && bridge.readEffortSeq() == 0, "sin sesion no pide effort")

    // Con sesion viva: pide un nivel mas.
    bridge.write(["at": now.timeIntervalSince1970 * 1000, "model": "claude-opus-5-5", "effort": "medium", "boost": "high"], to: files.presence)
    let session = bridge.liveSession(now: now.timeIntervalSince1970 * 1000)
    check(session?.effort == .medium && session?.boost == .high && session?.model == "claude-opus-5-5", "la sesion con su effort")
    check(bridge.liveSession(now: now.timeIntervalSince1970 * 1000 + 16_000) == nil, "a los 15 s ya no esta viva")
    result = bridge.recordLash(target: .effort, combo: 2, now: now, known: result.stats)
    check(result.effortRequested && bridge.readEffortSeq() == 1, "con sesion pide effort")
    result = bridge.recordLash(target: .model, combo: 3, now: now, known: result.stats)
    check(bridge.readEffortSeq() == 1, "al modelo no pide effort")

    let stats = bridge.readStats()
    check(stats.total == 3 && stats.onEffort == 2 && stats.onModel == 1 && stats.bestCombo == 3, "stats.json")
    let lash = bridge.readObject(files.lash)
    check(lash?["source"] as? String == "desktop" && lash?["total"] as? Int == 3 && lash?["target"] as? String == "model", "lash.json de la app")

    // Un stats.json roto no hace bajar los conteos conocidos.
    try! Data("{roto".utf8).write(to: files.stats)
    result = bridge.recordLash(target: .model, combo: 1, now: now, known: stats)
    check(result.stats.total == 4, "lo conocido protege contra un archivo roto")

    bridge.writeDesktopPresence(at: 123, whipMode: true, hotkey: .ocupado)
    let desktop = bridge.readObject(files.desktop)
    check(desktop?["whipMode"] as? Bool == true && (desktop?["at"] as? NSNumber)?.doubleValue == 123 && desktop?["hotkey"] as? String == "ocupado", "presencia de la app con el estado del atajo")
    check(!FileManager.default.fileExists(atPath: dir.appendingPathComponent(".claude-latigo/whipmode.json").path), "ya no hay un segundo interruptor (whipmode.json)")

    bridge.writeConfig(LatigoConfig(enabled: false, sound: true, soundStyle: "real-4"))
    check(bridge.readConfig() == LatigoConfig(enabled: false, sound: true, soundStyle: "real-4"), "config con el sonido elegido")
    bridge.write(["enabled": true, "sound": false, "soundStyle": "tambor"], to: files.config)
    check(bridge.readConfig() == LatigoConfig(enabled: true, sound: false, soundStyle: "real"), "un sonido desconocido da el de siempre")
    try! Data("[]".utf8).write(to: files.config)
    check(bridge.readConfig() == LatigoConfig(), "config rota: valores por defecto")
}

print("\n\(passed) comprobaciones pasan, \(failures) fallan")
exit(failures == 0 ? 0 : 1)
