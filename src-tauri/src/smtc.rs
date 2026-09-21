use serde::Deserialize;
use tauri::command;

#[derive(Deserialize, Clone)]
pub struct SmtcInfo {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_url: Option<String>,
    pub duration: Option<f64>,
    pub position: Option<f64>,
    pub is_playing: Option<bool>,
}

#[cfg(target_os = "windows")]
mod windows_smtc {
    use super::SmtcInfo;
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
        SystemMediaTransportControlsDisplayUpdater,
    };

    fn get_smtc() -> Option<SystemMediaTransportControls> {
        // For a non-UWP app, we use the MediaPlayer approach which is supported on Win 10+
        use windows::Media::Playback::MediaPlayer;
        static PLAYER: std::sync::OnceLock<MediaPlayer> = std::sync::OnceLock::new();
        let player = PLAYER.get_or_init(|| {
            MediaPlayer::new().expect("Failed to create MediaPlayer")
        });
        player.SystemMediaTransportControls().ok()
    }

    pub fn update_smtc(info: &SmtcInfo) {
        let Some(smtc) = get_smtc() else { return };

        let _ = smtc.SetIsEnabled(true);
        let _ = smtc.SetIsPlayEnabled(true);
        let _ = smtc.SetIsPauseEnabled(true);
        let _ = smtc.SetIsPreviousEnabled(true);
        let _ = smtc.SetIsNextEnabled(true);

        // Set play/pause status
        let status = if info.is_playing.unwrap_or(false) {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        };
        let _ = smtc.SetPlaybackStatus(status);

        // Update display info
        if let Ok(updater) = smtc.DisplayUpdater() {
            let _ = updater.SetType(MediaPlaybackType::Music);

            if let Ok(music_props) = updater.MusicProperties() {
                if let Some(title) = &info.title {
                    let _ = music_props.SetTitle(&windows::core::HSTRING::from(title.as_str()));
                }
                if let Some(artist) = &info.artist {
                    let _ = music_props.SetArtist(&windows::core::HSTRING::from(artist.as_str()));
                }
                if let Some(album) = &info.album {
                    let _ = music_props.SetAlbumTitle(&windows::core::HSTRING::from(album.as_str()));
                }
            }

            let _ = updater.Update();
        }
    }

    pub fn clear_smtc() {
        let Some(smtc) = get_smtc() else { return };
        let _ = smtc.SetPlaybackStatus(MediaPlaybackStatus::Stopped);
        let _ = smtc.SetIsEnabled(false);
    }
}

#[command]
pub fn update_smtc(info: SmtcInfo) {
    #[cfg(target_os = "windows")]
    windows_smtc::update_smtc(&info);
}

#[command]
pub fn clear_smtc() {
    #[cfg(target_os = "windows")]
    windows_smtc::clear_smtc();
}
