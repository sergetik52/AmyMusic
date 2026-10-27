import SwiftUI
import Combine

// MARK: - Phone-First Root Layout (Exact Port of src/mobile/MobileLayout.jsx, MobileMiniPlayer.jsx & src/main.css)
// - 3-Tab Icon-Only Liquid Glass Dock ("Моя волна", "Чарты", "Коллекция")
// - Separate Floating MobileMiniPlayer (64pt height, 20pt radius, 52x52 cover, 48x48 play button, swipe L/R)
// - 10pt gap between MiniPlayer and NavDock
// - Automatic hiding when iPhone virtual keyboard is open (.is-keyboard-open)

public enum AmyMobileTab: Int, CaseIterable, Identifiable {
    case wave = 0
    case trends = 1
    case collection = 2

    public var id: Int { rawValue }

    public var label: String {
        switch self {
        case .wave: return "Моя волна"
        case .trends: return "Чарты"
        case .collection: return "Коллекция"
        }
    }

    public var systemIcon: String {
        switch self {
        case .wave: return "waveform.path.ecg"
        case .trends: return "flame.fill"
        case .collection: return "heart.rectangle.fill"
        }
    }
}

public struct RootTabView: View {
    @Bindable var player: AudioPlayerManager
    @State private var activeTab: AmyMobileTab = .wave
    @State private var isFullPlayerOpen: Bool = false
    @State private var isEqualizerOpen: Bool = false
    @State private var isQueueSheetOpen: Bool = false
    @State private var isSettingsOpen: Bool = false
    @State private var isMiniKaraokeOpen: Bool = false
    @State private var selectedArtistId: String? = nil
    @State private var selectedRelease: ReleaseItem? = nil
    @State private var isKeyboardVisible: Bool = false

    @Namespace private var glassNamespace

    public init(player: AudioPlayerManager = .shared) {
        self.player = player
    }

    public var body: some View {
        let themeAccent = Color(hex: player.settings.themePreset.primaryHex)

        ZStack(alignment: .bottom) {
            Color.amyBackground.ignoresSafeArea()

            // Main Phone Stage (.mobile-content-stage)
            Group {
                switch activeTab {
                case .wave:
                    NavigationStack {
                        HomeWaveView(
                            player: player,
                            onOpenFullPlayer: {
                                withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) {
                                    isFullPlayerOpen = true
                                }
                            },
                            onOpenArtist: { id in selectedArtistId = id },
                            onOpenRelease: { rel in selectedRelease = rel },
                            onOpenSettings: { isSettingsOpen = true },
                            onNavigateCollection: {
                                withAnimation(.spring(response: 0.38, dampingFraction: 0.8)) {
                                    activeTab = .collection
                                }
                            }
                        )
                    }
                case .trends:
                    NavigationStack {
                        TrendsChartsView(
                            player: player,
                            onOpenArtist: { id in selectedArtistId = id },
                            onOpenSettings: { isSettingsOpen = true }
                        )
                    }
                case .collection:
                    NavigationStack {
                        CollectionView(
                            player: player,
                            onOpenArtist: { id in selectedArtistId = id },
                            onOpenRelease: { rel in selectedRelease = rel },
                            onOpenSettings: { isSettingsOpen = true }
                        )
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Floating Mini-Karaoke Pill (when toggled)
            if isMiniKaraokeOpen && !isFullPlayerOpen && !isKeyboardVisible {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        MiniKaraokeFloatingOverlay(
                            player: player,
                            isPresented: $isMiniKaraokeOpen,
                            onExpandFullPlayer: {
                                isMiniKaraokeOpen = false
                                isFullPlayerOpen = true
                            }
                        )
                        .padding(.trailing, 14)
                        .padding(.bottom, 158)
                    }
                }
                .transition(.scale.combined(with: .opacity))
            }

            // Separate Floating Surfaces: MobileMiniPlayer (64pt) + 10pt gap + MobileNavDock (64pt)
            // Automatically hides when full player is open OR when virtual keyboard is open (.is-keyboard-open)
            if !isFullPlayerOpen && !isKeyboardVisible {
                VStack(spacing: 10) {
                    PhoneLiquidGlassMiniPlayer(
                        player: player,
                        glassNamespace: glassNamespace,
                        onOpenFull: {
                            withAnimation(.spring(response: 0.42, dampingFraction: 0.84)) {
                                isFullPlayerOpen = true
                            }
                        },
                        onOpenEqualizer: { isEqualizerOpen = true },
                        onToggleKaraoke: {
                            withAnimation(.spring(duration: 0.3)) {
                                isMiniKaraokeOpen.toggle()
                            }
                        }
                    )

                    PhoneFloatingNavDock(
                        activeTab: $activeTab,
                        accentColor: themeAccent
                    )
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .preferredColorScheme(.dark)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            withAnimation(.easeOut(duration: 0.22)) {
                isKeyboardVisible = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.22)) {
                isKeyboardVisible = false
            }
        }
        .fullScreenCover(isPresented: $isFullPlayerOpen) {
            FullPlayerOverlayView(
                player: player,
                isPresented: $isFullPlayerOpen,
                onOpenArtist: { artistId in
                    isFullPlayerOpen = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        selectedArtistId = artistId
                    }
                }
            )
        }
        .sheet(isPresented: $isEqualizerOpen) {
            EqualizerSheetView(player: player)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isQueueSheetOpen) {
            QueueBottomSheetView(player: player)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isSettingsOpen) {
            SettingsAndProfileView(player: player)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: Binding(
            get: { selectedArtistId.map { IdentifiableArtistId(id: $0) } },
            set: { selectedArtistId = $0?.id }
        )) { item in
            ArtistDetailSheetView(
                artistId: item.id,
                player: player,
                onOpenRelease: { rel in
                    selectedArtistId = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        selectedRelease = rel
                    }
                }
            )
        }
        .sheet(item: $selectedRelease) { release in
            AlbumOrPlaylistSheetView(
                release: release,
                player: player,
                onOpenArtist: { id in
                    selectedRelease = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        selectedArtistId = id
                    }
                }
            )
        }
    }
}

private struct IdentifiableArtistId: Identifiable {
    let id: String
}

// MARK: - Phone Liquid Glass Mini-Player (Exact Port of .mobile-mini-player in MobileMiniPlayer.jsx)
// - min-height: 64pt, border-radius: 20pt, padding: 6pt 8pt 6pt 6pt
// - Cover: 52x52pt, border-radius: 14pt
// - Title: 14pt bold (#fff), Artist: 12pt (#a1a1aa)
// - Play button: 48x48pt white circle (#fff) with 21x21pt black icon (#0b0b0d)
// - Swipe gesture: deltaX >= 52pt -> left = previous(), right = next()

public struct PhoneLiquidGlassMiniPlayer: View {
    @Bindable var player: AudioPlayerManager
    var glassNamespace: Namespace.ID
    var onOpenFull: () -> Void
    var onOpenEqualizer: () -> Void
    var onToggleKaraoke: () -> Void

    public var body: some View {
        let track = player.currentTrack
        let hasTrack = track != nil
        let palette = track?.palette ?? .defaultPalette
        let progress = player.duration > 0 ? min(1.0, max(0.0, player.currentTime / player.duration)) : 0

        ZStack(alignment: .bottom) {
            if player.settings.miniPlayerStyle == .waveform {
                MiniWaveformBackdropView(
                    seed: track?.id ?? "amy",
                    progress: progress,
                    isPlaying: player.isPlaying
                )
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            }

            HStack(spacing: 8) {
                // .mobile-mini-player__track
                Button(action: onOpenFull) {
                    HStack(spacing: 10) {
                        // .mobile-mini-player__cover (52x52pt, radius 14pt)
                        AsyncImage(url: URL(string: track?.coverUrl ?? "")) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            ZStack {
                                Color(hex: "#252529")
                                LinearGradient(
                                    colors: [Color(hex: palette.line).opacity(0.6), Color(hex: palette.base)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                                Image(systemName: "music.note")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }
                        .frame(width: 52, height: 52)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                        // .mobile-mini-player__meta
                        VStack(alignment: .leading, spacing: 2) {
                            Text(hasTrack ? (track?.title ?? "Без названия") : "Нет трека")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                                .lineLimit(1)

                            Text(hasTrack ? (track?.artist ?? "Неизвестный артист") : "Трек не загружен")
                                .font(.system(size: 12, weight: .regular))
                                .foregroundStyle(Color(hex: "#A1A1AA"))
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if player.settings.miniPlayerStyle == .classic {
                    Button(action: onToggleKaraoke) {
                        Image(systemName: "quote.bubble.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.75))
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)

                    Button(action: onOpenEqualizer) {
                        Image(systemName: "slider.vertical.3")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(player.settings.equalizerEnabled ? Color.amyPurpleBright : .white.opacity(0.75))
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)
                }

                // .mobile-mini-player__play (48x48pt white circle, 21x21pt black icon)
                Button {
                    if hasTrack {
                        player.togglePlay()
                    } else {
                        onOpenFull()
                    }
                } label: {
                    ZStack {
                        Circle()
                            .fill(.white)
                            .frame(width: 48, height: 48)

                        if player.isLoading {
                            ProgressView()
                                .tint(Color(hex: "#0B0B0D"))
                                .scaleEffect(0.85)
                        } else {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 18, weight: .black))
                                .foregroundStyle(Color(hex: "#0B0B0D"))
                                .offset(x: player.isPlaying ? 0 : 1.5)
                        }
                    }
                }
                .buttonStyle(ScalePressButtonStyle(scale: 0.92))
            }
            .padding(.leading, 6)
            .padding(.trailing, 8)
            .padding(.vertical, 6)
        }
        .frame(minHeight: 64)
        .amyLiquidGlass(
            in: RoundedRectangle(cornerRadius: 20, style: .continuous),
            tint: Color(hex: palette.line),
            tintOpacity: player.settings.glassTintIntensity,
            interactive: true
        )
        .shadow(color: .black.opacity(0.42), radius: 20, y: 10)
        .gesture(
            // Exact mobile convention from MobileMiniPlayer.jsx:
            // elapsed <= 700ms, abs(deltaX) >= 52, abs(deltaX) > abs(deltaY) * 1.2
            // left (deltaX < 0) = previous(), right (deltaX > 0) = next()
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    let dx = value.translation.width
                    let dy = value.translation.height
                    if abs(dx) >= 52 && abs(dx) > abs(dy) * 1.2 && hasTrack {
                        if dx < 0 {
                            player.previous()
                        } else {
                            player.next()
                        }
                    } else if dy < -40 {
                        onOpenFull()
                    }
                }
        )
    }
}

// MARK: - Phone 3-Tab Icon-Only Floating Dock (Exact Port of .mobile-nav-dock in MobileLayout.jsx & src/main.css)
// - 3 items: Моя волна, Чарты, Коллекция (Icon-only, labels hidden)
// - min-height: 64pt, border-radius: 26pt, padding: 6pt
// - Sliding morphing active pill (#36363c <-> #48484f) + diagonal sheen sweep (nav-dock-sheen)
// - Active icon color: #a855f7 (27x27pt)

public struct PhoneFloatingNavDock: View {
    @Binding var activeTab: AmyMobileTab
    var accentColor: Color

    @Namespace private var navDockNamespace
    @State private var shimmerPhase: Bool = false
    @State private var sheenOffset: CGFloat = -0.5

    public var body: some View {
        ZStack {
            // Diagonal sheen sweep (.mobile-nav-dock::after -> nav-dock-sheen)
            GeometryReader { geo in
                Capsule()
                    .fill(.white.opacity(0.075))
                    .frame(width: geo.size.width * 0.34, height: geo.size.height)
                    .blur(radius: 10)
                    .rotationEffect(.degrees(-14))
                    .offset(x: geo.size.width * sheenOffset)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .allowsHitTesting(false)

            HStack(spacing: 0) {
                ForEach(AmyMobileTab.allCases) { item in
                    let isActive = activeTab == item
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        withAnimation(.spring(response: 0.40, dampingFraction: 0.82)) {
                            activeTab = item
                        }
                    } label: {
                        ZStack {
                            // Moving dock highlight (.mobile-nav-dock::before)
                            if isActive {
                                RoundedRectangle(cornerRadius: shimmerPhase ? 22 : 20, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                Color(hex: shimmerPhase ? "#48484F" : "#36363C").opacity(0.85),
                                                accentColor.opacity(0.22),
                                                Color(hex: shimmerPhase ? "#36363C" : "#48484F").opacity(0.85)
                                            ],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .overlay {
                                        RoundedRectangle(cornerRadius: shimmerPhase ? 22 : 20, style: .continuous)
                                            .strokeBorder(.white.opacity(0.12), lineWidth: 0.8)
                                    }
                                    .matchedGeometryEffect(id: "mobileNavActiveIndicator", in: navDockNamespace)
                                    .padding(.horizontal, 4)
                            }

                            // 27x27pt Icon, active = #A855F7
                            Image(systemName: item.systemIcon)
                                .font(.system(size: 22, weight: isActive ? .bold : .medium))
                                .foregroundStyle(isActive ? Color(hex: "#A855F7") : .white.opacity(0.66))
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(ScalePressButtonStyle(scale: 0.96))
                    .accessibilityLabel(item.label)
                }
            }
            .padding(6)
        }
        .frame(minHeight: 64)
        .amyLiquidGlass(
            in: RoundedRectangle(cornerRadius: 26, style: .continuous),
            tint: Color(hex: "#141418"),
            tintOpacity: 0.78,
            interactive: true
        )
        .shadow(color: .black.opacity(0.38), radius: 22, y: 12)
        .onAppear {
            withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
                shimmerPhase = true
            }
            withAnimation(.easeInOut(duration: 4.6).repeatForever(autoreverses: false)) {
                sheenOffset = 1.25
            }
        }
    }
}

public struct ScalePressButtonStyle: ButtonStyle {
    public var scale: CGFloat = 0.95
    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1.0)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Deterministic Waveform Bar Renderer (Port of WaveformPlayer in src/App.jsx)

public struct MiniWaveformBackdropView: View {
    public var seed: String
    public var progress: Double
    public var isPlaying: Bool

    private var bars: [CGFloat] {
        var hash: UInt64 = 5381
        for byte in seed.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return (0..<72).map { idx in
            let v = sin(Double(idx) * 0.43 + Double(hash % 97)) * 0.5 + 0.5
            return CGFloat(0.22 + v * 0.72)
        }
    }

    public var body: some View {
        GeometryReader { geo in
            let allBars = bars
            HStack(alignment: .bottom, spacing: 2) {
                ForEach(0..<allBars.count, id: \.self) { i in
                    let ratio = Double(i) / Double(allBars.count)
                    let isPlayed = ratio <= progress
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(isPlayed ? .white.opacity(0.42) : .white.opacity(0.14))
                        .frame(
                            height: geo.size.height * 0.72 * (isPlaying ? allBars[i] : 0.14)
                        )
                }
            }
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .animation(.spring(duration: 0.35), value: isPlaying)
        }
    }
}
