// El sonido de cada latigazo se sintetiza en el momento: nunca suena igual.
//
// Como suena un latigo real:
//  - el zumbido: el aire que corta la cuerda mientras la punta acelera (el
//    afinamiento de la cuerda la acelera 30 a 40 veces); sube de tono y de volumen;
//  - el chasquido: la punta (o el bucle que viaja por la cuerda) pasa la barrera
//    del sonido, ~Mach 2 durante ~1,2 ms, y suelta una onda de choque: una onda
//    en N de menos de un milisegundo, mas un rafagazo de ruido agudo y un "snap";
//  - a veces un segundo chasquido (el bucle y la punta), la caida de la cuerda
//    y el eco del lugar.
// Lo que cambia en cada latigazo: la velocidad del movimiento (zumbido mas corto,
// agudo y fuerte), la duracion de la onda de choque (el timbre), el snap, el doble
// chasquido, el eco; el combo lo hace mas brillante y los niveles altos le suman
// un destello dorado.

import Foundation

struct WhipSound {
    /// 0 quieto · 1 normal · 2 tiron rapido.
    var speed: Double
    var combo: Int
    var level: Int

    static let sampleRate = 44_100.0

    /// Las muestras (mono, -1…1) de este latigazo.
    func render(random: inout SeededRandom) -> [Float] {
        let rate = WhipSound.sampleRate
        let speed = min(2, max(0, self.speed))
        let fast = min(1, speed)
        let comboLift = 1 + min(0.3, 0.03 * Double(max(0, combo - 1)))
        var out: [Double] = []

        // 1. Zumbido.
        let swooshSeconds = 0.34 - 0.13 * fast + (random.next() - 0.5) * 0.06
        let startHz = 150 + random.next() * 110
        let endHz = (2300 + 1700 * fast + random.next() * 500) * comboLift
        let n = Int(rate * swooshSeconds)
        var body = BandPass(), tipBand = BandPass()
        let loudness = 0.55 + 0.45 * fast
        for i in 0..<n {
            let t = Double(i) / Double(n)
            let noise = random.next() * 2 - 1
            let freq = startHz * pow(endHz / startHz, pow(t, 1.7))
            let s = body.process(noise, frequency: freq * 0.5, q: 1.3, rate: rate) * 0.8 + tipBand.process(noise, frequency: freq, q: 3.4, rate: rate) * 0.95
            out.append(s * pow(t, 2.1) * (0.25 + 0.75 * t) * loudness)
        }

        // 2. Chasquido (y a veces un segundo).
        let crackStart = out.count
        let tail = Int(rate * 0.55)
        out.append(contentsOf: [Double](repeating: 0, count: tail))
        let crackGain = (0.9 + 0.3 * fast + random.next() * 0.15) * (1 + 0.04 * Double(min(combo, 10)))
        addCrack(into: &out, at: crackStart, gain: crackGain, random: &random)
        let doubleChance = 0.28 + (speed > 1 ? 0.2 : 0)
        if random.next() < doubleChance {
            let gap = Int(rate * (0.008 + random.next() * 0.017))
            addCrack(into: &out, at: crackStart + gap, gain: crackGain * (0.35 + random.next() * 0.25), random: &random)
        }

        // 3. La caida de la cuerda: un "fwip" grave y corto.
        let fallStart = crackStart + Int(rate * (0.06 + random.next() * 0.06))
        var fall = BandPass()
        for i in 0..<Int(rate * 0.09) where fallStart + i < out.count {
            let t = Double(i) / rate
            out[fallStart + i] += fall.process(random.next() * 2 - 1, frequency: 420, q: 0.9, rate: rate) * exp(-t * 38) * 0.12
        }

        // 4. Destello dorado en los niveles altos.
        if level >= 8 {
            let pings = 2 + (level - 8)
            for _ in 0..<pings {
                let at = crackStart + Int(rate * (0.05 + random.next() * 0.3))
                let hz = 3000 + random.next() * 3000
                let amp = 0.025 + 0.01 * Double(level - 8)
                for i in 0..<Int(rate * 0.12) where at + i < out.count {
                    let t = Double(i) / rate
                    out[at + i] += sin(2 * Double.pi * hz * t) * exp(-t * 40) * amp
                }
            }
        }

        // 5. Eco del lugar: reflexiones con tiempos y pesos que cambian.
        let room = 0.6 + random.next() * 0.8
        let dry = out
        for k in 0..<6 {
            let delay = Int(rate * (0.015 + Double(k) * 0.028 * room + random.next() * 0.01))
            let gain = 0.3 * pow(0.68, Double(k)) * (0.8 + random.next() * 0.4)
            for i in crackStart..<min(dry.count, crackStart + Int(rate * 0.13)) where i + delay < out.count {
                out[i + delay] += dry[i] * gain
            }
        }

        // Bordes suaves y normalizacion.
        let fade = Int(rate * 0.004)
        for i in 0..<min(fade, out.count) {
            out[i] *= Double(i) / Double(fade)
            out[out.count - 1 - i] *= Double(i) / Double(fade)
        }
        let peak = out.map(abs).max() ?? 1
        return out.map { Float($0 / max(peak, 0.0001) * 0.92) }
    }

    /// La onda de choque: N de 0,25 a 0,9 ms, rafagazo agudo, snap tonal y golpe grave.
    private func addCrack(into out: inout [Double], at start: Int, gain: Double, random: inout SeededRandom) {
        let rate = WhipSound.sampleRate
        let nSamples = max(6, Int(rate * (0.00025 + random.next() * 0.00065)))
        let snapHz = 2200 + random.next() * 1600
        let snapDecay = 120 + random.next() * 100
        var previousIn = 0.0, previousOut = 0.0
        for i in 0..<Int(rate * 0.12) where start + i < out.count {
            let t = Double(i) / rate
            let nWave = i < nSamples ? 1 - 2 * Double(i) / Double(nSamples) : 0
            let noise = random.next() * 2 - 1
            let highPass = 0.97 * (previousOut + noise - previousIn)
            previousIn = noise
            previousOut = highPass
            let burst = highPass * exp(-t * (220 + random.next() * 60))
            let snap = sin(2 * Double.pi * snapHz * t) * exp(-t * snapDecay) * 0.5
            let thump = sin(2 * Double.pi * 170 * t) * exp(-t * 60) * 0.22
            out[start + i] += (nWave * 1.7 + burst + snap + thump) * gain
        }
    }
}

/// Pasabanda de segundo orden (RBJ) con frecuencia variable.
struct BandPass {
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    mutating func process(_ x: Double, frequency: Double, q: Double, rate: Double) -> Double {
        let w0 = 2 * Double.pi * min(frequency, rate * 0.45) / rate
        let alpha = sin(w0) / (2 * q)
        let a0 = 1 + alpha, a1 = -2 * cos(w0), a2 = 1 - alpha
        let y = (alpha * x - alpha * x2 - a1 * y1 - a2 * y2) / a0
        x2 = x1; x1 = x
        y2 = y1; y1 = y
        return y.isFinite ? y : 0
    }
}
