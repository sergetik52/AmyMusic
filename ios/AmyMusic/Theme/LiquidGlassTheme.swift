import SwiftUI
import CoreGraphics
import UIKit

// MARK: - Hex Color Extension

public extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch cleaned.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 131, 65, 239) // #8341EF default Amy Purple
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }

    static let amyPurple = Color(hex: "#8341EF")
    static let amyPurpleBright = Color(hex: "#A855F7")
    static let amyBackground = Color(hex: "#090909")
    static let amySurface = Color(hex: "#121212")
}

// MARK: - iOS 26 Liquid Glass Design System Wrappers & Modifiers

/// Provides native iOS 26 `.glassEffect(...)` and `GlassEffectContainer` styling
/// tailored to AmyMusic's dark obsidian + neon palette aesthetic.
public struct AmyLiquidGlassCardModifier<S: Shape>: ViewModifier {
    public var shape: S
    public var tintColor: Color?
    public var tintOpacity: Double
    public var isInteractive: Bool

    public func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            if let tintColor {
                content
                    .glassEffect(
                        isInteractive
                            ? .regular.tint(tintColor.opacity(tintOpacity)).interactive()
                            : .regular.tint(tintColor.opacity(tintOpacity)),
                        in: shape
                    )
            } else {
                content
                    .glassEffect(
                        isInteractive ? .regular.interactive() : .regular,
                        in: shape
                    )
            }
        } else {
            content
                .background {
                    shape
                        .fill(.ultraThinMaterial)
                        .overlay {
                            if let tintColor {
                                shape.fill(tintColor.opacity(tintOpacity * 0.45))
                            }
                        }
                        .overlay {
                            shape.strokeBorder(
                                LinearGradient(
                                    colors: [
                                        .white.opacity(0.24),
                                        .white.opacity(0.06),
                                        .white.opacity(0.14)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 0.8
                            )
                        }
                }
        }
    }
}

public extension View {
    /// Applies iOS 26 Liquid Glass with optional dynamic album palette or theme tinting
    /// and interactive specular highlights on touch/drag.
    func amyLiquidGlass<S: Shape>(
        in shape: S = RoundedRectangle(cornerRadius: 24, style: .continuous),
        tint: Color? = nil,
        tintOpacity: Double = 0.25,
        interactive: Bool = false
    ) -> some View {
        modifier(
            AmyLiquidGlassCardModifier(
                shape: shape,
                tintColor: tint,
                tintOpacity: tintOpacity,
                interactive: interactive
            )
        )
    }
}

// MARK: - Cover Art Palette Extractor (Port of extractPaletteFromImage in AudioPlayerContext.jsx)

public actor PaletteExtractor {
    public static let shared = PaletteExtractor()
    private var cache: [String: TrackPalette] = [:]

    public func extractPalette(from urlString: String?) async -> TrackPalette {
        guard let urlString, !urlString.isEmpty, let url = URL(string: urlString) else {
            return .defaultPalette
        }
        if let cached = cache[urlString] {
            return cached
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let uiImage = UIImage(data: data),
                  let cgImage = uiImage.cgImage else {
                return .defaultPalette
            }
            let palette = computePalette(from: cgImage)
            cache[urlString] = palette
            return palette
        } catch {
            return .defaultPalette
        }
    }

    /// Quantizes cover art on a 48x48 bitmap into 24-unit RGB buckets and scores colorfulness + mid-brightness,
    /// matching `extractPaletteFromImage` in `src/audio/AudioPlayerContext.jsx`.
    private func computePalette(from cgImage: CGImage) -> TrackPalette {
        let width = 48
        let height = 48
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        var rawData = [UInt8](repeating: 0, count: height * bytesPerRow)

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                data: &rawData,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else {
            return .defaultPalette
        }

        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        struct Cluster {
            var count: Double = 0
            var rSum: Double = 0
            var gSum: Double = 0
            var bSum: Double = 0
            var brightnessSum: Double = 0
            var saturationSum: Double = 0
        }

        var buckets: [String: Cluster] = [:]

        for idx in stride(from: 0, to: rawData.count, by: 4) {
            let r = Double(rawData[idx])
            let g = Double(rawData[idx + 1])
            let b = Double(rawData[idx + 2])
            let a = Double(rawData[idx + 3])

            if a < 180 { continue }
            let brightness = (r * 299 + g * 587 + b * 114) / 1000
            if brightness < 10 || brightness > 246 { continue }

            let maxC = max(r, g, b)
            let minC = min(r, g, b)
            let saturation = maxC - minC

            let qr = Int((r / 24.0).rounded()) * 24
            let qg = Int((g / 24.0).rounded()) * 24
            let qb = Int((b / 24.0).rounded()) * 24
            let key = "\(qr)-\(qg)-\(qb)"

            var cluster = buckets[key, default: Cluster()]
            cluster.count += 1
            cluster.rSum += r
            cluster.gSum += g
            cluster.bSum += b
            cluster.brightnessSum += brightness
            cluster.saturationSum += saturation
            buckets[key] = cluster
        }

        struct ScoredColor {
            var r: Int
            var g: Int
            var b: Int
            var brightness: Double
            var score: Double
        }

        let scored: [ScoredColor] = buckets.values.compactMap { c in
            guard c.count >= 3 else { return nil }
            let r = Int((c.rSum / c.count).rounded())
            let g = Int((c.gSum / c.count).rounded())
            let b = Int((c.bSum / c.count).rounded())
            let avgBrightness = c.brightnessSum / c.count
            let avgSaturation = c.saturationSum / c.count

            let midBrightness = 1.0 - min(1.0, abs(avgBrightness - 118.0) / 118.0)
            let colorfulness = max(0.12, avgSaturation / 255.0)
            let score = sqrt(c.count) * (0.62 + colorfulness * 1.75) * (0.45 + midBrightness * 0.9)
            return ScoredColor(r: r, g: g, b: b, brightness: avgBrightness, score: score)
        }.sorted { $0.score > $1.score }

        guard let primary = scored.first else {
            return .defaultPalette
        }

        let secondary = scored.dropFirst().first { cand in
            let dist = abs(cand.r - primary.r) + abs(cand.g - primary.g) + abs(cand.b - primary.b)
            return dist > 58
        } ?? primary

        func toHex(_ r: Int, _ g: Int, _ b: Int) -> String {
            String(format: "#%02x%02x%02x", min(255, max(0, r)), min(255, max(0, g)), min(255, max(0, b)))
        }

        func shade(_ c: ScoredColor, factor: Double) -> String {
            toHex(Int(Double(c.r) * factor), Int(Double(c.g) * factor), Int(Double(c.b) * factor))
        }

        func boostBright(_ c: ScoredColor) -> String {
            toHex(min(255, Int(Double(c.r) * 1.28 + 32)), min(255, Int(Double(c.g) * 1.28 + 32)), min(255, Int(Double(c.b) * 1.28 + 32)))
        }

        let brighter = secondary.brightness > primary.brightness ? secondary : primary

        return TrackPalette(
            base: shade(primary, factor: 0.42),
            line: toHex(primary.r, primary.g, primary.b),
            bright: boostBright(brighter),
            shadow: shade(primary, factor: 0.22)
        )
    }
}

// MARK: - Audio-Reactive Fluid Mesh Background (Port of FullPlayerOverlay & WaveView Fluid Blobs)

public struct FluidMeshBackgroundView: View {
    public var palette: TrackPalette
    public var energy: AudioEnergy
    public var isPlaying: Bool

    public init(palette: TrackPalette, energy: AudioEnergy = .zero, isPlaying: Bool = false) {
        self.palette = palette
        self.energy = energy
        self.isPlaying = isPlaying
    }

    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isPlaying)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let bassBoost = isPlaying ? energy.bass * 0.28 : 0
            let midBoost = isPlaying ? energy.mids * 0.22 : 0

            ZStack {
                Color.amyBackground.ignoresSafeArea()

                if #available(iOS 18.0, *) {
                    MeshGradient(
                        width: 3,
                        height: 3,
                        points: [
                            [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
                            [0.0, 0.5],
                            [
                                Float(0.5 + 0.14 * sin(t * 0.45) + bassBoost * 0.2),
                                Float(0.5 + 0.14 * cos(t * 0.38) - midBoost * 0.2)
                            ],
                            [1.0, 0.5],
                            [0.0, 1.0], [0.5, 1.0], [1.0, 1.0]
                        ],
                        colors: [
                            Color(hex: palette.shadow), Color(hex: palette.base), Color.black,
                            Color(hex: palette.base), Color(hex: palette.line).opacity(0.75 + bassBoost), Color(hex: palette.shadow),
                            Color.black, Color(hex: palette.bright).opacity(0.42 + midBoost), Color(hex: palette.base)
                        ]
                    )
                    .ignoresSafeArea()
                }

                // Organic floating blurred orbs matching .animate-fluid-blob-1..3 in src/main.css
                GeometryReader { geo in
                    let w = geo.size.width
                    let h = geo.size.height

                    Circle()
                        .fill(Color(hex: palette.line).opacity(0.45))
                        .frame(width: w * (0.78 + bassBoost), height: w * (0.78 + bassBoost))
                        .blur(radius: 75)
                        .offset(
                            x: sin(t * 0.35) * 44 - w * 0.12,
                            y: cos(t * 0.28) * 36 - h * 0.08
                        )

                    Circle()
                        .fill(Color(hex: palette.bright).opacity(0.32))
                        .frame(width: w * (0.65 + midBoost), height: w * (0.65 + midBoost))
                        .blur(radius: 85)
                        .offset(
                            x: cos(t * 0.31) * 52 + w * 0.22,
                            y: sin(t * 0.42) * 48 + h * 0.25
                        )

                    Circle()
                        .fill(Color(hex: palette.base).opacity(0.55))
                        .frame(width: w * 0.85, height: w * 0.85)
                        .blur(radius: 80)
                        .offset(
                            x: sin(t * 0.22 + 1.4) * 38,
                            y: cos(t * 0.29 + 0.8) * 55 + h * 0.15
                        )
                }
                .ignoresSafeArea()

                LinearGradient(
                    colors: [
                        .black.opacity(0.35),
                        .clear,
                        .black.opacity(0.68)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            }
        }
    }
}

// MARK: - 3D DNA Music Wave Visualizer (Port of src/components/WaveView.jsx & .song-wave-*)

public struct WaveDNAVisualizerView: View {
    public var palette: TrackPalette
    public var energy: AudioEnergy
    public var isPlaying: Bool

    public init(palette: TrackPalette, energy: AudioEnergy, isPlaying: Bool) {
        self.palette = palette
        self.energy = energy
        self.isPlaying = isPlaying
    }

    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let speedMultiplier = isPlaying ? (1.4 + energy.level * 1.65) : 0.45
            let phase = t * speedMultiplier
            let amplitudeMultiplier = isPlaying ? (1.0 + energy.bass * 0.58) : 0.65

            Canvas { ctx, size in
                let midY = size.height * 0.48
                let baseAmp = min(size.height * 0.19, 86.0) * amplitudeMultiplier
                let rungCount = 32
                let stepX = size.width / CGFloat(rungCount - 1)

                let lineColor = Color(hex: palette.line)
                let brightColor = Color(hex: palette.bright)
                let shadowColor = Color(hex: palette.shadow)

                // Draw DNA Rungs between Strand 1 and Strand 2
                for i in 0..<rungCount {
                    let x = CGFloat(i) * stepX
                    let normX = Double(x / size.width) * .pi * 3.0
                    let y1 = midY + CGFloat(sin(normX + phase)) * baseAmp
                    let y2 = midY + CGFloat(sin(normX + phase + .pi)) * baseAmp
                    let depth = (cos(normX + phase) + 1.0) * 0.5 // 0..1 depth simulation

                    var rungPath = Path()
                    rungPath.move(to: CGPoint(x: x, y: y1))
                    rungPath.addLine(to: CGPoint(x: x, y: y2))

                    let rungAlpha = 0.16 + depth * 0.45 + (isPlaying ? energy.bass * 0.25 : 0)
                    let rungWidth = CGFloat(1.5 + depth * 2.2 + (isPlaying ? energy.bass * 2.0 : 0))

                    ctx.stroke(
                        rungPath,
                        with: .linearGradient(
                            Gradient(colors: [brightColor.opacity(rungAlpha), lineColor.opacity(rungAlpha * 0.65)]),
                            startPoint: CGPoint(x: x, y: y1),
                            endPoint: CGPoint(x: x, y: y2)
                        ),
                        style: StrokeStyle(lineWidth: rungWidth, lineCap: .round)
                    )

                    // Node caps on rungs
                    let nodeRadius = CGFloat(2.4 + depth * 2.4)
                    let rect1 = CGRect(x: x - nodeRadius, y: y1 - nodeRadius, width: nodeRadius * 2, height: nodeRadius * 2)
                    let rect2 = CGRect(x: x - nodeRadius, y: y2 - nodeRadius, width: nodeRadius * 2, height: nodeRadius * 2)
                    ctx.fill(Path(ellipseIn: rect1), with: .color(brightColor.opacity(rungAlpha + 0.15)))
                    ctx.fill(Path(ellipseIn: rect2), with: .color(lineColor.opacity(rungAlpha + 0.1)))
                }

                // Helper to draw a continuous sinusoidal strand
                func buildStrand(phaseOffset: Double, ampScale: CGFloat, freqScale: Double = 3.0) -> Path {
                    var path = Path()
                    let samples = 120
                    for s in 0...samples {
                        let progress = Double(s) / Double(samples)
                        let x = CGFloat(progress) * size.width
                        let angle = progress * .pi * freqScale + phase + phaseOffset
                        let y = midY + CGFloat(sin(angle)) * (baseAmp * ampScale)
                        if s == 0 {
                            path.move(to: CGPoint(x: x, y: y))
                        } else {
                            path.addLine(to: CGPoint(x: x, y: y))
                        }
                    }
                    return path
                }

                // Echo strands (Strands 3 & 4)
                let echoStrand1 = buildStrand(phaseOffset: 0.45, ampScale: 1.18)
                let echoStrand2 = buildStrand(phaseOffset: .pi + 0.45, ampScale: 1.18)
                ctx.stroke(echoStrand1, with: .color(shadowColor.opacity(0.38)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                ctx.stroke(echoStrand2, with: .color(lineColor.opacity(0.24)), style: StrokeStyle(lineWidth: 3.5, lineCap: .round))

                // Main intertwined strands (Strands 1 & 2) with bass pulse width
                let mainWidth = CGFloat(isPlaying ? (6.5 + energy.bass * 7.5) : 5.0)
                let mainStrand1 = buildStrand(phaseOffset: 0, ampScale: 1.0)
                let mainStrand2 = buildStrand(phaseOffset: .pi, ampScale: 1.0)

                ctx.stroke(
                    mainStrand2,
                    with: .linearGradient(
                        Gradient(colors: [lineColor.opacity(0.55), brightColor.opacity(0.85), lineColor.opacity(0.55)]),
                        startPoint: .zero,
                        endPoint: CGPoint(x: size.width, y: 0)
                    ),
                    style: StrokeStyle(lineWidth: mainWidth * 0.85, lineCap: .round)
                )

                ctx.stroke(
                    mainStrand1,
                    with: .linearGradient(
                        Gradient(colors: [brightColor, lineColor, brightColor]),
                        startPoint: .zero,
                        endPoint: CGPoint(x: size.width, y: 0)
                    ),
                    style: StrokeStyle(lineWidth: mainWidth, lineCap: .round)
                )
            }
        }
    }
}
