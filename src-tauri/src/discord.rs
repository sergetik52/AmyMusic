use once_cell::sync::Lazy;
use serde::Deserialize;
use serde_json::json;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::command;

const CLIENT_ID: &str = "1345409409240797194";

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Clone)]
pub struct DiscordButton {
    pub label: String,
    pub url: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityArgs {
    pub state: Option<String>,
    pub details: Option<String>,
    pub large_image_key: Option<String>,
    pub large_image_text: Option<String>,
    pub small_image_key: Option<String>,
    pub small_image_text: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub buttons: Option<Vec<DiscordButton>>,
}

// ─── Pipe Connection ──────────────────────────────────────────────────────────

struct DiscordPipe {
    #[cfg(target_os = "windows")]
    inner: std::fs::File,
    #[cfg(not(target_os = "windows"))]
    inner: std::os::unix::net::UnixStream,
    nonce: u64,
}

impl DiscordPipe {
    fn write_packet(&mut self, opcode: u32, data: &str) -> std::io::Result<()> {
        let bytes = data.as_bytes();
        let len = bytes.len() as u32;
        let mut header = [0u8; 8];
        header[0..4].copy_from_slice(&opcode.to_le_bytes());
        header[4..8].copy_from_slice(&len.to_le_bytes());
        self.inner.write_all(&header)?;
        self.inner.write_all(bytes)?;
        self.inner.flush()
    }

    fn read_packet(&mut self) -> std::io::Result<serde_json::Value> {
        let mut header = [0u8; 8];
        self.inner.read_exact(&mut header)?;
        let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let mut data = vec![0u8; length];
        self.inner.read_exact(&mut data)?;
        serde_json::from_slice(&data)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    fn next_nonce(&mut self) -> String {
        self.nonce += 1;
        self.nonce.to_string()
    }

    #[cfg(target_os = "windows")]
    fn open_pipe(i: u32) -> Option<Self> {
        let path = format!(r"\\.\pipe\discord-ipc-{}", i);
        std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .ok()
            .map(|inner| DiscordPipe { inner, nonce: 0 })
    }

    #[cfg(not(target_os = "windows"))]
    fn open_pipe(i: u32) -> Option<Self> {
        let dirs = [
            std::env::var("XDG_RUNTIME_DIR").unwrap_or_default(),
            std::env::var("TMPDIR").unwrap_or_default(),
            "/tmp".to_string(),
        ];
        for dir in &dirs {
            if dir.is_empty() { continue; }
            let path = format!("{}/discord-ipc-{}", dir, i);
            if let Ok(s) = std::os::unix::net::UnixStream::connect(&path) {
                return Some(DiscordPipe { inner: s, nonce: 0 });
            }
        }
        None
    }

    fn connect() -> Option<Self> {
        for i in 0u32..10 {
            let Some(mut pipe) = Self::open_pipe(i) else { continue };

            // Handshake
            let hs = json!({ "v": 1, "client_id": CLIENT_ID }).to_string();
            if pipe.write_packet(0, &hs).is_err() { continue; }

            // Read READY
            match pipe.read_packet() {
                Ok(resp) => {
                    let evt = resp.get("evt").and_then(|v| v.as_str()).unwrap_or("");
                    let cmd = resp.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
                    if evt == "READY" || cmd == "DISPATCH" {
                        return Some(pipe);
                    }
                }
                Err(_) => continue,
            }
        }
        None
    }

    fn send_activity(&mut self, activity: serde_json::Value) -> std::io::Result<()> {
        let nonce = self.next_nonce();
        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": activity
            },
            "nonce": nonce
        })
        .to_string();
        self.write_packet(1, &payload)
    }

    fn clear(&mut self) -> std::io::Result<()> {
        let nonce = self.next_nonce();
        let payload = json!({
            "cmd": "SET_ACTIVITY",
            "args": { "pid": std::process::id(), "activity": null },
            "nonce": nonce
        })
        .to_string();
        self.write_packet(1, &payload)
    }
}

// ─── Global State ─────────────────────────────────────────────────────────────

static DISCORD: Lazy<Mutex<Option<DiscordPipe>>> = Lazy::new(|| Mutex::new(None));

// ─── Commands ─────────────────────────────────────────────────────────────────

#[command]
pub fn set_discord_bot_token(_token: String) {
    // Client ID is fixed; reset connection so it re-handshakes
    *DISCORD.lock().unwrap() = None;
}

#[command]
pub fn get_discord_bot_token() -> String {
    CLIENT_ID.to_string()
}

#[command]
pub fn set_discord_activity(activity: Option<ActivityArgs>) {
    thread::spawn(move || {
        let mut guard = DISCORD.lock().unwrap();

        if activity.is_none() {
            if let Some(pipe) = guard.as_mut() {
                if pipe.clear().is_err() {
                    *guard = None;
                }
            }
            return;
        }

        let args = activity.unwrap();

        // Reconnect if needed
        if guard.is_none() {
            *guard = DiscordPipe::connect();
            if guard.is_none() {
                return; // Discord not running
            }
        }

        // Build activity JSON with type = 2 (Listening)
        let mut assets = serde_json::Map::new();
        if let Some(img) = &args.large_image_key {
            assets.insert("large_image".into(), json!(img));
        }
        if let Some(txt) = &args.large_image_text {
            assets.insert("large_text".into(), json!(txt));
        }
        if let Some(img) = &args.small_image_key {
            assets.insert("small_image".into(), json!(img));
        }
        if let Some(txt) = &args.small_image_text {
            assets.insert("small_text".into(), json!(txt));
        }

        let mut act = serde_json::Map::new();
        act.insert("type".into(), json!(2)); // 2 = LISTENING ("Слушает в")
        if let Some(d) = &args.details { act.insert("details".into(), json!(d)); }
        if let Some(s) = &args.state   { act.insert("state".into(),   json!(s)); }
        if !assets.is_empty() {
            act.insert("assets".into(), serde_json::Value::Object(assets));
        }

        let mut timestamps = serde_json::Map::new();
        if let Some(start) = args.start_timestamp { timestamps.insert("start".into(), json!(start)); }
        if let Some(end)   = args.end_timestamp   { timestamps.insert("end".into(),   json!(end));   }
        if !timestamps.is_empty() {
            act.insert("timestamps".into(), serde_json::Value::Object(timestamps));
        }

        // Buttons
        if let Some(buttons) = &args.buttons {
            let btn_arr: Vec<serde_json::Value> = buttons
                .iter()
                .take(2) // Discord allows max 2 buttons
                .map(|b| json!({ "label": b.label, "url": b.url }))
                .collect();
            if !btn_arr.is_empty() {
                act.insert("buttons".into(), serde_json::Value::Array(btn_arr));
            }
        }

        let pipe = guard.as_mut().unwrap();
        if pipe.send_activity(serde_json::Value::Object(act)).is_err() {
            *guard = None; // will reconnect on next call
        }
    });
}
