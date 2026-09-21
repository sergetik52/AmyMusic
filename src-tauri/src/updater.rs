use std::env;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::{command, AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;

#[derive(serde::Serialize, Clone)]
pub struct ProgressEvent {
    percent: u8,
}

#[command]
pub async fn start_update(app: AppHandle, download_url: String) -> Result<bool, String> {
    let temp_dir = env::temp_dir();
    let setup_path: PathBuf = temp_dir.join("AmyMusic-Setup-Update.exe");

    let mut response = reqwest::get(&download_url)
        .await
        .map_err(|e| e.to_string())?;
        
    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    
    let mut file = File::create(&setup_path).map_err(|e| e.to_string())?;

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        if total_size > 0 {
            let percent = ((downloaded as f64 / total_size as f64) * 100.0) as u8;
            let _ = app.emit("amymusic:update-progress", ProgressEvent { percent });
        }
    }
    
    // Execute installer in silent mode
    let shell = app.shell();
    let _ = shell.command(setup_path.to_str().unwrap())
        .args(["/S", "--force-run"])
        .spawn()
        .map_err(|e| e.to_string())?;
        
    app.exit(0);
    Ok(true)
}
