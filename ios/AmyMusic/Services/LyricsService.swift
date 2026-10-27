import Foundation

// MARK: - Multi-Source Lyrics Service (Port of src/services/lyricsApi.js & src/utils/lrcParser.js)

public actor LyricsService {
    public static let shared = LyricsService()

    private var memoryCache: [String: LyricsPayload] = [:]
    private let neteaseProxies = [
        "https://neteasecloudmusicapi.vercel.app",
        "https://autumnfish.cn"
    ]

    public func fetchLyrics(
        for track: Track,
        preferredSource: LyricsSourceKind = .auto,
        forceRefresh: Bool = false
    ) async -> LyricsPayload {
        let key = "\(track.artist.lowercased())_\(track.title.lowercased())_\(preferredSource.rawValue)"
        if !forceRefresh, let cached = memoryCache[key] {
            return cached
        }

        let payload: LyricsPayload
        switch preferredSource {
        case .lrclib:
            payload = await fetchFromLRCLib(track: track) ?? .empty
        case .genius:
            payload = await fetchFromGenius(track: track) ?? .empty
        case .netease:
            payload = await fetchFromNetEase(track: track) ?? .empty
        case .auto:
            // Parallel race between LRCLib (synced), NetEase (synced), and Genius (plain + annotations)
            async let lrcTask = fetchFromLRCLib(track: track)
            async let netTask = fetchFromNetEase(track: track)
            async let genTask = fetchFromGenius(track: track)

            let (lrcRes, netRes, genRes) = await (lrcTask, netTask, genTask)
            if let genRes {
                memoryCache["\(track.artist.lowercased())_\(track.title.lowercased())_\(LyricsSourceKind.genius.rawValue)"] = genRes
            }
            if let lrcRes, lrcRes.status == .synced {
                memoryCache["\(track.artist.lowercased())_\(track.title.lowercased())_\(LyricsSourceKind.lrclib.rawValue)"] = lrcRes
                payload = lrcRes
            } else if let netRes, netRes.status == .synced {
                payload = netRes
            } else if let lrcRes {
                payload = lrcRes
            } else if let genRes {
                payload = genRes
            } else {
                payload = .empty
            }
        }

        if payload.status != .empty {
            memoryCache[key] = payload
        }
        return payload
    }

    public func clearCache() {
        memoryCache.removeAll()
    }

    // MARK: - 1. LRCLIB (https://lrclib.net/api)

    private func fetchFromLRCLib(track: Track) async -> LyricsPayload? {
        // Step A: Exact /get
        var getComponents = URLComponents(string: "https://lrclib.net/api/get")
        var queryItems = [
            URLQueryItem(name: "track_name", value: track.title),
            URLQueryItem(name: "artist_name", value: track.artist)
        ]
        if track.duration > 0 {
            queryItems.append(URLQueryItem(name: "duration", value: "\(Int(track.duration.rounded()))"))
        }
        getComponents?.queryItems = queryItems

        if let url = getComponents?.url,
           let dict = await requestJSONDictionary(url: url, headers: ["LrcLib-Client": "Amymusic (https://github.com/sergetik52/AmyMusic)"]),
           let parsed = parseLRCLibRecord(dict, duration: track.duration) {
            return parsed
        }

        // Step B: Fallback /search
        var searchComponents = URLComponents(string: "https://lrclib.net/api/search")
        searchComponents?.queryItems = [URLQueryItem(name: "q", value: "\(track.artist) \(track.title)")]
        guard let searchUrl = searchComponents?.url,
              let arr = await requestJSONArray(url: searchUrl, headers: ["LrcLib-Client": "Amymusic (https://github.com/sergetik52/AmyMusic)"]) else {
            return nil
        }

        let sorted = arr.sorted { a, b in
            let dA = abs(((a["duration"] as? Double) ?? track.duration) - track.duration)
            let dB = abs(((b["duration"] as? Double) ?? track.duration) - track.duration)
            return dA < dB
        }

        for record in sorted {
            if let parsed = parseLRCLibRecord(record, duration: track.duration) {
                return parsed
            }
        }
        return nil
    }

    private func parseLRCLibRecord(_ dict: [String: Any], duration: TimeInterval) -> LyricsPayload? {
        if let synced = dict["syncedLyrics"] as? String, !synced.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let lines = Self.parseSyncedLyrics(synced, trackDuration: duration)
            if !lines.isEmpty {
                return LyricsPayload(
                    source: "LRCLib",
                    status: .synced,
                    lines: lines,
                    plainText: lines.map(\.text).joined(separator: "\n"),
                    annotations: [:]
                )
            }
        }
        if let plain = dict["plainLyrics"] as? String, !plain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let lines = Self.parsePlainLyrics(plain, duration: duration)
            return LyricsPayload(
                source: "LRCLib",
                status: .plain,
                lines: lines,
                plainText: plain,
                annotations: [:]
            )
        }
        return nil
    }

    // MARK: - 2. NetEase Cloud Music

    private func fetchFromNetEase(track: Track) async -> LyricsPayload? {
        for base in neteaseProxies {
            var searchComp = URLComponents(string: "\(base)/search")
            searchComp?.queryItems = [
                URLQueryItem(name: "keywords", value: "\(track.artist) \(track.title)"),
                URLQueryItem(name: "type", value: "1"),
                URLQueryItem(name: "limit", value: "5")
            ]
            guard let searchUrl = searchComp?.url,
                  let dict = await requestJSONDictionary(url: searchUrl, timeout: 3.5),
                  let result = dict["result"] as? [String: Any],
                  let songs = result["songs"] as? [[String: Any]],
                  let firstSong = songs.first,
                  let songId = firstSong["id"] else {
                continue
            }

            guard let lyricUrl = URL(string: "\(base)/lyric?id=\(songId)"),
                  let lyricDict = await requestJSONDictionary(url: lyricUrl, timeout: 3.5),
                  let lrcObj = lyricDict["lrc"] as? [String: Any],
                  let lrcText = lrcObj["lyric"] as? String,
                  !lrcText.contains("Pure music") else {
                continue
            }

            let lines = Self.parseSyncedLyrics(lrcText, trackDuration: track.duration)
            if !lines.isEmpty {
                return LyricsPayload(
                    source: "NetEase",
                    status: .synced,
                    lines: lines,
                    plainText: lines.map(\.text).joined(separator: "\n"),
                    annotations: [:]
                )
            }
        }
        return nil
    }

    // MARK: - 3. Genius Lyrics & Annotations

    private func fetchFromGenius(track: Track) async -> LyricsPayload? {
        var searchComp = URLComponents(string: "https://genius.com/api/search/multi")
        searchComp?.queryItems = [
            URLQueryItem(name: "per_page", value: "5"),
            URLQueryItem(name: "q", value: "\(track.artist) \(track.title)")
        ]
        guard let searchUrl = searchComp?.url,
              let root = await requestJSONDictionary(url: searchUrl),
              let response = root["response"] as? [String: Any],
              let sections = response["sections"] as? [[String: Any]] else {
            return nil
        }

        let songHits = sections.first(where: { ($0["type"] as? String) == "song" })?["hits"] as? [[String: Any]] ?? []
        let filteredHit = songHits.compactMap { $0["result"] as? [String: Any] }.first { res in
            let title = ((res["full_title"] as? String) ?? "").lowercased()
            // Skip translation/romanized pages unless track itself asks for it
            let skipWords = ["translation", "romanized", "traduction", "traducción"]
            return !skipWords.contains(where: { title.contains($0) })
        }

        guard let hit = filteredHit,
              let songUrlStr = hit["url"] as? String,
              let songUrl = URL(string: songUrlStr) else {
            return nil
        }

        guard let htmlData = try? await URLSession.shared.data(from: songUrl).0,
              let html = String(data: htmlData, encoding: .utf8) else {
            return nil
        }

        let extracted = Self.extractGeniusLyricsAndAnnotations(from: html)
        guard !extracted.plainText.isEmpty else { return nil }

        var annotationsMap = extracted.annotations
        if let songId = hit["id"],
           let refUrl = URL(string: "https://genius.com/api/referents?song_id=\(songId)&per_page=30&text_format=plain"),
           let refRoot = await requestJSONDictionary(url: refUrl),
           let refResp = refRoot["response"] as? [String: Any],
           let referents = refResp["referents"] as? [[String: Any]] {
            for ref in referents {
                if let refId = ref["id"],
                   let anns = ref["annotations"] as? [[String: Any]],
                   let body = (anns.first?["body"] as? [String: Any])?["plain"] as? String,
                   !body.isEmpty {
                    annotationsMap["\(refId)"] = body
                }
            }
        }

        let lines = Self.parsePlainLyrics(extracted.plainText, duration: track.duration, lineAnnotations: extracted.lineAnnotationIds)
        return LyricsPayload(
            source: "Genius",
            status: .plain,
            lines: lines,
            plainText: extracted.plainText,
            annotations: annotationsMap
        )
    }

    // MARK: - LRC & Plain Text Parsing Utilities

    /// Parses multi-timestamp LRC lines (`[mm:ss.xx]`) and builds word-by-word interpolated timings for Braccato/Words mode
    public static func parseSyncedLyrics(_ lrc: String, trackDuration: TimeInterval) -> [LyricLine] {
        let rawLines = lrc.components(separatedBy: .newlines)
        let pattern = #"\[(\d+):(\d{2}(?:\.\d{1,3})?)\]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }

        var temp: [(time: TimeInterval, text: String)] = []

        for rawLine in rawLines {
            let nsRange = NSRange(rawLine.startIndex..., in: rawLine)
            let matches = regex.matches(in: rawLine, range: nsRange)
            guard !matches.isEmpty else { continue }

            let textStart = matches.last!.range.upperBound
            let textIndex = rawLine.index(rawLine.startIndex, offsetBy: textStart)
            let text = String(rawLine[textIndex...]).trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }

            for match in matches {
                if let minRange = Range(match.range(at: 1), in: rawLine),
                   let secRange = Range(match.range(at: 2), in: rawLine),
                   let mins = Double(rawLine[minRange]),
                   let secs = Double(rawLine[secRange]) {
                    temp.append((mins * 60.0 + secs, text))
                }
            }
        }

        temp.sort { $0.time < $1.time }

        return temp.enumerated().map { index, item in
            let nextTime = (index + 1 < temp.count) ? temp[index + 1].time : max(item.time + 4.0, trackDuration)
            let lineSpan = max(0.8, min(6.5, nextTime - item.time - 0.15))
            let tokens = item.text.split(separator: " ").map(String.init)
            let wordStep = tokens.isEmpty ? lineSpan : lineSpan / Double(tokens.count)

            let words: [LyricWord] = tokens.enumerated().map { wIdx, word in
                let start = item.time + Double(wIdx) * wordStep
                return LyricWord(
                    id: "\(index)_\(wIdx)",
                    text: word,
                    startTime: start,
                    endTime: start + wordStep
                )
            }

            return LyricLine(
                id: "lrc_\(index)_\(item.time)",
                time: item.time,
                text: item.text,
                isEstimated: false,
                words: words
            )
        }
    }

    public static func parsePlainLyrics(
        _ plain: String,
        duration: TimeInterval,
        lineAnnotations: [Int: String] = [:]
    ) -> [LyricLine] {
        let rawLines = plain
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !rawLines.isEmpty else { return [] }
        let step = duration > 0 ? max(1.6, duration / Double(rawLines.count + 1)) : 3.4

        return rawLines.enumerated().map { idx, text in
            LyricLine(
                id: "plain_\(idx)",
                time: step * (Double(idx) + 0.7),
                text: text,
                isEstimated: true,
                annotationId: lineAnnotations[idx]
            )
        }
    }

    /// Finds the active lyric index with `+0.08s` lookahead and custom user millisecond offset
    public static func activeLyricIndex(
        in lines: [LyricLine],
        currentTime: TimeInterval,
        offsetMs: Double = 0
    ) -> Int? {
        guard !lines.isEmpty else { return nil }
        let adjusted = currentTime + 0.08 - (offsetMs / 1000.0)
        var active: Int? = nil
        for (idx, line) in lines.enumerated() {
            if adjusted >= line.time {
                active = idx
            } else {
                break
            }
        }
        return active
    }

    // MARK: - Helpers

    private static func extractGeniusLyricsAndAnnotations(from html: String) -> (plainText: String, lineAnnotationIds: [Int: String], annotations: [String: String]) {
        var chunks: [String] = []
        let pattern = #"data-lyrics-container="true"[^>]*>([\s\S]*?)</div>"#
        if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
            let matches = regex.matches(in: html, range: NSRange(html.startIndex..., in: html))
            for match in matches {
                if let r = Range(match.range(at: 1), in: html) {
                    chunks.append(String(html[r]))
                }
            }
        }
        var raw = chunks.joined(separator: "\n")
        raw = raw.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
        raw = raw.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        raw = raw
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#x27;", with: "'")
            .replacingOccurrences(of: "&apos;", with: "'")

        return (raw.trimmingCharacters(in: .whitespacesAndNewlines), [:], [:])
    }

    private func requestJSONDictionary(url: URL, headers: [String: String] = [:], timeout: TimeInterval = 8) async -> [String: Any]? {
        var req = URLRequest(url: url)
        req.timeoutInterval = timeout
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return dict
    }

    private func requestJSONArray(url: URL, headers: [String: String] = [:], timeout: TimeInterval = 8) async -> [[String: Any]]? {
        var req = URLRequest(url: url)
        req.timeoutInterval = timeout
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        return arr
    }
}
