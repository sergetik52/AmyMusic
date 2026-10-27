import Foundation

// MARK: - SoundCloud API v2 Native Service (Port of src/services/soundCloudApi.js)

public actor SoundCloudService {
    public static let shared = SoundCloudService()

    private let baseURL = "https://api-v2.soundcloud.com"
    private let defaultClientId = "yNSW5UvBmb1A5j7qPUtIMuB9Itx3jsOC"
    private var customClientId: String?
    private var avatarCache: [String: String] = [:]

    // TrackDNA Genre Family Tree (matching GENRE_FAMILIES in soundCloudApi.js)
    private let genreFamilies: [String: [String]] = [
        "hip-hop": ["hip-hop", "hip hop", "rap", "trap", "cloud rap", "boom bap", "memphis"],
        "trap": ["trap", "rage", "pluggnb", "plugg", "dark trap", "hip-hop", "rap"],
        "phonk": ["phonk", "drift phonk", "house phonk", "memphis", "cowbell", "aggressive phonk"],
        "drill": ["drill", "uk drill", "ny drill", "chicago drill", "grime", "trap"],
        "electronic": ["electronic", "edm", "synthwave", "electro", "club", "dance", "bass"],
        "house": ["house", "deep house", "tech house", "bass house", "slap house", "progressive house"],
        "techno": ["techno", "hard techno", "acid techno", "industrial", "minimal", "rave"],
        "hyperpop": ["hyperpop", "glitchcore", "digicore", "sigilkore", "webcore", "electropop"],
        "rock": ["rock", "alt rock", "indie rock", "post-punk", "grunge", "punk", "metal"],
        "post-punk": ["post-punk", "coldwave", "darkwave", "new wave", "synth-pop", "doomer"],
        "pop": ["pop", "indie pop", "dance pop", "synthpop", " bedroom pop", "dream pop"],
        "r&b": ["r&b", "rnb", "soul", "neo-soul", "alternative r&b", "contemporary r&b"],
        "lofi": ["lofi", "lo-fi", "chillhop", "jazzhop", "study beats", "ambient"]
    ]

    private let moodTokens: [String: [String]] = [
        "dark": ["dark", "night", "shadow", "evil", "demon", "murder", "dead", "black", "phonk", "witch"],
        "chill": ["chill", "relax", "lofi", "calm", "soft", "sleep", "ambient", "warm", "breeze"],
        "hard": ["hard", "rage", "aggressive", "bass", "distortion", "gym", "drift", "krush"],
        "sad": ["sad", "cry", "pain", "lonely", "broken", "tears", "alone", "doomer", "melancholy"],
        "happy": ["happy", "summer", "sun", "vibe", "party", "dance", "bright", "feel good"],
        "dreamy": ["dream", "space", "cloud", "float", "angel", "ethereal", "stars", "heaven"]
    ]

    public func updateClientId(_ clientId: String?) {
        let trimmed = clientId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.customClientId = trimmed.isEmpty ? nil : trimmed
    }

    private var activeClientId: String {
        customClientId ?? defaultClientId
    }

    // MARK: - Core Request Builder

    private func requestJSON(path: String, queryItems: [URLQueryItem] = []) async throws -> Any {
        var components = URLComponents(string: path.hasPrefix("http") ? path : "\(baseURL)\(path)")
        var items = components?.queryItems ?? []
        if !items.contains(where: { $0.name == "client_id" }) {
            items.append(URLQueryItem(name: "client_id", value: activeClientId))
        }
        items.append(contentsOf: queryItems)
        components?.queryItems = items

        guard let url = components?.url else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 14
        request.setValue("https://soundcloud.com", forHTTPHeaderField: "Origin")
        request.setValue("https://soundcloud.com/", forHTTPHeaderField: "Referer")
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    // MARK: - Search Endpoints

    public func searchTracks(query: String, limit: Int = 20) async -> [Track] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        do {
            let json = try await requestJSON(
                path: "/search/tracks",
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "limit", value: "\(limit)")
                ]
            )
            guard let dict = json as? [String: Any],
                  let collection = dict["collection"] as? [[String: Any]] else {
                return []
            }
            return collection.compactMap { normalizeTrack($0) }
        } catch {
            return []
        }
    }

    public func searchArtists(query: String, limit: Int = 24) async -> [ArtistRef] {
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        do {
            let json = try await requestJSON(
                path: "/search/users",
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "limit", value: "\(limit)")
                ]
            )
            guard let dict = json as? [String: Any],
                  let collection = dict["collection"] as? [[String: Any]] else {
                return []
            }
            return collection.compactMap { user in
                guard let id = user["id"] else { return nil }
                let name = (user["username"] as? String) ?? (user["full_name"] as? String) ?? "Unknown"
                let avatar = upgradeArtworkUrl(user["avatar_url"] as? String)
                return ArtistRef(
                    id: "\(id)",
                    name: name,
                    avatarUrl: avatar,
                    permalinkUrl: user["permalink_url"] as? String
                )
            }
        } catch {
            return []
        }
    }

    public func searchReleases(query: String, albumsOnly: Bool = false, limit: Int = 24) async -> [ReleaseItem] {
        let endpoint = albumsOnly ? "/search/albums" : "/search/playlists"
        do {
            let json = try await requestJSON(
                path: endpoint,
                queryItems: [
                    URLQueryItem(name: "q", value: query),
                    URLQueryItem(name: "limit", value: "\(limit)")
                ]
            )
            guard let dict = json as? [String: Any],
                  let collection = dict["collection"] as? [[String: Any]] else {
                return []
            }
            return collection.compactMap { normalizePlaylist($0, forceKind: albumsOnly ? .album : .playlist) }
        } catch {
            return []
        }
    }

    // MARK: - Stream Resolution & Snippet Workaround

    public func resolveStreamUrl(for track: Track, quality: AudioQualityTier = .q320) async -> (url: String, isHls: Bool)? {
        // If track is a 30s Go+ snippet, try searching for a full non-snippet replacement first
        if track.isSnippet {
            let candidates = await searchTracks(query: "\(track.artist) \(track.title)", limit: 6)
            if let replacement = candidates.first(where: { !$0.isSnippet && $0.duration > 45 }),
               let transcoding = replacement.transcodingUrl {
                if let resolved = await fetchTranscodingUrl(transcoding) {
                    return (resolved, replacement.isHls || resolved.contains(".m3u8"))
                }
            }
        }

        if let transcoding = track.transcodingUrl,
           let resolved = await fetchTranscodingUrl(transcoding) {
            let isHls = track.isHls || resolved.contains(".m3u8") || resolved.contains("/hls/")
            return (resolved, isHls)
        }

        // Refetch fresh track object by ID if transcoding expired
        let cleanId = track.rawId.replacingOccurrences(of: "sc_", with: "")
        if let json = try? await requestJSON(path: "/tracks/\(cleanId)") as? [String: Any],
           let refreshed = normalizeTrack(json, preferredQuality: quality),
           let transcoding = refreshed.transcodingUrl,
           let resolved = await fetchTranscodingUrl(transcoding) {
            return (resolved, refreshed.isHls || resolved.contains(".m3u8"))
        }

        return nil
    }

    private func fetchTranscodingUrl(_ transcodingUrl: String) async -> String? {
        do {
            let json = try await requestJSON(path: transcodingUrl)
            if let dict = json as? [String: Any], let url = dict["url"] as? String {
                return url
            }
        } catch {}
        return nil
    }

    // MARK: - Artist Profile & Hydration

    public func fetchArtistProfile(artistId: String) async -> ArtistProfile? {
        let cleanId = artistId.replacingOccurrences(of: "sc_user_", with: "")
        async let userReq = try? requestJSON(path: "/users/\(cleanId)")
        async let tracksReq = try? requestJSON(path: "/users/\(cleanId)/tracks", queryItems: [URLQueryItem(name: "limit", value: "80")])
        async let albumsReq = try? requestJSON(path: "/users/\(cleanId)/albums", queryItems: [URLQueryItem(name: "limit", value: "24")])
        async let playlistsReq = try? requestJSON(path: "/users/\(cleanId)/playlists", queryItems: [URLQueryItem(name: "limit", value: "24")])
        async let followingsReq = try? requestJSON(path: "/users/\(cleanId)/followings", queryItems: [URLQueryItem(name: "limit", value: "12")])

        let (userAny, tracksAny, albumsAny, playlistsAny, followingsAny) = await (userReq, tracksReq, albumsReq, playlistsReq, followingsReq)

        guard let userDict = userAny as? [String: Any] else { return nil }

        let name = (userDict["username"] as? String) ?? "Артист"
        let avatar = upgradeArtworkUrl(userDict["avatar_url"] as? String)
        let visuals = (userDict["visuals"] as? [String: Any])?["visuals"] as? [[String: Any]]
        let banner = upgradeArtworkUrl(visuals?.first?["visual_url"] as? String) ?? avatar

        let rawTracks = ((tracksAny as? [String: Any])?["collection"] as? [[String: Any]]) ?? []
        let normalizedTracks = rawTracks.compactMap { normalizeTrack($0) }
            .sorted { $0.playbackCount > $1.playbackCount }

        let rawAlbums = ((albumsAny as? [String: Any])?["collection"] as? [[String: Any]]) ?? []
        let allReleases = rawAlbums.compactMap { normalizePlaylist($0, forceKind: .album) }
        let albums = allReleases.filter { $0.trackCount > 2 }
        let singles = allReleases.filter { $0.trackCount <= 2 }.map {
            var copy = $0
            copy.kind = .single
            return copy
        }

        let rawPlaylists = ((playlistsAny as? [String: Any])?["collection"] as? [[String: Any]]) ?? []
        let playlists = rawPlaylists.compactMap { normalizePlaylist($0, forceKind: .playlist) }

        let rawFollowings = ((followingsAny as? [String: Any])?["collection"] as? [[String: Any]]) ?? []
        let related: [ArtistRef] = rawFollowings.compactMap { f in
            guard let id = f["id"] else { return nil }
            return ArtistRef(
                id: "\(id)",
                name: (f["username"] as? String) ?? "Artist",
                avatarUrl: upgradeArtworkUrl(f["avatar_url"] as? String)
            )
        }

        let featTracks = normalizedTracks.filter { $0.artists.count > 1 }
        var tags: [String] = []
        for t in normalizedTracks.prefix(12) {
            if let g = t.genre, !g.isEmpty, !tags.contains(g) {
                tags.append(g)
            }
        }

        return ArtistProfile(
            id: "\(userDict["id"] ?? cleanId)",
            name: name,
            username: (userDict["permalink"] as? String) ?? name,
            avatarUrl: avatar,
            bannerUrl: banner,
            bio: userDict["description"] as? String,
            city: userDict["city"] as? String,
            followersCount: (userDict["followers_count"] as? Int) ?? 0,
            trackCount: (userDict["track_count"] as? Int) ?? normalizedTracks.count,
            popularTracks: Array(normalizedTracks.prefix(20)),
            latestRelease: allReleases.first ?? singles.first,
            featTracks: featTracks,
            albums: albums,
            singles: singles,
            playlists: playlists,
            relatedArtists: related,
            tags: Array(tags.prefix(6))
        )
    }

    public func hydrateReleaseTracks(_ release: ReleaseItem) async -> ReleaseItem {
        let cleanId = release.id.replacingOccurrences(of: "sc_pl_", with: "")
        guard let dict = try? await requestJSON(path: "/playlists/\(cleanId)") as? [String: Any],
              let rawTracks = dict["tracks"] as? [[String: Any]] else {
            return release
        }

        var fullTracks: [Track] = []
        var stubIds: [String] = []

        for item in rawTracks {
            if item["title"] != nil, let t = normalizeTrack(item) {
                fullTracks.append(t)
            } else if let id = item["id"] {
                stubIds.append("\(id)")
            }
        }

        // Batch hydrate stub tracks in chunks of 50 (matching /tracks?ids=...)
        for chunkStart in stride(from: 0, to: stubIds.count, by: 50) {
            let chunk = Array(stubIds[chunkStart..<min(chunkStart + 50, stubIds.count)])
            if let arr = try? await requestJSON(
                path: "/tracks",
                queryItems: [URLQueryItem(name: "ids", value: chunk.joined(separator: ","))]
            ) as? [[String: Any]] {
                let hydrated = arr.compactMap { normalizeTrack($0) }
                fullTracks.append(contentsOf: hydrated)
            }
        }

        var updated = release
        updated.tracks = fullTracks
        updated.trackCount = fullTracks.count
        return updated
    }

    // MARK: - Algorithm 1: Personal Wave ("Моя волна" - Port of getPersonalWaveTracks)

    public func getPersonalWaveTracks(
        seeds: [WaveSeed],
        playHistory: [Track],
        likedTracks: [Track],
        dislikedTracks: [Track],
        currentTrack: Track?
    ) async -> [Track] {
        var artistWeights: [String: Double] = [:]
        var genreWeights: [String: Double] = [:]
        var dislikedArtistWeights: [String: Double] = [:]
        var dislikedIds = Set(dislikedTracks.map(\.id))

        for seed in seeds {
            artistWeights[seed.name.lowercased(), default: 0] += 3.2
        }

        for (index, track) in likedTracks.prefix(25).enumerated() {
            let recency = max(0.35, 1.0 - Double(index) * 0.03)
            artistWeights[track.artist.lowercased(), default: 0] += 1.25 * recency
            if let genre = track.genre?.lowercased(), !genre.isEmpty {
                genreWeights[genre, default: 0] += 1.1 * recency
            }
        }

        for (index, track) in playHistory.prefix(25).enumerated() {
            let recency = max(0.25, 1.0 - Double(index) * 0.035)
            artistWeights[track.artist.lowercased(), default: 0] += 0.8 * recency
            if let genre = track.genre?.lowercased(), !genre.isEmpty {
                genreWeights[genre, default: 0] += 0.75 * recency
            }
        }

        for track in dislikedTracks {
            dislikedIds.insert(track.id)
            dislikedArtistWeights[track.artist.lowercased(), default: 0] += 1.5
        }

        let topArtists = artistWeights.sorted { $0.value > $1.value }.prefix(5).map(\.key)
        let topGenres = genreWeights.sorted { $0.value > $1.value }.prefix(4).map(\.key)

        var queries: [String] = []
        queries.append(contentsOf: seeds.prefix(4).map(\.name))
        queries.append(contentsOf: topArtists)
        queries.append(contentsOf: topGenres)

        if queries.isEmpty {
            queries = ["Kai Angel", "9mice", "PHARAOH", "phonk", "hyperpop", "Платина", "madk1d", "trap"]
        }

        var candidatePool: [Track] = []

        // Parallel fetch of related tracks + search queries
        await withTaskGroup(of: [Track].self) { group in
            let seedTracks = Array(([currentTrack].compactMap { $0 } + likedTracks.prefix(4) + playHistory.prefix(3)).prefix(6))
            for seedTrack in seedTracks where seedTrack.source == .soundcloud {
                let rawId = seedTrack.rawId.replacingOccurrences(of: "sc_", with: "")
                group.addTask {
                    await self.fetchRelatedTracks(trackId: rawId, limit: 15)
                }
            }
            for q in Array(Set(queries)).prefix(8) {
                group.addTask {
                    await self.searchTracks(query: q, limit: 15)
                }
            }

            for await tracks in group {
                candidatePool.append(contentsOf: tracks)
            }
        }

        let historyIds = Set(playHistory.prefix(20).map(\.id))

        let scored: [(track: Track, score: Double)] = candidatePool.compactMap { track in
            guard !dislikedIds.contains(track.id) else { return nil }
            var score: Double = 0
            let artistKey = track.artist.lowercased()
            let genreKey = (track.genre ?? "").lowercased()

            if let w = artistWeights[artistKey] {
                score += min(46, w * 11.0)
            }
            if let gw = genreWeights[genreKey] {
                score += min(34, gw * 9.0)
            }
            if track.playbackCount > 0 {
                score += min(34, log10(Double(track.playbackCount)) * 5.2)
            }
            if track.likesCount > 0 {
                score += min(18, log10(Double(track.likesCount)) * 4.0)
            }
            if historyIds.contains(track.id) {
                score -= 25
            }
            if let dw = dislikedArtistWeights[artistKey] {
                score -= 42.0 * dw
            }
            return (track, score)
        }.sorted { $0.score > $1.score }

        return diversifyWaveTracks(scored.map(\.track), maxCount: 60)
    }

    // MARK: - Algorithm 2: TrackDNA 5-Dimension Wave ("Волна по треку" - Port of getTrackWaveTracks)

    public func getTrackWaveTracks(seedTrack: Track, dislikedIds: Set<String> = []) async -> [Track] {
        let seedGenre = (seedTrack.genre ?? "").lowercased()
        let seedText = "\(seedTrack.title) \(seedTrack.genre ?? "") \(seedTrack.tagList ?? "")".lowercased()

        // 1. Identify Genre Family
        let matchedFamily: [String] = genreFamilies.first(where: { key, values in
            seedGenre.contains(key) || values.contains(where: { seedText.contains($0) })
        })?.value ?? [seedGenre].filter { !$0.isEmpty }

        // 2. Identify Mood Palette
        let seedMoods = moodTokens.compactMap { mood, tokens in
            tokens.contains(where: { seedText.contains($0) }) ? mood : nil
        }

        // 3. Energy Class (0 = slow/ambient, 1 = mid, 2 = fast/hard)
        let seedEnergy: Int = {
            if seedTrack.duration > 300 || seedMoods.contains("chill") { return 0 }
            if seedTrack.duration < 135 || seedMoods.contains("hard") { return 2 }
            return 1
        }()

        // 4. Popularity Band (0 = <10k, 1 = 10k..500k, 2 = >500k)
        let seedPopBand: Int = {
            if seedTrack.playbackCount < 10_000 { return 0 }
            if seedTrack.playbackCount <= 500_000 { return 1 }
            return 2
        }()

        let rawId = seedTrack.rawId.replacingOccurrences(of: "sc_", with: "")
        async let related = fetchRelatedTracks(trackId: rawId, limit: 24)
        async let artistSearch = searchTracks(query: seedTrack.artist, limit: 16)
        async let genreSearch = searchTracks(query: "\(seedTrack.artist) \(matchedFamily.first ?? "")", limit: 16)

        let combined = await related + artistSearch + genreSearch

        let scored = combined.compactMap { candidate -> (Track, Double)? in
            guard candidate.id != seedTrack.id, !dislikedIds.contains(candidate.id) else { return nil }
            var score: Double = 0
            let candText = "\(candidate.title) \(candidate.genre ?? "") \(candidate.tagList ?? "")".lowercased()

            // Dimension 1: Genre family overlap (+50 max)
            if matchedFamily.contains(where: { candText.contains($0) }) {
                score += 50
            }
            // Dimension 2: Mood overlap (+30 max)
            let candMoods = moodTokens.compactMap { mood, tokens in
                tokens.contains(where: { candText.contains($0) }) ? mood : nil
            }
            let sharedMoods = Set(seedMoods).intersection(candMoods).count
            score += min(30, Double(sharedMoods) * 15)

            // Dimension 3: Energy class match (+25 max)
            let candEnergy = candidate.duration > 300 ? 0 : (candidate.duration < 135 ? 2 : 1)
            if candEnergy == seedEnergy { score += 25 }

            // Dimension 4: Popularity band match (+20 max)
            let candPop = candidate.playbackCount < 10_000 ? 0 : (candidate.playbackCount <= 500_000 ? 1 : 2)
            if candPop == seedPopBand { score += 20 }

            // Dimension 5: Popularity log boost (+18 max)
            if candidate.playbackCount > 0 {
                score += min(18, log10(Double(candidate.playbackCount)) * 3.2)
            }
            return (candidate, score)
        }.sorted { $0.1 > $1.1 }

        return diversifyWaveTracks(scored.map(\.0), maxCount: 40)
    }

    public func fetchRelatedTracks(trackId: String, limit: Int = 20) async -> [Track] {
        do {
            let json = try await requestJSON(
                path: "/tracks/\(trackId)/related",
                queryItems: [URLQueryItem(name: "limit", value: "\(limit)")]
            )
            guard let dict = json as? [String: Any],
                  let collection = dict["collection"] as? [[String: Any]] else {
                return []
            }
            return collection.compactMap { normalizeTrack($0) }
        } catch {
            return []
        }
    }

    private func diversifyWaveTracks(_ tracks: [Track], maxCount: Int) -> [Track] {
        var seenIds = Set<String>()
        var artistCounts: [String: Int] = [:]
        var result: [Track] = []

        for track in tracks {
            guard !seenIds.contains(track.id) else { continue }
            let artistKey = track.artist.lowercased()
            let maxPerArtist = result.count < 20 ? 2 : 4
            guard artistCounts[artistKey, default: 0] < maxPerArtist else { continue }

            seenIds.insert(track.id)
            artistCounts[artistKey, default: 0] += 1
            result.append(track)
            if result.count >= maxCount { break }
        }
        return result
    }

    // MARK: - Normalization & Metadata Cleaning

    private func normalizeTrack(_ raw: [String: Any], preferredQuality: AudioQualityTier = .q320) -> Track? {
        guard let rawId = raw["id"] else { return nil }
        let idStr = "\(rawId)"
        let rawTitle = (raw["title"] as? String) ?? "Без названия"
        let userDict = raw["user"] as? [String: Any]
        let fallbackArtist = (userDict?["username"] as? String) ?? "Неизвестный артист"
        let artistId = userDict?["id"].map { "\($0)" }
        let userAvatar = upgradeArtworkUrl(userDict?["avatar_url"] as? String)

        let cleaned = parseCleanTrackInfo(rawTitle: rawTitle, fallbackArtist: fallbackArtist, primaryArtistId: artistId, primaryAvatar: userAvatar)

        let fullDurationMs = (raw["full_duration"] as? Double) ?? (raw["duration"] as? Double) ?? 0
        let durationMs = (raw["duration"] as? Double) ?? fullDurationMs
        let isSnippet = fullDurationMs > 45_000 && durationMs <= 35_000

        let artwork = upgradeArtworkUrl((raw["artwork_url"] as? String) ?? (userDict?["avatar_url"] as? String))

        // Select transcoding
        let media = raw["media"] as? [String: Any]
        let transcodings = (media?["transcodings"] as? [[String: Any]]) ?? []
        let nonSnipped = transcodings.filter { ($0["snipped"] as? Bool) != true }
        let pool = nonSnipped.isEmpty ? transcodings : nonSnipped

        let chosenTranscoding: [String: Any]? = {
            switch preferredQuality {
            case .q1411, .q320:
                return pool.first(where: { ($0["quality"] as? String) == "hq" })
                    ?? pool.first(where: { (($0["format"] as? [String: Any])?["protocol"] as? String)?.contains("progressive") == true })
                    ?? pool.first
            case .q192:
                return pool.first(where: { ($0["quality"] as? String) == "sq" }) ?? pool.first
            case .q256:
                return pool.first(where: { (($0["format"] as? [String: Any])?["protocol"] as? String)?.contains("progressive") == true })
                    ?? pool.first
            }
        }()

        let transcodingUrl = chosenTranscoding?["url"] as? String
        let protocolStr = ((chosenTranscoding?["format"] as? [String: Any])?["protocol"] as? String) ?? ""
        let isHls = protocolStr.contains("hls")

        let publisherMeta = raw["publisher_metadata"] as? [String: Any]
        let explicit = (publisherMeta?["explicit"] as? Bool) ?? false

        return Track(
            id: "sc_\(idStr)",
            rawId: idStr,
            title: cleaned.title,
            artist: cleaned.artistDisplay,
            artists: cleaned.artists,
            coverUrl: artwork,
            duration: max(fullDurationMs, durationMs) / 1000.0,
            streamUrl: nil,
            transcodingUrl: transcodingUrl,
            isHls: isHls,
            isSnippet: isSnippet,
            isExplicit: explicit,
            genre: raw["genre"] as? String,
            tagList: raw["tag_list"] as? String,
            playbackCount: (raw["playback_count"] as? Int) ?? 0,
            likesCount: (raw["likes_count"] as? Int) ?? 0,
            source: .soundcloud
        )
    }

    private func normalizePlaylist(_ raw: [String: Any], forceKind: ReleaseKind? = nil) -> ReleaseItem? {
        guard let rawId = raw["id"] else { return nil }
        let title = (raw["title"] as? String) ?? "Плейлист"
        let userDict = raw["user"] as? [String: Any]
        let artist = (userDict?["username"] as? String) ?? "AmyMusic"
        let artistId = userDict?["id"].map { "\($0)" }
        let rawTracks = (raw["tracks"] as? [[String: Any]]) ?? []
        let tracks = rawTracks.compactMap { normalizeTrack($0) }
        let firstTrackCover = tracks.first?.coverUrl
        let artwork = upgradeArtworkUrl(raw["artwork_url"] as? String) ?? firstTrackCover
        let isAlbum = (raw["is_album"] as? Bool) ?? false
        let kind = forceKind ?? (isAlbum ? .album : .playlist)
        let trackCount = (raw["track_count"] as? Int) ?? tracks.count

        return ReleaseItem(
            id: "sc_pl_\(rawId)",
            title: title,
            artist: artist,
            artistId: artistId,
            coverUrl: artwork,
            kind: kind,
            trackCount: trackCount,
            tracks: tracks
        )
    }

    private func upgradeArtworkUrl(_ url: String?) -> String? {
        guard let url, !url.isEmpty else { return nil }
        return url
            .replacingOccurrences(of: "-large.", with: "-t500x500.")
            .replacingOccurrences(of: "-t300x300.", with: "-t500x500.")
            .replacingOccurrences(of: "-badge.", with: "-t500x500.")
    }

    /// Cleans `[Official Audio]`, splits `"Artist - Title"` and `(feat. X)` into structured artist refs
    private func parseCleanTrackInfo(
        rawTitle: String,
        fallbackArtist: String,
        primaryArtistId: String?,
        primaryAvatar: String?
    ) -> (title: String, artistDisplay: String, artists: [ArtistRef]) {
        var cleaned = rawTitle
        let junkPatterns = [
            "\\[Official[^\\]]*\\]", "\\(Official[^\\)]*\\)",
            "\\[Music Video\\]", "\\(Music Video\\)",
            "\\[Lyrics?\\]", "\\(Lyrics?\\)",
            "\\[HD\\]", "\\[HQ\\]"
        ]
        for pattern in junkPatterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                cleaned = regex.stringByReplacingMatches(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned), withTemplate: "")
            }
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        var artistPart = fallbackArtist
        var titlePart = cleaned

        if let dashRange = cleaned.range(of: " - ") {
            let left = String(cleaned[..<dashRange.lowerBound]).trimmingCharacters(in: .whitespaces)
            let right = String(cleaned[dashRange.upperBound...]).trimmingCharacters(in: .whitespaces)
            if !left.isEmpty && !right.isEmpty {
                artistPart = left
                titlePart = right
            }
        }

        let separators = CharacterSet(charactersIn: ",&×;")
        let rawNames = artistPart
            .replacingOccurrences(of: " feat. ", with: ",", options: .caseInsensitive)
            .replacingOccurrences(of: " ft. ", with: ",", options: .caseInsensitive)
            .components(separatedBy: separators)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        let artists: [ArtistRef] = rawNames.enumerated().map { idx, name in
            ArtistRef(
                id: idx == 0 ? (primaryArtistId ?? name) : name,
                name: name,
                avatarUrl: idx == 0 ? primaryAvatar : nil
            )
        }

        let display = artists.isEmpty ? fallbackArtist : artists.map(\.name).joined(separator: ", ")
        return (titlePart, display, artists.isEmpty ? [ArtistRef(id: primaryArtistId ?? fallbackArtist, name: fallbackArtist, avatarUrl: primaryAvatar)] : artists)
    }
}
