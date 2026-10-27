// Dibuja el latigo y los efectos del golpe en un CGContext. Lo usan las ventanas
// transparentes de la pantalla y el modo demo que genera las capturas.
//
// El latigo: el mango rigido en la mano (el pomo en el puntero), la cuerda trenzada
// que se afina hacia la punta, la tralla (el ultimo tramo, mas claro y delgado) y el
// remate deshilachado. En el
// latigazo quedan estelas de la cuerda; en el golpe, la raya de la punta al dar la
// vuelta, la V de la onda de choque, el destello, las chispas y los gritos.

import AppKit

struct Scene {
    var rope: Rope
    var effects: Effects
    var look: Look
    var level: Int
    var showWhip: Bool
    var reducedMotion = false
}

enum Renderer {
    /// Lo que se agrega alrededor de la cuerda para el mango, el brillo y el grosor.
    static let margin = 110.0

    /// Dibuja `scene` en `context`; `origin` es la esquina (en coordenadas de pantalla)
    /// del area que cubre el contexto.
    static func draw(_ scene: Scene, in context: CGContext, origin: Vec) {
        func p(_ v: Vec) -> CGPoint { CGPoint(x: v.x - origin.x, y: v.y - origin.y) }
        let glow = color(scene.look.glow)

        if scene.showWhip {
            if !scene.reducedMotion { drawGhosts(scene, in: context, p: p) }
            drawWhip(scene.rope.points, hand: scene.rope.hand, look: scene.look, level: scene.level, in: context, p: p)
        }
        drawEffects(scene.effects, glow: glow, in: context, p: p)
    }

    /// El rectangulo (en coordenadas de pantalla) donde cae la cuerda, para redibujar solo eso.
    static func whipBounds(_ rope: Rope) -> CGRect {
        let xs = rope.points.map(\.x) + [rope.hand.x], ys = rope.points.map(\.y) + [rope.hand.y]
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return .null }
        return CGRect(x: minX - margin, y: minY - margin, width: maxX - minX + 2 * margin, height: maxY - minY + 2 * margin)
    }

    // MARK: El latigo

    private static func drawGhosts(_ scene: Scene, in context: CGContext, p: (Vec) -> CGPoint) {
        let glow = color(scene.look.glow)
        let lash = color(scene.look.lash)
        context.saveGState()
        context.setLineCap(.round)
        context.setLineJoin(.round)
        for (k, ghost) in scene.rope.ghosts.enumerated() {
            let fresh = Double(k + 1) / Double(scene.rope.ghosts.count + 1)
            let path = CGMutablePath()
            let smooth = smoothed(ghost)
            path.move(to: p(smooth[0]))
            for point in smooth.dropFirst() { path.addLine(to: p(point)) }
            context.addPath(path)
            context.setStrokeColor((lash.blended(withFraction: 0.5, of: glow) ?? lash).withAlphaComponent(CGFloat(0.05 + 0.16 * fresh)).cgColor)
            context.setLineWidth(CGFloat(1.5 + 2.5 * fresh))
            context.strokePath()
        }
        context.restoreGState()
    }

    static func drawWhip(_ raw: [Vec], hand: Vec, look: Look, level: Int, in context: CGContext, p: (Vec) -> CGPoint) {
        let lash = color(look.lash)
        let glow = color(look.glow)
        let handleColor = color(look.handle)
        let points = smoothed(raw)
        let count = points.count
        guard count >= 4 else { return }
        let glowBlur = level >= 3 ? CGFloat(3 + Double(level) * 1.3) : 0
        func width(_ u: Double) -> Double { 1.1 + 5.6 * pow(u, 0.8) }
        func normal(_ i: Int) -> Vec { (points[min(i + 1, count - 1)] - points[max(i - 1, 0)]).normalized.perpendicular }
        let fallEnd = Int(Double(count) * 0.14)

        // Mango: del pomo, en la mano, a donde nace la cuerda.
        let root = points[count - 1]
        let direction = (root - hand).length > 1e-6 ? (root - hand).normalized : Vec(x: 0, y: 1)
        context.saveGState()
        context.setLineCap(.round)
        context.setShadow(offset: .zero, blur: glowBlur * 0.6, color: glow.withAlphaComponent(0.45).cgColor)
        context.setStrokeColor(handleColor.cgColor)
        context.setLineWidth(11)
        context.move(to: p(hand))
        context.addLine(to: p(root))
        context.strokePath()
        context.setShadow(offset: .zero, blur: 0, color: nil)
        context.setStrokeColor((handleColor.blended(withFraction: 0.45, of: .black) ?? handleColor).cgColor)
        context.setLineWidth(2)
        let across = direction.perpendicular
        let reach = (root - hand).length
        for k in 1...5 {
            let c = hand + direction * (reach * (0.18 + 0.13 * Double(k)))
            context.move(to: p(c + across * 5.5))
            context.addLine(to: p(c - across * 5.5))
        }
        context.strokePath()
        context.setFillColor(glow.withAlphaComponent(level >= 9 ? 1 : 0.85).cgColor)
        context.fillEllipse(in: CGRect(x: p(hand).x - 6.5, y: p(hand).y - 6.5, width: 13, height: 13))
        context.restoreGState()

        // Cuerda: una cinta que se afina hacia la punta (de la tralla al mango).
        context.saveGState()
        if glowBlur > 0 { context.setShadow(offset: .zero, blur: glowBlur, color: glow.withAlphaComponent(0.7).cgColor) }
        let ribbon = CGMutablePath()
        var left: [Vec] = [], right: [Vec] = []
        for i in fallEnd..<count {
            let u = Double(i) / Double(count - 1)
            let half = width(u) / 2
            left.append(points[i] + normal(i) * half)
            right.append(points[i] - normal(i) * half)
        }
        ribbon.move(to: p(left[0]))
        for point in left.dropFirst() { ribbon.addLine(to: p(point)) }
        for point in right.reversed() { ribbon.addLine(to: p(point)) }
        ribbon.closeSubpath()
        context.addPath(ribbon)
        context.setFillColor(lash.cgColor)
        context.fillPath()
        context.restoreGState()

        // Volumen: un brillo a lo largo de un costado.
        context.saveGState()
        context.setLineCap(.round)
        context.setLineJoin(.round)
        let shine = CGMutablePath()
        for i in fallEnd..<count {
            let u = Double(i) / Double(count - 1)
            let point = p(points[i] + normal(i) * (width(u) * 0.22))
            if i == fallEnd { shine.move(to: point) } else { shine.addLine(to: point) }
        }
        context.addPath(shine)
        context.setStrokeColor((lash.blended(withFraction: 0.55, of: .white) ?? lash).withAlphaComponent(0.35).cgColor)
        context.setLineWidth(1)
        context.strokePath()

        // Trenzado: marcas en diagonal en la parte gruesa.
        context.setStrokeColor((lash.blended(withFraction: 0.45, of: .black) ?? lash).withAlphaComponent(0.55).cgColor)
        context.setLineWidth(0.9)
        var i = Int(Double(count) * 0.24)
        while i < count - 2 {
            let u = Double(i) / Double(count - 1)
            let half = width(u) / 2
            let forward = (points[i + 1] - points[i]).normalized
            context.move(to: p(points[i] + normal(i) * half))
            context.addLine(to: p(points[i] - normal(i) * half + forward * (half * 1.2)))
            i += 2
        }
        context.strokePath()

        // Tralla: el ultimo tramo, delgado y mas claro.
        let fall = CGMutablePath()
        fall.move(to: p(points[0]))
        for k in 1...max(1, fallEnd) { fall.addLine(to: p(points[min(k, count - 1)])) }
        context.addPath(fall)
        context.setShadow(offset: .zero, blur: glowBlur * 0.5, color: glow.withAlphaComponent(0.6).cgColor)
        context.setStrokeColor((lash.blended(withFraction: 0.35, of: glow) ?? lash).cgColor)
        context.setLineWidth(1.3)
        context.strokePath()

        // Remate: unos pelos sueltos en la punta.
        let tip = points[0]
        let back = (points[2] - tip).normalized
        context.setStrokeColor(glow.withAlphaComponent(0.9).cgColor)
        context.setLineWidth(0.9)
        for angle in [-0.55, -0.18, 0.18, 0.55] {
            let d = Vec(x: back.x * cos(angle) - back.y * sin(angle), y: back.x * sin(angle) + back.y * cos(angle))
            context.move(to: p(tip))
            context.addLine(to: p(tip - d * (7 + abs(angle) * 4)))
        }
        context.strokePath()
        context.restoreGState()
    }

    /// Catmull-Rom: la cuerda sin esquinas.
    static func smoothed(_ points: [Vec], subdivisions: Int = 3) -> [Vec] {
        guard points.count > 2 else { return points }
        var out: [Vec] = []
        out.reserveCapacity((points.count - 1) * subdivisions + 1)
        for i in 0..<(points.count - 1) {
            let p0 = points[max(i - 1, 0)], p1 = points[i], p2 = points[i + 1], p3 = points[min(i + 2, points.count - 1)]
            for k in 0..<subdivisions {
                let t = Double(k) / Double(subdivisions)
                let t2 = t * t, t3 = t2 * t
                func axis(_ a: Double, _ b: Double, _ c: Double, _ d: Double) -> Double {
                    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
                }
                out.append(Vec(x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y)))
            }
        }
        out.append(points[points.count - 1])
        return out
    }

    // MARK: Efectos

    private static func drawEffects(_ effects: Effects, glow: NSColor, in context: CGContext, p: (Vec) -> CGPoint) {
        // La raya de la punta al dar la vuelta.
        for streak in effects.streaks {
            let k = 1 - streak.age / streak.life
            let path = CGMutablePath()
            path.move(to: p(streak.points[0]))
            for point in streak.points.dropFirst() { path.addLine(to: p(point)) }
            context.saveGState()
            context.setLineCap(.round)
            context.setLineJoin(.round)
            context.setShadow(offset: .zero, blur: 10, color: glow.withAlphaComponent(CGFloat(0.9 * k)).cgColor)
            context.addPath(path)
            context.setStrokeColor(NSColor.white.withAlphaComponent(CGFloat(0.85 * k)).cgColor)
            context.setLineWidth(CGFloat(1 + 2.4 * k))
            context.strokePath()
            context.restoreGState()
        }

        // Destello.
        if let age = effects.flashAge {
            let k = 1 - age / 0.12
            let center = p(effects.flashCenter)
            let radius = CGFloat(18 + 36 * (1 - k))
            let colors = [NSColor.white.withAlphaComponent(CGFloat(0.95 * k)).cgColor, glow.withAlphaComponent(CGFloat(0.55 * k)).cgColor, glow.withAlphaComponent(0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.35, 1]) {
                context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius * 1.8, options: [])
            }
        }

        // La V de la onda de choque: se abre hacia atras de la punta.
        for cone in effects.cones {
            let k = cone.age / cone.life
            let back = cone.direction * -1
            let reach = cone.size * (0.55 + 0.45 * k)
            context.saveGState()
            context.setLineCap(.round)
            context.setStrokeColor(NSColor.white.withAlphaComponent(CGFloat(0.75 * (1 - k))).cgColor)
            context.setLineWidth(CGFloat(2 * (1 - k) + 0.6))
            for angle in [-0.5, 0.5] {
                let d = Vec(x: back.x * cos(angle) - back.y * sin(angle), y: back.x * sin(angle) + back.y * cos(angle))
                context.move(to: p(cone.tip + d * (reach * 0.15)))
                context.addLine(to: p(cone.tip + d * reach))
            }
            context.strokePath()
            context.restoreGState()
        }

        // Ondas.
        for ring in effects.rings {
            let k = ring.age / ring.life
            let eased = 1 - pow(1 - k, 3)
            let radius = CGFloat(ring.maxRadius * eased)
            context.setStrokeColor(glow.withAlphaComponent(CGFloat(0.8 * (1 - k))).cgColor)
            context.setLineWidth(CGFloat(3.5 * (1 - k) + 0.5))
            let c = p(ring.center)
            context.strokeEllipse(in: CGRect(x: c.x - radius, y: c.y - radius, width: radius * 2, height: radius * 2))
        }

        // Chispas.
        for particle in effects.particles {
            let k = 1 - particle.age / particle.life
            let c = p(particle.position)
            let tint = particle.hot ? NSColor.white : glow
            if let glyph = particle.glyph {
                let font = NSFont.systemFont(ofSize: CGFloat(9 + particle.size * 3), weight: .bold)
                drawText(glyph, at: c, font: font, color: tint.withAlphaComponent(CGFloat(k)), in: context, shadow: nil)
            } else {
                context.setFillColor(tint.withAlphaComponent(CGFloat(k)).cgColor)
                let s = CGFloat(particle.size)
                context.fillEllipse(in: CGRect(x: c.x - s / 2, y: c.y - s / 2, width: s, height: s))
            }
        }

        // Gritos: el ¡CHAS! del nivel y el combo.
        for shout in effects.shouts {
            let k = shout.age / shout.life
            let pop = k < 0.15 ? 0.6 + 0.4 * (k / 0.15) * 1.15 : 1.0
            let alpha = k < 0.7 ? 1.0 : 1 - (k - 0.7) / 0.3
            let size = CGFloat((shout.isCombo ? 24 : 30) * pop)
            let font = NSFont.systemFont(ofSize: size, weight: .black)
            let tint = shout.isCombo ? comboColor(shout.text) : glow
            drawText(shout.text, at: p(shout.center + Vec(x: 0, y: 26 * k)), font: font, color: tint.withAlphaComponent(CGFloat(alpha)), in: context,
                     shadow: NSColor.black.withAlphaComponent(0.6 * CGFloat(alpha)))
        }

        // "effort ▲ high": lo que el latigazo le hizo al effort.
        for badge in effects.badges {
            let k = badge.age / badge.life
            let alpha = CGFloat(k < 0.08 ? k / 0.08 : (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1))
            let center = p(badge.center + Vec(x: 0, y: badge.lift + 18 * k))
            let font = NSFont.systemFont(ofSize: badge.isMuted ? 13 : 17, weight: badge.isMuted ? .semibold : .heavy)
            let text = badge.isMuted ? NSColor(white: 0.82, alpha: alpha) : glow.withAlphaComponent(alpha)
            pill(badge.text, subtitle: nil, at: center, font: font, color: text, border: badge.isMuted ? NSColor(white: 1, alpha: 0.18 * alpha) : glow.withAlphaComponent(0.8 * alpha),
                 alpha: alpha, in: context)
        }

        // Aviso de prendido o apagado, junto al puntero.
        if let hud = effects.hud {
            let k = hud.age / hud.life
            let alpha = CGFloat(k < 0.06 ? k / 0.06 : (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1))
            let center = p(hud.anchor + Vec(x: 0, y: 64))
            pill(hud.title, subtitle: hud.subtitle, at: center, font: NSFont.systemFont(ofSize: 16, weight: .bold), color: NSColor.white.withAlphaComponent(alpha),
                 border: glow.withAlphaComponent(0.7 * alpha), alpha: alpha, in: context)
        }
    }

    // MARK: Ayudas

    static func color(_ rgb: RGB) -> NSColor {
        NSColor(srgbRed: CGFloat(rgb.r / 255), green: CGFloat(rgb.g / 255), blue: CGFloat(rgb.b / 255), alpha: 1)
    }

    private static func comboColor(_ text: String) -> NSColor {
        let combo = Int(text.dropFirst().prefix { $0.isNumber }) ?? 2
        switch combo {
        case 10...: return NSColor(srgbRed: 1, green: 0.42, blue: 0.95, alpha: 1)
        case 5...: return NSColor(srgbRed: 1, green: 0.36, blue: 0.3, alpha: 1)
        case 3...: return NSColor(srgbRed: 1, green: 0.85, blue: 0.2, alpha: 1)
        default: return NSColor(srgbRed: 1, green: 0.72, blue: 0.2, alpha: 1)
        }
    }

    /// Una pastilla oscura con texto (y un subtitulo opcional) centrada en `center`.
    private static func pill(_ title: String, subtitle: String?, at center: CGPoint, font: NSFont, color: NSColor, border: NSColor, alpha: CGFloat, in context: CGContext) {
        let titleString = NSAttributedString(string: title, attributes: [.font: font, .foregroundColor: color])
        let subtitleString = subtitle.map {
            NSAttributedString(string: $0, attributes: [.font: NSFont.systemFont(ofSize: 12, weight: .medium), .foregroundColor: NSColor(white: 0.85, alpha: alpha)])
        }
        let titleSize = titleString.size()
        let subtitleSize = subtitleString?.size() ?? .zero
        let width = max(titleSize.width, subtitleSize.width) + 28
        let height = titleSize.height + (subtitleString == nil ? 0 : subtitleSize.height + 2) + 14
        let box = CGRect(x: center.x - width / 2, y: center.y - height / 2, width: width, height: height)
        context.saveGState()
        context.addPath(CGPath(roundedRect: box, cornerWidth: height / 2.4, cornerHeight: height / 2.4, transform: nil))
        context.setFillColor(NSColor(white: 0.06, alpha: 0.78 * alpha).cgColor)
        context.fillPath()
        context.addPath(CGPath(roundedRect: box.insetBy(dx: 0.5, dy: 0.5), cornerWidth: height / 2.4, cornerHeight: height / 2.4, transform: nil))
        context.setStrokeColor(border.cgColor)
        context.setLineWidth(1)
        context.strokePath()
        context.restoreGState()
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        let top = box.maxY - 7 - titleSize.height
        titleString.draw(at: CGPoint(x: center.x - titleSize.width / 2, y: top))
        subtitleString?.draw(at: CGPoint(x: center.x - subtitleSize.width / 2, y: top - subtitleSize.height - 2))
        NSGraphicsContext.restoreGraphicsState()
    }

    private static func drawText(_ text: String, at center: CGPoint, font: NSFont, color: NSColor, in context: CGContext, shadow: NSColor?) {
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let string = NSAttributedString(string: text, attributes: attributes)
        let size = string.size()
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        if let shadow {
            let s = NSShadow()
            s.shadowColor = shadow
            s.shadowBlurRadius = 6
            s.shadowOffset = NSSize(width: 0, height: -1)
            s.set()
        }
        string.draw(at: CGPoint(x: center.x - size.width / 2, y: center.y - size.height / 2))
        NSGraphicsContext.restoreGraphicsState()
    }
}
