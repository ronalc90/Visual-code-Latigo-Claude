// El sonido sintetico del latigo (estilos "aire" y "suave"), calibrado con 6
// grabaciones reales (scripts/sonidos_reales.py). Un latigo real no hace "crash":
//  - el zumbido antes del golpe casi no se oye (en las grabaciones queda 40 a 60
//    dB por debajo del golpe); aqui queda un poco mas alto para que el "fffff" se
//    alcance a oir;
//  - el golpe: la punta (o el bucle) pasa la barrera del sonido y suelta una onda
//    de choque en N de menos de un milisegundo, mas un rafagazo de ruido que
//    cubre todas las frecuencias, centrado en 4,5-5,5 kHz y sin graves. A veces
//    el chasquido es doble;
//  - la cola: un siseo agudo que se apaga en 120 a 500 ms. Es el "suufff" del
//    aire roto;
//  - un par de reflejos cortos del suelo. Nada de golpe grave, tono ni eco largo.
// En la app cambia con el movimiento: mas rapido, mas fuerte y con mas cola; un
// zigzag da el chasquido doble.

import Foundation

struct WhipSound {
    enum Character: Equatable { case aire, suave }

    /// Segundos desde que empieza hasta el golpe (lo que dura el zumbido).
    var crackAt: Double
    /// 0 quieto · 1 normal · 2 tiron rapido.
    var speed: Double
    /// nil: al azar, una de cada cuatro veces.
    var isDouble: Bool? = nil
    /// Segundos entre los dos chasquidos (nil: de 12 a 25 ms, como en las grabaciones).
    var doubleGap: Double? = nil
    var character: Character = .aire

    static let sampleRate = 44_100.0

    /// Lo que tarda la cola en bajar 40 dB.
    var tailSeconds: Double {
        character == .suave ? 0.12 : 0.2 + 0.12 * min(2, max(0, speed))
    }

    /// Las muestras (mono, -1…1). El golpe cae en `crackAt`.
    func render(random: inout SeededRandom) -> [Float] {
        let rate = WhipSound.sampleRate
        let speed = min(2, max(0, self.speed))
        let isSoft = character == .suave
        let crackIndex = max(1, Int((max(0, crackAt) * rate).rounded()))
        let tail = tailSeconds * (0.85 + 0.3 * random.next())
        var out = [Double](repeating: 0, count: crackIndex + Int(rate * (tail + 0.12)))

        // 1. Zumbido: ruido en una banda que sube de tono mientras la punta acelera.
        var swish = BandPass()
        let startHz = 320 + random.next() * 160
        let endHz = 2000 + 500 * speed + random.next() * 400
        let swishLevel = (isSoft ? 0.03 : 0.2) * (0.8 + 0.2 * speed)
        for i in 0..<crackIndex {
            let t = Double(i) / Double(crackIndex)
            let frequency = startHz * pow(endHz / startHz, t)
            out[i] += swish.process(random.next() * 2 - 1, frequency: frequency, q: 1.1, rate: rate) * pow(t, 2.4) * swishLevel
        }

        // 2. El golpe y, a veces, un segundo chasquido.
        let crackGain = 1.0 + 0.08 * speed + random.next() * 0.1
        addCrack(into: &out, at: crackIndex, gain: crackGain, random: &random)
        if isDouble ?? (random.next() < 0.25), !isSoft {
            let gap = Int(rate * (doubleGap ?? (0.012 + random.next() * 0.013)))
            addCrack(into: &out, at: crackIndex + gap, gain: crackGain * (0.45 + random.next() * 0.2), random: &random)
        }

        // 3. La cola: el siseo del aire, agudo, que se apaga solo.
        var hiss = BandPass(), air = BandPass()
        let hissHz = 3600 + random.next() * 1000
        let decay = tail / log(100.0)
        let hissLevel = (isSoft ? 0.2 : 0.36) * (0.85 + 0.15 * speed) * (0.9 + 0.2 * random.next())
        let tailStart = crackIndex + Int(rate * 0.0015)
        for i in 0..<(out.count - tailStart) {
            let t = Double(i) / rate
            let noise = random.next() * 2 - 1
            let filtered = hiss.process(noise, frequency: hissHz, q: 0.6, rate: rate) + air.process(noise, frequency: hissHz * 2.1, q: 0.8, rate: rate) * 0.45
            out[tailStart + i] += filtered * min(1, t / 0.004) * exp(-t / decay) * hissLevel
        }

        // 4. Reflejos cortos del suelo (al aire libre no hay eco largo).
        let dry = out
        let window = min(dry.count, crackIndex + Int(rate * 0.03))
        for (delay, gain) in [(0.009 + random.next() * 0.005, 0.2), (0.019 + random.next() * 0.009, 0.1)] {
            let offset = Int(rate * delay)
            for i in crackIndex..<window where i + offset < out.count { out[i + offset] += dry[i] * gain }
        }

        // Como en una grabacion: arriba de ~8 kHz el aire y el microfono se comen los agudos.
        var lowPass = (LowPass(), LowPass())
        for i in out.indices {
            out[i] = lowPass.1.process(lowPass.0.process(out[i], frequency: 8500, rate: rate), frequency: 8500, rate: rate)
        }

        // Bordes suaves y nivel final: el golpe queda en -1,5 dBFS (suave, en -12).
        let fadeIn = min(Int(rate * 0.005), crackIndex)
        for i in 0..<fadeIn { out[i] *= Double(i) / Double(fadeIn) }
        let fadeOut = min(Int(rate * 0.04), out.count)
        for i in 0..<fadeOut { out[out.count - 1 - i] *= Double(i) / Double(fadeOut) }
        let peak = max(out.map(abs).max() ?? 1, 0.0001)
        let target = pow(10, (isSoft ? -12.0 : -1.5) / 20)
        return out.map { Float($0 / peak * target) }
    }

    /// La onda de choque: una N de 0,5 a 1 ms (le da el cuerpo) mas un rafagazo de
    /// ruido muy corto centrado en 3-4 kHz.
    private func addCrack(into out: inout [Double], at start: Int, gain: Double, random: inout SeededRandom) {
        let rate = WhipSound.sampleRate
        let nSamples = max(4, Int(rate * (0.0005 + random.next() * 0.0005)))
        for i in 0..<nSamples where start + i < out.count {
            out[start + i] += gain * (1 - 2 * Double(i) / Double(nSamples - 1))
        }
        var low = BandPass(), high = BandPass()
        let center = 2800 + random.next() * 1000
        let decay = 0.002 + random.next() * 0.002
        for i in 0..<Int(rate * 0.04) where start + i < out.count {
            let t = Double(i) / rate
            let noise = random.next() * 2 - 1
            let burst = low.process(noise, frequency: center, q: 0.5, rate: rate) * 2.4 + high.process(noise, frequency: center * 1.8, q: 0.8, rate: rate) * 0.5
            out[start + i] += burst * exp(-t / decay) * gain
        }
    }
}

extension WhipSound {
    /// El zumbido de la cuerda cuando se mueve rapido sin golpear: aire que sube y baja.
    static func pass(speed: Double, random: inout SeededRandom) -> [Float] {
        let rate = sampleRate
        let fast = min(1, max(0, speed - 1))
        let count = Int(rate * (0.2 - 0.05 * fast))
        var band = BandPass()
        let peakHz = 900 + 900 * fast + random.next() * 300
        var out = [Float](repeating: 0, count: count)
        for i in 0..<count {
            let t = Double(i) / Double(count)
            let envelope = sin(Double.pi * t) * sin(Double.pi * t)
            let frequency = 250 + (peakHz - 250) * sin(Double.pi * t)
            out[i] = Float(band.process(random.next() * 2 - 1, frequency: frequency, q: 1.4, rate: rate) * envelope * 0.5)
        }
        return out
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

/// Pasabajos de segundo orden (RBJ, Butterworth).
struct LowPass {
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    mutating func process(_ x: Double, frequency: Double, rate: Double) -> Double {
        let w0 = 2 * Double.pi * min(frequency, rate * 0.45) / rate
        let alpha = sin(w0) / (2 * 0.7071)
        let cosine = cos(w0)
        let a0 = 1 + alpha, a1 = -2 * cosine, a2 = 1 - alpha
        let b0 = (1 - cosine) / 2, b1 = 1 - cosine
        let y = (b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0
        x2 = x1; x1 = x
        y2 = y1; y1 = y
        return y.isFinite ? y : 0
    }
}

/// Escribe un WAV mono de 16 bits (lo usa `--render-sounds`).
enum WavFile {
    static func data(_ samples: [Float], rate: Int = Int(WhipSound.sampleRate)) -> Data {
        var data = Data()
        func append<T: FixedWidthInteger>(_ value: T) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }
        let bytes = samples.count * 2
        data.append(contentsOf: Array("RIFF".utf8)); append(UInt32(36 + bytes))
        data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); append(UInt32(16)); append(UInt16(1)); append(UInt16(1))
        append(UInt32(rate)); append(UInt32(rate * 2)); append(UInt16(2)); append(UInt16(16))
        data.append(contentsOf: Array("data".utf8)); append(UInt32(bytes))
        for sample in samples { append(Int16((max(-1, min(1, Double(sample))) * 32767).rounded())) }
        return data
    }
}
