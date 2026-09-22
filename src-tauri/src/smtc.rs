use serde::Deserialize;
use tauri::{command, AppHandle};

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
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use windows::Foundation::TypedEventHandler;
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
    };

    static SMTC_INIT: OnceLock<()> = OnceLock::new();

    fn get_smtc(app: &AppHandle) -> Option<SystemMediaTransportControls> {
        use windows::Media::Playback::MediaPlayer;
        static PLAYER: OnceLock<MediaPlayer> = OnceLock::new();
        let player = PLAYER.get_or_init(|| {
            MediaPlayer::new().expect("Failed to create MediaPlayer")
        });

        let smtc = player.SystemMediaTransportControls().ok()?;

        SMTC_INIT.get_or_init(|| {
            let app_handle = app.clone();
            let _ = smtc.ButtonPressed(&TypedEventHandler::new(
                move |_sender, args: windows::core::Ref<'_, SystemMediaTransportControlsButtonPressedEventArgs>| {
                    if let Some(args) = args.as_ref() {
                        if let Ok(button) = args.Button() {
                            let action = match button {
                                SystemMediaTransportControlsButton::Play => "playPause",
                                SystemMediaTransportControlsButton::Pause => "playPause",
                                SystemMediaTransportControlsButton::Next => "nextTrack",
                                SystemMediaTransportControlsButton::Previous => "prevTrack",
                                SystemMediaTransportControlsButton::Stop => "pause",
                                SystemMediaTransportControlsButton::ChannelUp => "nextTrack",
                                SystemMediaTransportControlsButton::ChannelDown => "prevTrack",
                                _ => "",
                            };
                            if !action.is_empty() {
                                let _ = app_handle.emit("smtc-button", action);
                            }
                        }
                    }
                    Ok(())
                },
            ));
        });

        Some(smtc)
    }

    pub fn update_smtc(app: &AppHandle, info: &SmtcInfo) {
        let Some(smtc) = get_smtc(app) else { return };

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

    pub fn clear_smtc(app: &AppHandle) {
        let Some(smtc) = get_smtc(app) else { return };
        let _ = smtc.SetPlaybackStatus(MediaPlaybackStatus::Stopped);
        let _ = smtc.SetIsEnabled(false);
    }
}

#[command]
pub fn update_smtc(app: AppHandle, info: SmtcInfo) {
    #[cfg(target_os = "windows")]
    windows_smtc::update_smtc(&app, &info);
}

#[command]
pub fn clear_smtc(app: AppHandle) {
    #[cfg(target_os = "windows")]
    windows_smtc::clear_smtc(&app);
}

