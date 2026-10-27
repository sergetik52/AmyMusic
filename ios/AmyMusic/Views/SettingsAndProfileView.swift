import SwiftUI
import PhotosUI

// MARK: - Settings, Profile, Customization, Cache Gauge & Avatar Cropper
// Port of src/components/SettingsView.jsx, ProfileSettingsModal & src/components/AvatarCropperModal.jsx

public enum SettingsSectionTab: String, CaseIterable, Identifiable {
    case profile = "Профиль"
    case customization = "Кастомизация"
    case audio = "Аудио"
    case cache = "Кеш"
    case integrations = "Интеграции"

    public var id: String { rawValue }
}

public struct SettingsAndProfileView: View {
    @Bindable var player: AudioPlayerManager
    @Environment(\.dismiss) private var dismiss

    @State private var activeSection: SettingsSectionTab = .profile
    @State private var isAvatarCropperOpen: Bool = false

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                VStack(spacing: 16) {
                    // Top Pill Tabs
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(SettingsSectionTab.allCases) { tab in
                                let active = activeSection == tab
                                Button {
                                    UISelectionFeedbackGenerator().selectionChanged()
                                    withAnimation(.spring(duration: 0.25)) {
                                        activeSection = tab
                                    }
                                } label: {
                                    Text(tab.rawValue)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(active ? .black : .white.opacity(0.8))
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 9)
                                        .background(active ? .white : .white.opacity(0.07), in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .padding(.top, 8)

                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 20) {
                            switch activeSection {
                            case .profile:
                                profileTabContent
                            case .customization:
                                customizationTabContent
                            case .audio:
                                audioTabContent
                            case .cache:
                                cacheTabContent
                            case .integrations:
                                integrationsTabContent
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 50)
                    }
                }
            }
            .navigationTitle("Настройки AmyMusic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                        .fontWeight(.bold)
                }
            }
            .sheet(isPresented: $isAvatarCropperOpen) {
                AvatarCropperSheetView(player: player)
            }
        }
    }

    // MARK: - 1. Profile Tab

    private var profileTabContent: some View {
        VStack(spacing: 18) {
            VStack(spacing: 14) {
                Button {
                    isAvatarCropperOpen = true
                } label: {
                    ZStack(alignment: .bottomTrailing) {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color(hex: player.settings.themePreset.primaryHex),
                                        Color(hex: player.settings.themePreset.secondaryHex)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 96, height: 96)

                        Text(String(player.settings.displayName.prefix(1)).uppercased())
                            .font(.system(size: 38, weight: .black))
                            .foregroundStyle(.white)

                        Image(systemName: "camera.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(.white)
                            .background(Circle().fill(.black))
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Отображаемое имя")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.55))

                    TextField("Имя профиля", text: $player.settings.displayName)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(13)
                        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))

                    Text("О себе")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.55))

                    TextField("У вашей музыки есть цвет", text: $player.settings.bio)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(13)
                        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(20)
            .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            // Listening Statistics Card
            HStack(spacing: 14) {
                StatPillCard(
                    title: "Прослушано",
                    value: "\(player.totalListenedSeconds / 3600)ч \((player.totalListenedSeconds % 3600) / 60)м",
                    icon: "headphones"
                )
                StatPillCard(
                    title: "Любимые",
                    value: "\(player.likedTracks.count) тр.",
                    icon: "heart.fill"
                )
                StatPillCard(
                    title: "История",
                    value: "\(player.playHistory.count) тр.",
                    icon: "clock.fill"
                )
            }
        }
    }

    // MARK: - 2. Customization & Liquid Glass Tab

    private var customizationTabContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            // 6 Theme Presets
            VStack(alignment: .leading, spacing: 12) {
                Text("Цветовая тема (6 пресетов)")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(.white)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(ThemePreset.allCases) { preset in
                        let selected = player.settings.themePreset == preset
                        Button {
                            UISelectionFeedbackGenerator().selectionChanged()
                            player.settings.themePreset = preset
                        } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(hex: preset.primaryHex), Color(hex: preset.secondaryHex)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 24, height: 24)

                                Text(preset.rawValue)
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                                    .lineLimit(1)
                                Spacer()
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(selected ? Color(hex: preset.primaryHex).opacity(0.24) : .white.opacity(0.05))
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(selected ? Color(hex: preset.primaryHex) : .white.opacity(0.08), lineWidth: selected ? 2 : 1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(18)
            .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            // iOS 26 Liquid Glass & Mini-Player Variant
            VStack(alignment: .leading, spacing: 14) {
                Text("Стиль мини-плеера и Liquid Glass")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(.white)

                Picker("Стиль мини-плеера", selection: $player.settings.miniPlayerStyle) {
                    ForEach(MiniPlayerStyle.allCases) { style in
                        Text(style.rawValue).tag(style)
                    }
                }
                .pickerStyle(.segmented)

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Интенсивность оттенка Liquid Glass")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.75))
                        Spacer()
                        Text("\(Int(player.settings.glassTintIntensity * 100))%")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.amyPurpleBright)
                    }
                    Slider(value: $player.settings.glassTintIntensity, in: 0.05...0.75)
                        .tint(Color.amyPurpleBright)
                }

                Toggle("Свечение обложки в полном плеере", isOn: $player.settings.fullPlayerGlowEnabled)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .tint(Color.amyPurple)

                Toggle("Dynamic Island & Live Activity (iOS 26)", isOn: $player.settings.liveActivityEnabled)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .tint(Color.amyPurple)
            }
            .padding(18)
            .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    // MARK: - 3. Audio Tab (192 / 256 / 320 / 1411 kbps + Crossfade)

    private var audioTabContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Качество аудиопотока")
                    .font(.system(size: 16, weight: .black))
                    .foregroundStyle(.white)

                ForEach(AudioQualityTier.allCases) { tier in
                    let active = player.settings.audioQuality == tier
                    Button {
                        UISelectionFeedbackGenerator().selectionChanged()
                        player.settings.audioQuality = tier
                    } label: {
                        HStack {
                            Text(tier.title)
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                            Spacer()
                            Image(systemName: active ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(active ? Color.amyPurpleBright : .white.opacity(0.35))
                        }
                        .padding(14)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(active ? Color.amyPurple.opacity(0.22) : .white.opacity(0.05))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(18)
            .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))

            VStack(alignment: .leading, spacing: 14) {
                Toggle("Плавный переход (Crossfade)", isOn: $player.settings.crossfadeEnabled)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .tint(Color.amyPurple)

                if player.settings.crossfadeEnabled {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Длительность перехода")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.white.opacity(0.65))
                            Spacer()
                            Text("\(Int(player.settings.crossfadeSeconds)) сек")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundStyle(Color.amyPurpleBright)
                        }
                        Slider(value: $player.settings.crossfadeSeconds, in: 1...12, step: 1)
                            .tint(Color.amyPurpleBright)
                    }
                }

                Toggle("Воспроизведение без пауз (Gapless)", isOn: $player.settings.gaplessPlayback)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .tint(Color.amyPurple)

                Toggle("Нормализация громкости", isOn: $player.settings.volumeNormalization)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .tint(Color.amyPurple)
            }
            .padding(18)
            .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    // MARK: - 4. Cache Gauge Tab (220x220 Circular Storage Gauge)

    private var cacheTabContent: some View {
        VStack(spacing: 22) {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.08), lineWidth: 18)
                    .frame(width: 200, height: 200)

                Circle()
                    .trim(from: 0, to: 0.38)
                    .stroke(
                        LinearGradient(
                            colors: [Color.amyPurple, Color.amyPurpleBright],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        style: StrokeStyle(lineWidth: 18, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .frame(width: 200, height: 200)

                VStack(spacing: 4) {
                    Text("Кеш медиа")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.55))
                    Text("Активен")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(.white)
                }
            }
            .padding(.top, 12)

            Button {
                URLCache.shared.removeAllCachedResponses()
                Task { await LyricsService.shared.clearCache() }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } label: {
                Label("Очистить кеш аудио, обложек и текстов", systemImage: "trash.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.red.opacity(0.8), in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(22)
        .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    // MARK: - 5. Integrations / Developer Tab

    private var integrationsTabContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("SoundCloud API v2 & Yandex Music")
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(.white)

            VStack(alignment: .leading, spacing: 6) {
                Text("SoundCloud Client ID")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.6))
                TextField("Client ID", text: $player.settings.soundCloudClientId)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(12)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Yandex Music OAuth Token (опционально для Персональной Ротор-волны)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.6))
                SecureField("y0_AgAAAA...", text: $player.settings.yandexOAuthToken)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(.white)
                    .padding(12)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("HTTP Прокси (через запятую)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white.opacity(0.6))
                TextField("ip:port, ip:port", text: $player.settings.customHttpProxies)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(.white)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(12)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(18)
        .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct StatPillCard: View {
    var title: String
    var value: String
    var icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.amyPurpleBright)
            Text(value)
                .font(.system(size: 16, weight: .black))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

// MARK: - Interactive Circular Pan-and-Zoom Avatar Cropper (Port of AvatarCropperModal.jsx)

public struct AvatarCropperSheetView: View {
    @Bindable var player: AudioPlayerManager
    @Environment(\.dismiss) private var dismiss

    @State private var selectedItem: PhotosPickerItem? = nil
    @State private var selectedImage: UIImage? = nil
    @State private var zoomScale: CGFloat = 1.0
    @State private var panOffset: CGSize = .zero

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                VStack(spacing: 24) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(.white.opacity(0.05))
                            .frame(width: 280, height: 280)

                        if let selectedImage {
                            Image(uiImage: selectedImage)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 248, height: 248)
                                .scaleEffect(zoomScale)
                                .offset(panOffset)
                                .clipShape(Circle())
                                .gesture(
                                    DragGesture()
                                        .onChanged { val in
                                            panOffset = val.translation
                                        }
                                )
                        } else {
                            Circle()
                                .strokeBorder(.white.opacity(0.25), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                                .frame(width: 248, height: 248)
                                .overlay {
                                    Text("Выберите фото")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.5))
                                }
                        }
                    }

                    VStack(spacing: 8) {
                        HStack {
                            Text("Масштаб")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(.white.opacity(0.6))
                            Spacer()
                            Text("\(Int(zoomScale * 100))%")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundStyle(Color.amyPurpleBright)
                        }
                        Slider(value: $zoomScale, in: 0.5...3.0)
                            .tint(Color.amyPurpleBright)
                    }
                    .padding(.horizontal, 28)

                    PhotosPicker(selection: $selectedItem, matching: .images) {
                        Label("Выбрать изображение из галереи", systemImage: "photo.on.rectangle")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .amyLiquidGlass(in: Capsule(), tint: Color.amyPurple, tintOpacity: 0.35)
                    }
                    .padding(.horizontal, 28)
                }
            }
            .navigationTitle("Обрезка аватара")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") { dismiss() }
                        .fontWeight(.bold)
                }
            }
            .onChange(of: selectedItem) { _, newItem in
                guard let newItem else { return }
                Task {
                    if let data = try? await newItem.loadTransferable(type: Data.self),
                       let img = UIImage(data: data) {
                        selectedImage = img
                        zoomScale = 1.0
                        panOffset = .zero
                    }
                }
            }
        }
    }
}
