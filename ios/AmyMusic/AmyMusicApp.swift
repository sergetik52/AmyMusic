import SwiftUI

// MARK: - AmyMusic iOS 26 Native App Entry Point

@main
struct AmyMusicApp: App {
    @State private var player = AudioPlayerManager.shared

    var body: some Scene {
        WindowGroup {
            RootTabView(player: player)
                .preferredColorScheme(.dark)
        }
    }
}
