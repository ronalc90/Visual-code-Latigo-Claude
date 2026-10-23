// Dibuja el latigo y los efectos del golpe en un CGContext. Lo usan las ventanas
// transparentes de la pantalla y el modo demo que genera las capturas.

import AppKit

struct Scene {
    var rope: Rope
    var effects: Effects
    var look: Look
    var level: Int
    var showWhip: Bool
}

enum Renderer {
    /// Dibuja `scene` en `context`; `origin` es la esquina (en coordenadas de pantalla)
    /// del area que cubre el contexto.
    static func draw(_ scene: Scene, in context: CGContext, origin: Vec) {
        func p(_ v: Vec) -> CGPoint { CGPoint(x: v.x - origin.x, y: v.y - origin.y) }
        let lash = color(scene.look.lash)
        let glow = color(scene.look.glow)
        let handleColor = color(scene.look.handle)

        if scene.showWhip {
            let points = scene.rope.points
            let glowBlur = scene.level >= 3 ? CGFloat(3 + Double(scene.level) * 1.3) : 0

            // Mango: sigue la direccion de la cuerda mas alla del ultimo punto.
            let handle = points[points.count - 1]
            let before = points[points.count - 3]
            let direction = (handle - before).normalized
            let grip = handle + direction * 64
            context.saveGState()
            context.setLineCap(.round)
            context.setShadow(offset: .zero, blur: glowBlur * 0.6, color: glow.withAlphaComponent(0.45).cgColor)
            context.setStrokeColor(handleColor.cgColor)
            context.setLineWidth(11)
            context.move(to: p(handle))
            context.addLine(to: p(grip))
            context.strokePath()
            // Amarres del mango.
            context.setShadow(offset: .zero, blur: 0, color: nil)
            context.setStrokeColor(handleColor.blended(withFraction: 0.45, of: .black)?.cgColor ?? handleColor.cgColor)
            context.setLineWidth(2)
            let normal = direction.perpendicular
            for k in 1...5 {
                let c = handle + direction * (Double(k) * 11)
                context.move(to: p(c + normal * 5.5))
                context.addLine(to: p(c - normal * 5.5))
            }
            context.strokePath()
            context.setFillColor(glow.withAlphaComponent(scene.level >= 9 ? 1 : 0.85).cgColor)
            context.fillEllipse(in: CGRect(x: p(grip).x - 6.5, y: p(grip).y - 6.5, width: 13, height: 13))
            context.restoreGState()

            // Cuerda: se afina hacia la punta; brillo segun el nivel.
            context.saveGState()
            context.setLineCap(.round)
            context.setLineJoin(.round)
            if glowBlur > 0 { context.setShadow(offset: .zero, blur: glowBlur, color: glow.withAlphaComponent(0.7).cgColor) }
            for i in stride(from: points.count - 1, to: 0, by: -1) {
                let t = Double(i) / Double(points.count - 1)
                context.setStrokeColor(lash.blended(withFraction: CGFloat((1 - t) * 0.25), of: glow)?.cgColor ?? lash.cgColor)
                context.setLineWidth(CGFloat(1.3 + 5.2 * t))
                context.move(to: p(points[i]))
                context.addLine(to: p(points[i - 1]))
                context.strokePath()
            }
            // Trenzado: marcas oscuras cada pocos tramos.
            context.setShadow(offset: .zero, blur: 0, color: nil)
            context.setStrokeColor(lash.blended(withFraction: 0.4, of: .black)?.withAlphaComponent(0.55).cgColor ?? lash.cgColor)
            context.setLineWidth(1)
            for i in stride(from: 3, to: points.count - 1, by: 2) {
                let d = (points[i + 1] - points[i - 1]).normalized.perpendicular
                let w = 0.6 + 2.2 * Double(i) / Double(points.count - 1)
                context.move(to: p(points[i] + d * w))
                context.addLine(to: p(points[i] - d * w))
            }
            context.strokePath()
            // La mecha de la punta: unos pelos sueltos.
            let tip = points[0]
            let back = (points[1] - tip).normalized
            context.setStrokeColor(glow.withAlphaComponent(0.9).cgColor)
            context.setLineWidth(1)
            for angle in [-0.5, 0.0, 0.5] {
                let d = Vec(x: back.x * cos(angle) - back.y * sin(angle), y: back.x * sin(angle) + back.y * cos(angle))
                context.move(to: p(tip))
                context.addLine(to: p(tip - d * 9))
            }
            context.strokePath()
            context.restoreGState()
        }

        // Destello.
        if let age = scene.effects.flashAge {
            let k = 1 - age / 0.12
            let center = p(scene.effects.flashCenter)
            let radius = CGFloat(18 + 36 * (1 - k))
            let colors = [NSColor.white.withAlphaComponent(CGFloat(0.95 * k)).cgColor, glow.withAlphaComponent(CGFloat(0.55 * k)).cgColor, glow.withAlphaComponent(0).cgColor] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.35, 1]) {
                context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius * 1.8, options: [])
            }
        }

        // Ondas de choque.
        for ring in scene.effects.rings {
            let k = ring.age / ring.life
            let eased = 1 - pow(1 - k, 3)
            let radius = CGFloat(ring.maxRadius * eased)
            context.setStrokeColor(glow.withAlphaComponent(CGFloat(0.8 * (1 - k))).cgColor)
            context.setLineWidth(CGFloat(3.5 * (1 - k) + 0.5))
            let c = p(ring.center)
            context.strokeEllipse(in: CGRect(x: c.x - radius, y: c.y - radius, width: radius * 2, height: radius * 2))
        }

        // Chispas.
        for particle in scene.effects.particles {
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
        for shout in scene.effects.shouts {
            let k = shout.age / shout.life
            let pop = k < 0.15 ? 0.6 + 0.4 * (k / 0.15) * 1.15 : 1.0
            let alpha = k < 0.7 ? 1.0 : 1 - (k - 0.7) / 0.3
            let size = CGFloat((shout.isCombo ? 24 : 30) * pop)
            let font = NSFont.systemFont(ofSize: size, weight: .black)
            let tint = shout.isCombo ? comboColor(shout.text) : glow
            let rise = Vec(x: 0, y: 26 * k)
            drawText(shout.text, at: p(shout.center + rise), font: font, color: tint.withAlphaComponent(CGFloat(alpha)), in: context,
                     shadow: NSColor.black.withAlphaComponent(0.6 * CGFloat(alpha)))
        }
    }

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
