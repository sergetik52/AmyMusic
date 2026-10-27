import SwiftUI

// MARK: - Artist Detail View & Album/Playlist Detail View
// Port of src/components/ArtistView.jsx & PlaylistView in CollectionView.jsx

public struct ArtistDetailSheetView: View {
    public var artistId: String
    @Bindable var player: AudioPlayerManager
    public var onOpenRelease: (ReleaseItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var profile: ArtistProfile? = nil
    @State private var isLoading: Bool = true
    @State private var showAllTracksSheet: Bool = false

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                if isLoading {
                    ProgressView("Загрузка артиста...")
                        .tint(Color.amyPurpleBright)
                        .foregroundStyle(.white.opacity(0.6))
                } else if let profile {
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 26) {
                            // Artist Hero Banner
                            ZStack(alignment: .bottom) {
                                AsyncImage(url: URL(string: profile.bannerUrl ?? profile.avatarUrl ?? "")) { img in
                                    img.resizable().scaledToFill()
                                } placeholder: {
                                    Color.amyPurple.opacity(0.35)
                                }
                                .frame(height: 310)
                                .blur(radius: 36)
                                .opacity(0.45)
                                .overlay {
                                    LinearGradient(
                                        colors: [.clear, Color.amyBackground],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                }

                                VStack(spacing: 12) {
                                    AsyncImage(url: URL(string: profile.avatarUrl ?? "")) { img in
                                        img.resizable().scaledToFill()
                                    } placeholder: {
                                        Circle().fill(Color.amyPurple.opacity(0.4))
                                    }
                                    .frame(width: 136, height: 136)
                                    .clipShape(Circle())
                                    .shadow(color: .black.opacity(0.55), radius: 24, y: 10)

                                    Text(profile.name)
                                        .font(.system(size: 32, weight: .black))
                                        .tracking(-0.8)
                                        .foregroundStyle(.white)
                                        .multilineTextAlignment(.center)

                                    HStack(spacing: 14) {
                                        Text("\(profile.trackCount) треков")
                                        Text("•")
                                        Text("\(profile.followersCount) подписчиков")
                                        if let city = profile.city, !city.isEmpty {
                                            Text("•")
                                            Text(city)
                                        }
                                    }
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                    if let bio = profile.bio, !bio.isEmpty {
                                        Text(bio)
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundStyle(.white.opacity(0.5))
                                            .lineLimit(2)
                                            .multilineTextAlignment(.center)
                                            .padding(.horizontal, 28)
                                    }

                                    // Action Buttons: "▶ Слушать все" & "Подписаться"
                                    HStack(spacing: 12) {
                                        Button {
                                            if let first = profile.popularTracks.first {
                                                player.playTrack(first, in: profile.popularTracks)
                                            }
                                        } label: {
                                            HStack(spacing: 8) {
                                                Image(systemName: "play.fill")
                                                Text("Слушать все")
                                            }
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundStyle(.black)
                                            .padding(.horizontal, 24)
                                            .padding(.vertical, 12)
                                            .background(.white, in: Capsule())
                                        }
                                        .buttonStyle(.plain)

                                        let artistRef = ArtistRef(id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl)
                                        let subscribed = player.isSubscribed(to: artistRef)
                                        Button {
                                            player.toggleArtistSubscription(artistRef)
                                        } label: {
                                            Text(subscribed ? "Вы подписаны" : "Подписаться")
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 20)
                                                .padding(.vertical, 12)
                                                .amyLiquidGlass(
                                                    in: Capsule(),
                                                    tint: subscribed ? Color.amyPurple : nil,
                                                    tintOpacity: subscribed ? 0.45 : 0.15,
                                                    interactive: true
                                                )
                                        }
                                        .buttonStyle(.plain)
                                    }

                                    // Genre #tag chips
                                    if !profile.tags.isEmpty {
                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 6) {
                                                ForEach(profile.tags, id: \.self) { tag in
                                                    Text("#\(tag)")
                                                        .font(.system(size: 11, weight: .semibold))
                                                        .foregroundStyle(.white.opacity(0.75))
                                                        .padding(.horizontal, 10)
                                                        .padding(.vertical, 5)
                                                        .background(.white.opacity(0.06), in: Capsule())
                                                }
                                            }
                                            .padding(.horizontal, 16)
                                        }
                                    }
                                }
                                .padding(.bottom, 8)
                            }

                            // "Новый релиз" Card (LatestReleaseCard)
                            if let latest = profile.latestRelease {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Новый релиз")
                                        .font(.system(size: 20, weight: .black))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 16)

                                    Button {
                                        onOpenRelease(latest)
                                    } label: {
                                        HStack(spacing: 14) {
                                            AsyncImage(url: URL(string: latest.coverUrl ?? "")) { img in
                                                img.resizable().scaledToFill()
                                            } placeholder: {
                                                Color.amyPurple.opacity(0.3)
                                            }
                                            .frame(width: 84, height: 84)
                                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(latest.kind.rawValue.uppercased())
                                                    .font(.system(size: 10, weight: .black))
                                                    .foregroundStyle(Color.amyPurpleBright)
                                                Text(latest.title)
                                                    .font(.system(size: 16, weight: .bold))
                                                    .foregroundStyle(.white)
                                                    .lineLimit(1)
                                                Text("\(latest.trackCount) треков")
                                                    .font(.system(size: 12, weight: .medium))
                                                    .foregroundStyle(.white.opacity(0.55))
                                            }
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .foregroundStyle(.white.opacity(0.4))
                                        }
                                        .padding(14)
                                        .amyLiquidGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                    .padding(.horizontal, 16)
                                }
                            }

                            // "Популярные треки" (5-row horizontal snap pager)
                            if !profile.popularTracks.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    HStack {
                                        Text("Популярные треки")
                                            .font(.system(size: 20, weight: .black))
                                            .foregroundStyle(.white)
                                        Spacer()
                                        Button("Все (\(profile.popularTracks.count))") {
                                            showAllTracksSheet = true
                                        }
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(Color.amyPurpleBright)
                                    }
                                    .padding(.horizontal, 16)

                                    let pages = stride(from: 0, to: min(profile.popularTracks.count, 10), by: 5).map {
                                        Array(profile.popularTracks[$0..<min($0 + 5, profile.popularTracks.count)])
                                    }

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(alignment: .top, spacing: 14) {
                                            ForEach(Array(pages.enumerated()), id: \.offset) { _, page in
                                                VStack(spacing: 6) {
                                                    ForEach(page) { track in
                                                        TrackRowItemView(
                                                            track: track,
                                                            player: player,
                                                            onTap: {
                                                                player.playTrack(track, in: profile.popularTracks)
                                                            },
                                                            onOpenArtist: { _ in }
                                                        )
                                                    }
                                                }
                                                .containerRelativeFrame(.horizontal, count: 1, spacing: 14)
                                            }
                                        }
                                        .scrollTargetLayout()
                                    }
                                    .scrollTargetBehavior(.viewAligned)
                                    .contentMargins(.horizontal, 16, for: .scrollContent)
                                }
                            }

                            // "Альбомы", "Синглы и EP", "Плейлисты"
                            if !profile.albums.isEmpty {
                                ReleaseHorizontalSection(title: "Альбомы", releases: profile.albums, onSelect: onOpenRelease)
                            }
                            if !profile.singles.isEmpty {
                                ReleaseHorizontalSection(title: "Синглы и EP", releases: profile.singles, onSelect: onOpenRelease)
                            }
                            if !profile.playlists.isEmpty {
                                ReleaseHorizontalSection(title: "Плейлисты", releases: profile.playlists, onSelect: onOpenRelease)
                            }

                            // "Похожие артисты"
                            if !profile.relatedArtists.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Похожие артисты")
                                        .font(.system(size: 20, weight: .black))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 16)

                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 16) {
                                            ForEach(profile.relatedArtists) { relArtist in
                                                VStack(spacing: 8) {
                                                    AsyncImage(url: URL(string: relArtist.avatarUrl ?? "")) { img in
                                                        img.resizable().scaledToFill()
                                                    } placeholder: {
                                                        Circle().fill(Color.amyPurple.opacity(0.3))
                                                    }
                                                    .frame(width: 96, height: 96)
                                                    .clipShape(Circle())

                                                    Text(relArtist.name)
                                                        .font(.system(size: 12, weight: .bold))
                                                        .foregroundStyle(.white)
                                                        .lineLimit(1)
                                                }
                                                .frame(width: 100)
                                            }
                                        }
                                        .padding(.horizontal, 16)
                                    }
                                }
                            }

                            Spacer(minLength: 80)
                        }
                    }
                } else {
                    ContentUnavailableView("Артист не найден", systemImage: "person.slash")
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .amyLiquidGlass(in: Circle())
                    }
                }
            }
        }
        .task {
            isLoading = true
            profile = await SoundCloudService.shared.fetchArtistProfile(artistId: artistId)
            isLoading = false
        }
    }
}

// MARK: - Album & Playlist Detail Sheet View (Port of AlbumView & PlaylistView)

public struct AlbumOrPlaylistSheetView: View {
    public var release: ReleaseItem
    @Bindable var player: AudioPlayerManager
    public var onOpenArtist: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var hydratedRelease: ReleaseItem? = nil
    @State private var isLoading: Bool = false
    @State private var isCoverLightboxOpen: Bool = false

    private var activeRelease: ReleaseItem {
        hydratedRelease ?? release
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                Color.amyBackground.ignoresSafeArea()

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 22) {
                        // Blurred Cover Header + 200x200 Cover Art
                        ZStack {
                            AsyncImage(url: URL(string: activeRelease.coverUrl ?? "")) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                Color.amyPurple.opacity(0.3)
                            }
                            .frame(height: 260)
                            .blur(radius: 45)
                            .opacity(0.38)

                            VStack(spacing: 14) {
                                Button {
                                    isCoverLightboxOpen = true
                                } label: {
                                    AsyncImage(url: URL(string: activeRelease.coverUrl ?? "")) { img in
                                        img.resizable().scaledToFill()
                                    } placeholder: {
                                        Color.amyPurple.opacity(0.35)
                                    }
                                    .frame(width: 196, height: 196)
                                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                                    .shadow(color: .black.opacity(0.55), radius: 24, y: 12)
                                }
                                .buttonStyle(.plain)

                                Text(activeRelease.kind.rawValue.uppercased())
                                    .font(.system(size: 11, weight: .black))
                                    .tracking(1.0)
                                    .foregroundStyle(Color.amyPurpleBright)

                                Text(activeRelease.title)
                                    .font(.system(size: 26, weight: .black))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 16)

                                Text("\(activeRelease.artist) • \(activeRelease.tracks.count) треков")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                // Action Buttons: Play All, Shuffle, Save/Like Release
                                HStack(spacing: 14) {
                                    Button {
                                        if let first = activeRelease.tracks.first {
                                            player.playTrack(first, in: activeRelease.tracks)
                                        }
                                    } label: {
                                        HStack(spacing: 8) {
                                            Image(systemName: "play.fill")
                                            Text("Слушать")
                                        }
                                        .font(.system(size: 15, weight: .bold))
                                        .foregroundStyle(.black)
                                        .padding(.horizontal, 26)
                                        .padding(.vertical, 12)
                                        .background(.white, in: Capsule())
                                    }
                                    .buttonStyle(.plain)

                                    Button {
                                        var shuffled = activeRelease.tracks
                                        shuffled.shuffle()
                                        if let first = shuffled.first {
                                            player.playTrack(first, in: shuffled)
                                        }
                                    } label: {
                                        Image(systemName: "shuffle")
                                            .font(.system(size: 16, weight: .bold))
                                            .foregroundStyle(.white)
                                            .frame(width: 44, height: 44)
                                            .amyLiquidGlass(in: Circle(), interactive: true)
                                    }
                                    .buttonStyle(.plain)

                                    let isSaved = player.savedReleases.contains(where: { $0.id == activeRelease.id })
                                    Button {
                                        player.toggleSavedRelease(activeRelease)
                                    } label: {
                                        Image(systemName: isSaved ? "heart.fill" : "heart")
                                            .font(.system(size: 16, weight: .bold))
                                            .foregroundStyle(isSaved ? Color.amyPurpleBright : .white)
                                            .frame(width: 44, height: 44)
                                            .amyLiquidGlass(in: Circle(), interactive: true)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.top, 16)
                        }

                        if isLoading && activeRelease.tracks.isEmpty {
                            ProgressView("Загрузка треков релиза...")
                                .tint(Color.amyPurpleBright)
                                .padding(.top, 30)
                        } else {
                            LazyVStack(spacing: 6) {
                                ForEach(activeRelease.tracks) { track in
                                    TrackRowItemView(
                                        track: track,
                                        player: player,
                                        onTap: {
                                            player.playTrack(track, in: activeRelease.tracks)
                                        },
                                        onOpenArtist: onOpenArtist
                                    )
                                }
                            }
                            .padding(.horizontal, 14)
                        }

                        Spacer(minLength: 80)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Закрыть") { dismiss() }
                }
                if activeRelease.kind == .userPlaylist {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(role: .destructive) {
                            player.deleteUserPlaylist(id: activeRelease.id)
                            dismiss()
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
        }
        .task {
            if release.tracks.isEmpty && release.id.hasPrefix("sc_pl_") {
                isLoading = true
                hydratedRelease = await SoundCloudService.shared.hydrateReleaseTracks(release)
                isLoading = false
            }
        }
    }
}
