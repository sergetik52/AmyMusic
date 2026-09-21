use regex::Regex;
use reqwest::header;
use serde::Serialize;
use tauri::command;

#[derive(Serialize)]
pub struct TrackInfo {
    title: String,
    artist: String,
}

#[command]
pub async fn parse_playlist_url(url: String) -> Result<Vec<TrackInfo>, String> {
    // Basic extraction from Spotify via HTTP GET
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .header(header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let text = res.text().await.map_err(|e| e.to_string())?;
    
    // We try to find the standard Spotify track metadata inside the HTML
    // A quick hack is to parse `<meta name="description" content="... · Song · ...">` or similar, 
    // or we can parse the initial state. Since it's a playlist, we'll extract Spotify.Entity tracks.
    let re = Regex::new(r#""name":"([^"]+)".*?"artists":\[\{.*?"name":"([^"]+)"#).unwrap();
    let mut tracks = Vec::new();
    
    // Simplistic regex parsing similar to what JS did
    for cap in re.captures_iter(&text) {
        let title = cap[1].to_string();
        let artist = cap[2].to_string();
        tracks.push(TrackInfo { title, artist });
        if tracks.len() >= 50 { break; }
    }
    
    Ok(tracks)
}

#[command]
pub async fn get_bandlink_chart() -> Result<Vec<TrackInfo>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://music.yandex.ru/chart")
        .header(header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let text = res.text().await.map_err(|e| e.to_string())?;
    
    let re = Regex::new(r#""title":"([^"]+)".*?"artists":\[\{.*?"name":"([^"]+)"#).unwrap();
    let mut tracks = Vec::new();
    let mut seen = std::collections::HashSet::new();
    
    for cap in re.captures_iter(&text) {
        let title = cap[1].to_string();
        let artist = cap[2].to_string();
        let key = format!("{} - {}", artist, title);
        
        if !seen.contains(&key) {
            seen.insert(key);
            tracks.push(TrackInfo { title, artist });
            if tracks.len() >= 40 { break; }
        }
    }
    
    Ok(tracks)
}

#[derive(serde::Deserialize)]
pub struct FetchOptions {
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
}

#[derive(serde::Serialize)]
pub struct FetchResponse {
    status: u16,
    headers: std::collections::HashMap<String, String>,
    body_text: String,
}

#[command]
pub async fn proxy_fetch(url: String, options: Option<FetchOptions>) -> Result<FetchResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = client.request(
        reqwest::Method::from_bytes(options.as_ref().and_then(|o| o.method.as_deref()).unwrap_or("GET").as_bytes()).unwrap_or(reqwest::Method::GET),
        &url,
    );
    
    if let Some(opts) = options {
        if let Some(headers) = opts.headers {
            for (k, v) in headers {
                builder = builder.header(k, v);
            }
        }
        if let Some(body) = opts.body {
            builder = builder.body(body);
        }
    }
    
    let res = builder.send().await.map_err(|e| e.to_string())?;
    
    let status = res.status().as_u16();
    let mut resp_headers = std::collections::HashMap::new();
    for (k, v) in res.headers() {
        resp_headers.insert(k.as_str().to_string(), v.to_str().unwrap_or("").to_string());
    }
    let body_text = res.text().await.map_err(|e| e.to_string())?;
    
    Ok(FetchResponse { status, headers: resp_headers, body_text })
}
