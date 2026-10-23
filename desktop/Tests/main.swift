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

let levelsPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Resources/niveles.json"
let levelsData = try! Data(contentsOf: URL(fileURLWithPath: levelsPath))
let levels = try! Levels(json: levelsData)

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

test("la cuerda: punta en el puntero, mango atras, largo estable y sin NaN") {
    var rope = Rope(at: Vec(x: 500, y: 500))
    var tip = Vec(x: 500, y: 500)
    for i in 0..<600 {
        // Movimientos bruscos de ida y vuelta.
        tip = Vec(x: 500 + 400 * sin(Double(i) / 9), y: 500 + 260 * cos(Double(i) / 13))
        rope.step(tip: tip, dt: 1.0 / 60)
        if i % 50 == 0 { rope.strike(strength: 2) }
    }
    check(rope.isFinite, "sin NaN")
    check(rope.tip == tip, "la punta va en el puntero")
    var total = 0.0
    for i in 0..<Rope.segments { total += (rope.points[i + 1] - rope.points[i]).length }
    check(abs(total - Rope.length) < Rope.length * 0.08, "largo estable: \(total)")
    // En reposo, el mango descansa abajo a la derecha de la punta.
    var still = Rope(at: Vec(x: 100, y: 800))
    for _ in 0..<240 { still.step(tip: Vec(x: 100, y: 800), dt: 1.0 / 60) }
    check(still.handle.x > 100 && still.handle.y < 800, "mango abajo a la derecha")
}

test("el golpe: chispas segun nivel y combo, gritos, y todo se apaga solo") {
    var random = SeededRandom(seed: 7)
    var low = Effects(), high = Effects()
    low.burst(at: Vec(x: 0, y: 0), look: levels.look(0), combo: 1, strength: 1, reducedMotion: false, random: &random)
    high.burst(at: Vec(x: 0, y: 0), look: levels.look(7000), combo: 6, strength: 1, reducedMotion: false, random: &random)
    check(high.particles.count > low.particles.count * 2, "mas nivel y combo, mas chispas")
    check(high.shouts.contains { $0.text == "x6 ¡FURIA!" }, "grito del combo")
    check(low.shouts.count == 1 && low.shouts[0].text == "¡CHAS!", "grito del nivel 1")
    var reduced = Effects()
    reduced.burst(at: Vec(x: 0, y: 0), look: levels.look(7000), combo: 6, strength: 1, reducedMotion: true, random: &random)
    check(reduced.particles.count < high.particles.count / 2, "movimiento reducido: menos chispas")
    for _ in 0..<200 { high.step(dt: 1.0 / 60) }
    check(high.isIdle, "a los pocos segundos no queda nada")
}

test("el sonido nunca es igual y tiene la forma de un latigo real") {
    var random = SeededRandom(seed: 99)
    let a = WhipSound(speed: 1, combo: 1, level: 1).render(random: &random)
    let b = WhipSound(speed: 1, combo: 1, level: 1).render(random: &random)
    check(a != b, "dos latigazos iguales suenan distinto")
    check(a.allSatisfy { $0.isFinite && abs($0) <= 1 }, "sin saturar ni NaN")
    let rate = Int(WhipSound.sampleRate)
    check(a.count > rate / 2 && a.count < rate * 2, "dura entre medio y dos segundos")
    // El pico (el chasquido) llega despues del zumbido, no al principio.
    let peak = a.indices.max { abs(a[$0]) < abs(a[$1]) }!
    check(Double(peak) / Double(rate) > 0.15, "el chasquido llega despues del zumbido")
    let fast = WhipSound(speed: 2, combo: 1, level: 1).render(random: &random)
    let slow = WhipSound(speed: 0, combo: 1, level: 1).render(random: &random)
    func crackTime(_ s: [Float]) -> Int { s.indices.max { abs(s[$0]) < abs(s[$1]) }! }
    check(crackTime(fast) < crackTime(slow), "un tiron rapido truena antes (zumbido mas corto)")
}

test("objetivos: el effort solo sube sobre donde vive Claude Code") {
    check(TargetApps.isClaudeHost("Code"), "VS Code")
    check(TargetApps.isClaudeHost("iTerm2") && TargetApps.isClaudeHost("Terminal") && TargetApps.isClaudeHost("Claude"), "terminales y Claude")
    check(!TargetApps.isClaudeHost("Safari") && !TargetApps.isClaudeHost(nil), "otras apps no")
}

test("el puente: latigazo, pedido de effort solo con sesion, presencia y modo") {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("latigo-app-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let files = BridgeFiles.standard(environment: ["LATIGO_HOME": dir.path])
    check(files.dir.lastPathComponent == ".claude-latigo", "carpeta del puente")
    let bridge = Bridge(files: files)
    let now = Date()

    // Sin sesion viva: cuenta, pero no pide effort.
    var result = bridge.recordLash(target: .effort, combo: 1, now: now, known: Stats())
    check(result.stats.total == 1 && !result.effortRequested && bridge.readEffortSeq() == 0, "sin sesion no pide effort")

    // Con sesion viva: pide un nivel mas.
    bridge.write(["at": now.timeIntervalSince1970 * 1000, "model": "claude-opus-5-5", "effort": "medium", "boost": NSNull()], to: files.presence)
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

    bridge.writeDesktopPresence(at: 123, whipMode: true)
    let desktop = bridge.readObject(files.desktop)
    check(desktop?["whipMode"] as? Bool == true && (desktop?["at"] as? NSNumber)?.doubleValue == 123, "presencia de la app")

    bridge.write(["seq": 4, "active": true], to: files.whipMode)
    check(bridge.readWhipModeRequest().map { $0.seq == 4 && $0.active } == true, "pedido del modo latigo")

    bridge.writeConfig(LatigoConfig(enabled: false, sound: true))
    check(bridge.readConfig() == LatigoConfig(enabled: false, sound: true), "config")
    try! Data("[]".utf8).write(to: files.config)
    check(bridge.readConfig() == LatigoConfig(), "config rota: valores por defecto")
}

print("\n\(passed) comprobaciones pasan, \(failures) fallan")
exit(failures == 0 ? 0 : 1)
