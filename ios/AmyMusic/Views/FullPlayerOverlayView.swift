import SwiftUI
import AVKit

// MARK: - Full Player Overlay, Synced Lyrics Engine, Lyrics Context Menu, Queue Sheet & 10-Band Equalizer
// Port of src/components/FullPlayerOverlay.jsx, src/components/LyricsContextMenu.jsx & src/components/EqualizerModal.jsx

public enum FullPlayerCenterStageMode: String, CaseIterable {
    case song = "Песня"
    case lyrics = "Текст"
}

public struct FullPlayerOverlayView: View {
    @Bindable var player: AudioPlayerManager
    @Binding var isPresented: Bool
    var onOpenArtist: (String) -> Void

    @State private var stageMode: FullPlayerCenterStageMode = .song
    @State private var isLyricsConfigOpen: Bool = false
    @State private var isQueueOpen: Bool = false
    @State private var isEqualizerOpen: Bool = false
    @State private var isScrubbing: Bool = false
    @State private var scrubTime: TimeInterval = 0
    @State private var dragDismissOffset: CGFloat = 0

    public var body: some View {
        let track = player.currentTrack
        let palette = track?.palette ?? .defaultPalette
        let displayedTime = isScrubbing ? scrubTime : player.currentTime
        let totalDuration = max(1, player.duration > 0 ? player.duration : (track?.duration ?? 1))

        ZStack {
            // Audio-Reactive Fluid Mesh + Breathing Cover Background
            FluidMeshBackgroundView(
                palette: palette,
                energy: player.audioEnergy,
                isPlaying: player.isPlaying
            )

            VStack(spacing: 16) {
                // Top Drag Pill & Segmented Bar ("Песня" | "Текст")
                VStack(spacing: 12) {
                    Capsule()
                        .fill(.white.opacity(0.32))
                        .frame(width: 40, height: 4.5)
                        .padding(.top, 8)

                    HStack {
                        Button {
                            isPresented = false
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .amyLiquidGlass(in: Circle(), interactive: true)
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        // Segmented Pill Toggle ("Песня" | "Текст")
                        HStack(spacing: 4) {
                            ForEach(FullPlayerCenterStageMode.allCases, id: \.rawValue) { mode in
                                let active = stageMode == mode
                                Button {
                                    UISelectionFeedbackGenerator().selectionChanged()
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        stageMode = mode
                                    }
                                } label: {
                                    Text(mode.rawValue)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(active ? .black : .white.opacity(0.75))
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 8)
                                        .background {
                                            if active {
                                                Capsule().fill(.white)
                                            }
                                        }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(4)
                        .amyLiquidGlass(in: Capsule())

                        Spacer()

                        Button {
                            if stageMode == .lyrics {
                                isLyricsConfigOpen = true
                            } else {
                                isQueueOpen = true
                            }
                        } label: {
                            Image(systemName: stageMode == .lyrics ? "textformat.size" : "list.bullet")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .amyLiquidGlass(in: Circle(), interactive: true)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 20)
                }

                // Center Stage: Cover Art vs Synced Lyrics Engine
                if stageMode == .song {
                    Spacer(minLength: 4)

                    AsyncImage(url: URL(string: track?.coverUrl ?? "")) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        LinearGradient(
                            colors: [Color(hex: palette.line), Color(hex: palette.base)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    }
                    .frame(width: 280, height: 280)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .scaleEffect(player.isPlaying ? (1.0 + player.audioEnergy.bass * 0.04) : 0.94)
                    .shadow(
                        color: Color(hex: palette.line).opacity(player.settings.fullPlayerGlowEnabled ? 0.55 : 0.25),
                        radius: 36,
                        y: 16
                    )
                    .animation(.spring(response: 0.4, dampingFraction: 0.75), value: player.isPlaying)
                    .onTapGesture {
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.82)) {
                            stageMode = .lyrics
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 35)
                            .onEnded { val in
                                if val.translation.width < -50 {
                                    player.next()
                                } else if val.translation.width > 50 {
                                    player.previous()
                                }
                            }
                    )

                    Spacer(minLength: 4)
                } else {
                    SyncedLyricsStageView(
                        player: player,
                        palette: palette,
                        onOpenLyricsSettings: { isLyricsConfigOpen = true }
                    )
                    .frame(maxHeight: .infinity)
                }

                // Bottom Controls Dock
                VStack(spacing: 16) {
                    // Track Title, Artist Chips & Menu
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(track?.title ?? "Нет трека")
                                    .font(.system(size: 22, weight: .black))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)

                                if track?.isExplicit == true {
                                    Text("18+")
                                        .font(.system(size: 10, weight: .black))
                                        .foregroundStyle(.white.opacity(0.75))
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 2)
                                        .background(.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 5))
                                }
                            }

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(track?.artists ?? []) { artistRef in
                                        Button {
                                            onOpenArtist(artistRef.id)
                                        } label: {
                                            HStack(spacing: 5) {
                                                if let avatar = artistRef.avatarUrl, let url = URL(string: avatar) {
                                                    AsyncImage(url: url) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Color.amyPurple
                                                    }
                                                    .frame(width: 18, height: 18)
                                                    .clipShape(Circle())
                                                }
                                                Text(artistRef.name)
                                                    .font(.system(size: 13, weight: .semibold))
                                                    .foregroundStyle(.white.opacity(0.75))
                                            }
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 4)
                                            .background(.white.opacity(0.08), in: Capsule())
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }

                        Spacer()

                        if let track {
                            Menu {
                                TrackNativeContextMenuItems(track: track, player: player, onOpenArtist: onOpenArtist)
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 38, height: 38)
                                    .amyLiquidGlass(in: Circle(), interactive: true)
                            }
                        }
                    }

                    // Seek Slider + Timestamps
                    VStack(spacing: 6) {
                        Slider(
                            value: Binding(
                                get: { min(displayedTime, totalDuration) },
                                set: { newVal in
                                    isScrubbing = true
                                    scrubTime = newVal
                                }
                            ),
                            in: 0...totalDuration
                        ) { editing in
                            if !editing {
                                player.seek(to: scrubTime)
                                isScrubbing = false
                            }
                        }
                        .tint(Color(hex: palette.bright))

                        HStack {
                            Text(formatTime(displayedTime))
                            Spacer()
                            Text(formatTime(totalDuration))
                        }
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.55))
                    }

                    // Main Transport Row: Dislike, Prev, 62x62 #8341EF Play/Pause, Next, Like
                    HStack(spacing: 28) {
                        Button {
                            if let track { player.dislikeTrack(track) }
                        } label: {
                            Image(systemName: "hand.thumbsdown.fill")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.6))
                        }

                        Button {
                            player.previous()
                        } label: {
                            Image(systemName: "backward.fill")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(.white)
                        }

                        Button {
                            player.togglePlay()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color(hex: player.settings.themePreset.primaryHex))
                                    .frame(width: 64, height: 64)
                                    .shadow(
                                        color: Color(hex: player.settings.themePreset.primaryHex).opacity(0.55),
                                        radius: 22,
                                        y: 6
                                    )

                                if player.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 24, weight: .black))
                                        .foregroundStyle(.white)
                                        .offset(x: player.isPlaying ? 0 : 2)
                                }
                            }
                        }

                        Button {
                            player.next()
                        } label: {
                            Image(systemName: "forward.fill")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundStyle(.white)
                        }

                        Button {
                            if let track { player.toggleLike(track) }
                        } label: {
                            let liked = player.isLiked(track)
                            Image(systemName: liked ? "heart.fill" : "heart")
                                .font(.system(size: 21, weight: .bold))
                                .foregroundStyle(liked ? Color.amyPurpleBright : .white.opacity(0.65))
                        }
                    }

                    // Bottom Utility Row: Repeat, Equalizer, AirPlay, Lyrics Toggle, Shuffle
                    HStack {
                        Button {
                            player.cycleRepeatMode()
                        } label: {
                            Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(player.repeatMode != .off ? Color.amyPurpleBright : .white.opacity(0.55))
                                .frame(width: 40, height: 40)
                        }

                        Spacer()

                        Button {
                            isEqualizerOpen = true
                        } label: {
                            Image(systemName: "slider.vertical.3")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(player.settings.equalizerEnabled ? Color.amyPurpleBright : .white.opacity(0.55))
                                .frame(width: 40, height: 40)
                        }

                        Spacer()

                        AirPlayRoutePickerButton()
                            .frame(width: 40, height: 40)

                        Spacer()

                        Button {
                            isQueueOpen = true
                        } label: {
                            Image(systemName: "music.note.list")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white.opacity(0.65))
                                .frame(width: 40, height: 40)
                        }

                        Spacer()

                        Button {
                            player.toggleShuffle()
                        } label: {
                            Image(systemName: "shuffle")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(player.isShuffleEnabled ? Color.amyPurpleBright : .white.opacity(0.55))
                                .frame(width: 40, height: 40)
                        }
                    }
                    .padding(.top, 2)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 22)
            }
            .offset(y: max(0, dragDismissOffset))
            .gesture(
                DragGesture()
                    .onChanged { val in
                        if val.translation.height > 0 {
                            dragDismissOffset = val.translation.height
                        }
                    }
                    .onEnded { val in
                        if val.translation.height > 90 {
                            isPresented = false
                        }
                        withAnimation(.spring(duration: 0.28)) {
                            dragDismissOffset = 0
                        }
                    }
            )
        }
        .sheet(isPresented: $isLyricsConfigOpen) {
            LyricsSettingsMenuSheet(player: player)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isQueueOpen) {
            QueueBottomSheetView(player: player)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $isEqualizerOpen) {
            EqualizerSheetView(player: player)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func formatTime(_ secs: TimeInterval) -> String {
        guard secs.isFinite && secs >= 0 else { return "0:00" }
        let s = Int(secs.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

// MARK: - Synced Lyrics Stage (4 Styles: Blur, Scale, Normal, Braccato Word Sweep + 3-Dot Intro)

public struct SyncedLyricsStageView: View {
    @Bindable var player: AudioPlayerManager
    var palette: TrackPalette
    var onOpenLyricsSettings: () -> Void

    @State private var expandedAnnotationId: String? = nil

    public var body: some View {
        let lines = player.currentLyrics.lines
        let offsetMs = player.currentTrackLyricsOffsetMs()
        let activeIdx = LyricsService.activeLyricIndex(
            in: lines,
            currentTime: player.currentTime,
            offsetMs: offsetMs
        )
        let firstLineTime = lines.first?.time ?? 0
        let showIntroDots = player.currentLyrics.status == .synced && firstLineTime > 2.0 && player.currentTime < firstLineTime

        ZStack {
            if player.isLyricsLoading {
                ProgressView("Поиск текста (LRCLib / Genius / NetEase)...")
                    .tint(.white)
                    .foregroundStyle(.white.opacity(0.65))
            } else if lines.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "quote.bubble")
                        .font(.system(size: 38))
                        .foregroundStyle(.white.opacity(0.35))
                    Text("Текст для этого трека не найден")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white.opacity(0.6))
                    Button("Попробовать другой источник") {
                        onOpenLyricsSettings()
                    }
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.amyPurpleBright)
                }
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 20) {
                            // Source & Sync Badge Row
                            HStack {
                                Text("Источник: \(player.currentLyrics.source)")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.5))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(.white.opacity(0.08), in: Capsule())

                                Spacer()

                                Button(action: onOpenLyricsSettings) {
                                    Label("Настроить текст", systemImage: "slider.horizontal.3")
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.75))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(.white.opacity(0.08), in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }

                            // 3-Dot Bouncing Intro before first lyric (Port of karaoke-dot-jump)
                            if showIntroDots {
                                HStack(spacing: 8) {
                                    ForEach(0..<3, id: \.self) { i in
                                        Circle()
                                            .fill(.white)
                                            .frame(width: 10, height: 10)
                                            .opacity(0.85)
                                    }
                                }
                                .padding(.vertical, 8)
                            }

                            ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                                let isActive = activeIdx == index
                                let distance = abs((activeIdx ?? 0) - index)

                                VStack(alignment: .leading, spacing: 8) {
                                    Button {
                                        player.seek(to: line.time)
                                    } label: {
                                        lyricLineContent(
                                            line: line,
                                            isActive: isActive,
                                            distance: distance
                                        )
                                    }
                                    .buttonStyle(.plain)

                                    if let annId = line.annotationId,
                                       let annBody = player.currentLyrics.annotations[annId] {
                                        Button {
                                            withAnimation(.spring(duration: 0.25)) {
                                                expandedAnnotationId = (expandedAnnotationId == annId) ? nil : annId
                                            }
                                        } label: {
                                            Text("Аннотация Genius")
                                                .font(.system(size: 11, weight: .bold))
                                                .foregroundStyle(Color.amyPurpleBright)
                                        }
                                        if expandedAnnotationId == annId {
                                            Text(annBody)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.8))
                                                .padding(12)
                                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                                        }
                                    }
                                }
                                .id(line.id)
                            }

                            Spacer(minLength: 120)
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 16)
                    }
                    .onChange(of: activeIdx) { _, newIdx in
                        if let newIdx, newIdx < lines.count {
                            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) {
                                proxy.scrollTo(lines[newIdx].id, anchor: .center)
                            }
                        }
                    }
                }
            }
        }
        .contextMenu {
            Button("Настройки текста") { onOpenLyricsSettings() }
            Button("Обновить текст") {
                Task { await player.loadLyricsForCurrentTrack(forceRefresh: true) }
            }
        }
    }

    @ViewBuilder
    private func lyricLineContent(line: LyricLine, isActive: Bool, distance: Int) -> some View {
        let baseFontSize = player.settings.lyricsFontSize.pointSize
        let style = player.settings.lyricsTextStyle
        let syncMode = player.settings.lyricsSyncMode
        let adjustedTime = player.currentTime + 0.08 - (player.currentTrackLyricsOffsetMs() / 1000.0)

        if (style == .braccato || syncMode == .words) && isActive && !line.words.isEmpty {
            // Word-by-word Apple Music / Braccato sweep highlight
            WrappingHStackWordsView(
                words: line.words,
                currentTime: adjustedTime,
                fontSize: baseFontSize,
                accentColor: Color(hex: palette.bright)
            )
            .scaleEffect(1.04, anchor: .leading)
        } else {
            let blurRadius: CGFloat = {
                guard style == .blur && player.currentLyrics.status == .synced else { return 0 }
                if isActive { return 0 }
                switch distance {
                case 1: return 1.6
                case 2: return 3.2
                case 3: return 5.0
                default: return 7.5
                }
            }()

            let scale: CGFloat = {
                switch style {
                case .scale: return isActive ? 1.12 : 0.96
                case .blur, .braccato: return isActive ? 1.04 : 1.0
                case .normal: return 1.0
                }
            }()

            Text(line.text)
                .font(.system(size: baseFontSize, weight: .black))
                .foregroundStyle(isActive ? .white : .white.opacity(0.34))
                .blur(radius: blurRadius)
                .scaleEffect(scale, anchor: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isActive)
        }
    }
}

private struct WrappingHStackWordsView: View {
    var words: [LyricWord]
    var currentTime: TimeInterval
    var fontSize: CGFloat
    var accentColor: Color

    var body: some View {
        // Highlight each word based on its interpolated timestamp
        let attributed: AttributedString = {
            var result = AttributedString()
            for (idx, word) in words.enumerated() {
                var part = AttributedString(word.text + (idx < words.count - 1 ? " " : ""))
                let isSung = currentTime >= word.startTime
                part.foregroundColor = isSung ? .white : .white.opacity(0.38)
                result.append(part)
            }
            return result
        }()

        Text(attributed)
            .font(.system(size: fontSize, weight: .black))
            .shadow(color: accentColor.opacity(0.45), radius: 12)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Lyrics Settings Sheet (Port of src/components/LyricsContextMenu.jsx)

public struct LyricsSettingsMenuSheet: View {
    @Bindable var player: AudioPlayerManager
    @Environment(\.dismiss) private var dismiss

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // 1. Font Size Selector (sm, base, lg, xl "A")
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Размер шрифта")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white.opacity(0.6))

                            HStack(spacing: 10) {
                                ForEach(LyricsFontSize.allCases) { size in
                                    let active = player.settings.lyricsFontSize == size
                                    Button {
                                        player.settings.lyricsFontSize = size
                                    } label: {
                                        Text("A")
                                            .font(.system(size: size.pointSize * 0.65, weight: .black))
                                            .foregroundStyle(active ? .black : .white)
                                            .frame(maxWidth: .infinity, minHeight: 44)
                                            .background(active ? .white : .white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        // 2. Source Switcher (Авто / LRCLib / Genius / NetEase)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Источник текста")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white.opacity(0.6))

                            Picker("Источник", selection: $player.settings.preferredLyricsSource) {
                                ForEach(LyricsSourceKind.allCases, id: \.self) { src in
                                    Text(src.rawValue).tag(src)
                                }
                            }
                            .pickerStyle(.segmented)
                            .onChange(of: player.settings.preferredLyricsSource) { _, _ in
                                Task { await player.loadLyricsForCurrentTrack(forceRefresh: true) }
                            }
                        }

                        // 3. Sync Mode Toggle (По словам | По строкам) & Style Cycler (Размытие | Масштаб | Обычный | Braccato)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Режим синхронизации и стиль")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white.opacity(0.6))

                            Picker("Режим", selection: $player.settings.lyricsSyncMode) {
                                ForEach(LyricsSyncMode.allCases) { mode in
                                    Text(mode.rawValue).tag(mode)
                                }
                            }
                            .pickerStyle(.segmented)

                            Picker("Стиль", selection: $player.settings.lyricsTextStyle) {
                                ForEach(LyricsTextStyle.allCases) { style in
                                    Text(style.rawValue).tag(style)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        // 4. Per-Track Millisecond Offset Slider (-2000ms to +2000ms, step 25ms)
                        VStack(alignment: .leading, spacing: 8) {
                            let offset = player.currentTrackLyricsOffsetMs()
                            HStack {
                                Text("Смещение тайминга")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.6))
                                Spacer()
                                Text("\(Int(offset)) мс")
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .foregroundStyle(Color.amyPurpleBright)
                            }

                            Slider(
                                value: Binding(
                                    get: { player.currentTrackLyricsOffsetMs() },
                                    set: { player.setCurrentTrackLyricsOffsetMs(($0 / 25.0).rounded() * 25.0) }
                                ),
                                in: -2000...2000,
                                step: 25
                            )
                            .tint(Color.amyPurpleBright)
                        }

                        // 5. Reload Button
                        Button {
                            Task { await player.loadLyricsForCurrentTrack(forceRefresh: true) }
                            dismiss()
                        } label: {
                            Label("Обновить текст", systemImage: "arrow.clockwise")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 13)
                                .amyLiquidGlass(in: Capsule(), tint: Color.amyPurple, tintOpacity: 0.35)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Настройки текста")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Queue Bottom Sheet (Port of Mobile Queue Bottom Sheet in FullPlayerOverlay.jsx)

public struct QueueBottomSheetView: View {
    @Bindable var player: AudioPlayerManager
    @Environment(\.dismiss) private var dismiss

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                List {
                    // Autoplay Switch
                    Section {
                        Toggle(isOn: $player.isAutoplayEnabled) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Автовоспроизведение (Моя волна)")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.white)
                                Text("Бесконечное продолжение очереди по TrackDNA")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                        }
                        .tint(Color(hex: "#10B981"))
                        .listRowBackground(Color.white.opacity(0.04))
                    }

                    // Currently Playing
                    if let current = player.currentTrack {
                        Section("Сейчас играет") {
                            HStack(spacing: 12) {
                                AsyncImage(url: URL(string: current.coverUrl ?? "")) { img in
                                    img.resizable().scaledToFill()
                                } placeholder: {
                                    Color.amyPurple
                                }
                                .frame(width: 46, height: 46)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(current.title)
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(Color.amyPurpleBright)
                                    Text(current.artist)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.6))
                                }
                            }
                            .listRowBackground(Color.amyPurple.opacity(0.14))
                        }
                    }

                    // Upcoming in Queue with Drag-and-Drop Reordering
                    Section("Далее в очереди (\(max(0, player.queue.count - player.currentIndex - 1)))") {
                        ForEach(Array(player.queue.enumerated()), id: \.element.id) { index, track in
                            if index > player.currentIndex {
                                Button {
                                    player.playTrack(track)
                                } label: {
                                    HStack(spacing: 12) {
                                        AsyncImage(url: URL(string: track.coverUrl ?? "")) { img in
                                            img.resizable().scaledToFill()
                                        } placeholder: {
                                            Color.amyPurple.opacity(0.25)
                                        }
                                        .frame(width: 42, height: 42)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))

                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(track.title)
                                                .font(.system(size: 14, weight: .semibold))
                                                .foregroundStyle(.white)
                                                .lineLimit(1)
                                            Text(track.artist)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.55))
                                                .lineLimit(1)
                                        }

                                        Spacer()

                                        Text(track.formattedDuration)
                                            .font(.system(size: 12, design: .monospaced))
                                            .foregroundStyle(.white.opacity(0.45))
                                    }
                                }
                                .listRowBackground(Color.clear)
                            }
                        }
                        .onMove { source, dest in
                            player.moveQueueItem(from: source, to: dest)
                        }
                        .onDelete { offsets in
                            for idx in offsets {
                                player.removeFromQueue(at: idx)
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Очередь воспроизведения")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    EditButton().tint(Color.amyPurpleBright)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}

// MARK: - 10-Band Equalizer Modal Sheet (Port of src/components/EqualizerModal.jsx)

public struct EqualizerSheetView: View {
    @Bindable var player: AudioPlayerManager
    @Environment(\.dismiss) private var dismiss

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                VStack(spacing: 20) {
                    // Master Toggle + Reset Button
                    HStack {
                        Toggle("Эквалайзер (10 полос)", isOn: $player.settings.equalizerEnabled)
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(.white)
                            .tint(Color.amyPurple)

                        Button("Сбросить") {
                            player.selectEqualizerPreset(.flat)
                        }
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white.opacity(0.65))
                        .padding(.leading, 8)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                    // Preset Pills Row
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(EqualizerPreset.allCases) { preset in
                                let active = player.settings.equalizerPreset == preset
                                Button {
                                    player.selectEqualizerPreset(preset)
                                } label: {
                                    Text(preset.rawValue)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(active ? .black : .white)
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 8)
                                        .background(active ? .white : .white.opacity(0.08), in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                    }

                    // 10 Vertical Band Sliders (60 Hz .. 16 kHz, -12dB .. +12dB)
                    HStack(alignment: .center, spacing: 6) {
                        ForEach(0..<10, id: \.self) { index in
                            let gain = index < player.settings.equalizerBands.count ? player.settings.equalizerBands[index] : 0
                            VStack(spacing: 8) {
                                Text(String(format: "%+.0f", gain))
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundStyle(gain == 0 ? .white.opacity(0.45) : Color.amyPurpleBright)

                                GeometryReader { geo in
                                    ZStack(alignment: .bottom) {
                                        Capsule()
                                            .fill(.white.opacity(0.08))
                                            .frame(width: 8)

                                        let normalized = CGFloat((gain + 12.0) / 24.0)
                                        Capsule()
                                            .fill(
                                                LinearGradient(
                                                    colors: [Color.amyPurpleBright, Color.amyPurple],
                                                    startPoint: .top,
                                                    endPoint: .bottom
                                                )
                                            )
                                            .frame(width: 8, height: max(8, geo.size.height * normalized))
                                    }
                                    .frame(maxWidth: .infinity)
                                    .contentShape(Rectangle())
                                    .gesture(
                                        DragGesture(minimumDistance: 0)
                                            .onChanged { val in
                                                let ratio = 1.0 - min(1.0, max(0.0, val.location.y / geo.size.height))
                                                let db = Float(ratio * 24.0 - 12.0)
                                                let stepped = (db * 2.0).rounded() / 2.0
                                                player.setEqualizerBand(index, gain: stepped)
                                            }
                                    )
                                }
                                .frame(height: 170)

                                Text(EqualizerPreset.labels[index])
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .padding(.horizontal, 16)

                    // Studio Volume Normalization Toggle
                    Toggle(isOn: $player.settings.volumeNormalization) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Нормализация громкости (Studio Limiter)")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                            Text("Выравнивает уровень громкости между тихими и громкими треками")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.white.opacity(0.55))
                        }
                    }
                    .tint(Color.amyPurple)
                    .padding(16)
                    .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .padding(.horizontal, 16)

                    Spacer()
                }
            }
            .navigationTitle("Эквалайзер и Звук")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Native AirPlay Route Picker Wrapper

public struct AirPlayRoutePickerButton: UIViewRepresentable {
    public func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = UIColor.white.withAlphaComponent(0.65)
        picker.activeTintColor = UIColor(Color.amyPurpleBright)
        return picker
    }

    public func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
