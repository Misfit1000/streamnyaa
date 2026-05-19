use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Serialize)]
struct PlaybackStatus {
    ok: bool,
    state: String,
    message: String,
    title: String,
    torrent_id: Option<String>,
    playlist_url: Option<String>,
}

#[derive(Serialize)]
struct ToolTestStatus {
    ok: bool,
    message: String,
    path: Option<String>,
    version: Option<String>,
}

#[derive(Serialize)]
struct LocalPlaybackProgress {
    ok: bool,
    torrent_id: String,
    state: String,
    message: String,
    progress: Option<f64>,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    peers: Option<u64>,
    download_speed: Option<f64>,
    playlist_url: String,
}

#[derive(Serialize)]
struct RuntimeStatus {
    ready: bool,
    torrent_engine_configured: bool,
    player_configured: bool,
    torrent_engine_path: Option<String>,
    player_path: Option<String>,
    torrent_engine_version: Option<String>,
    player_version: Option<String>,
    cache_dir: String,
    message: String,
}

#[derive(Serialize)]
struct SourceApiResponse {
    data: serde_json::Value,
    fetched_at: u128,
}

#[derive(Clone, Serialize)]
struct CacheEntry {
    name: String,
    path: String,
    size_bytes: u64,
    modified_ms: u128,
}

#[derive(Serialize)]
struct CacheStatus {
    cache_dir: String,
    total_bytes: u64,
    file_count: u64,
    max_bytes: u64,
    free_bytes: Option<u64>,
    pressure: String,
    entries: Vec<CacheEntry>,
}

#[derive(Serialize)]
struct DiagnosticsStatus {
    app_version: String,
    runtime: RuntimeStatus,
    cache: CacheStatus,
    recent_errors: Vec<String>,
}

#[derive(Clone, Deserialize)]
struct DesktopSettings {
    torrent_engine_path: Option<String>,
    #[serde(alias = "mpv_path")]
    vlc_path: Option<String>,
    cache_dir: Option<String>,
}

#[derive(Deserialize)]
struct PlaybackRequest {
    magnet: String,
    info_hash: Option<String>,
    title: String,
    anime_title: String,
    episode: String,
    size: Option<String>,
    settings: Option<DesktopSettings>,
}

#[derive(Deserialize)]
struct PlaybackProgressRequest {
    torrent_id: String,
}

#[derive(Deserialize)]
struct StopPlaybackRequest {
    torrent_id: String,
}

#[derive(Deserialize)]
struct OpenTorrentPlayerRequest {
    torrent_id: String,
    title: Option<String>,
    settings: Option<DesktopSettings>,
}

const DEFAULT_CACHE_MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const GUARDED_CACHE_MAX_BYTES: u64 = 1024 * 1024 * 1024;
const LOW_SPACE_CACHE_MAX_BYTES: u64 = 512 * 1024 * 1024;
const EMERGENCY_CACHE_MAX_BYTES: u64 = 512 * 1024 * 1024;
const GUARDED_FREE_BYTES: u64 = 15 * 1024 * 1024 * 1024;
const LOW_FREE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const CRITICAL_FREE_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const MIN_PLAYBACK_FREE_BYTES: u64 = 1024 * 1024 * 1024;
const MIN_PLAYBACK_RESERVE_BYTES: u64 = 1024 * 1024 * 1024;
const INCOMPLETE_CACHE_MAX_AGE_MS: u128 = 3 * 24 * 60 * 60 * 1000;
static RQBIT_SERVER_VALIDATED: AtomicBool = AtomicBool::new(false);
static ACTIVE_PLAYBACK_CACHE_DIR: Mutex<Option<String>> = Mutex::new(None);

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn clean_value(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value)
}

fn configured_value(
    settings_value: Option<String>,
    env_key: &str,
    fallback: &str,
) -> Option<String> {
    clean_value(settings_value)
        .or_else(|| clean_value(env::var(env_key).ok()))
        .or_else(|| Some(fallback.to_string()))
}

fn configured_command(
    settings_value: Option<String>,
    env_key: &str,
    fallback: &str,
    windows_paths: &[&str],
) -> Option<String> {
    if let Some(value) = clean_value(settings_value) {
        let normalized_value = command_name(&value);
        let normalized_fallback = command_name(fallback);
        let default_command_names = [
            normalized_fallback.clone(),
            format!("{}.exe", normalized_fallback),
        ];

        if looks_like_path(&value) || !default_command_names.iter().any(|name| name == &normalized_value) {
            if looks_like_path(&value) {
                if Path::new(&value).exists() {
                    return Some(value);
                }
            } else if command_from_path(&value).is_some() {
                return Some(value);
            }
        }
    }
    if let Some(value) = clean_value(env::var(env_key).ok()) {
        return Some(value);
    }

    for path in windows_paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    for path in dynamic_windows_command_paths(fallback) {
        if Path::new(&path).exists() {
            return Some(path);
        }
    }

    if let Some(path) = command_from_path(fallback) {
        return Some(path);
    }

    Some(fallback.to_string())
}

fn looks_like_path(value: &str) -> bool {
    value.contains('/') || value.contains('\\')
}

fn command_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(value)
        .to_ascii_lowercase()
}

fn dynamic_windows_command_paths(fallback: &str) -> Vec<String> {
    let name = command_name(fallback);
    if name != "vlc" && name != "vlc.exe" {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let mut push_candidate = |base: Option<String>, suffix: &str| {
        if let Some(base) = clean_value(base) {
            candidates.push(format!(
                r"{}\{}",
                base.trim_end_matches(|ch| ch == '\\' || ch == '/'),
                suffix
            ));
        }
    };

    push_candidate(env::var("ProgramW6432").ok(), r"VideoLAN\VLC\vlc.exe");
    push_candidate(env::var("ProgramFiles").ok(), r"VideoLAN\VLC\vlc.exe");
    push_candidate(env::var("ProgramFiles(x86)").ok(), r"VideoLAN\VLC\vlc.exe");
    push_candidate(env::var("LOCALAPPDATA").ok(), r"Programs\VideoLAN\VLC\vlc.exe");
    push_candidate(env::var("LOCALAPPDATA").ok(), r"Microsoft\WinGet\Links\vlc.exe");

    candidates
}

fn command_from_path(command: &str) -> Option<String> {
    let mut names = vec![command.to_string()];
    if !command.to_ascii_lowercase().ends_with(".exe") {
        names.push(format!("{}.exe", command));
    }

    for name in names {
        let output = Command::new("where.exe")
            .arg(&name)
            .stdin(Stdio::null())
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }

        let path = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && Path::new(line).exists())
            .map(|line| line.to_string());
        if path.is_some() {
            return path;
        }
    }

    None
}

fn allowed_command(value: &str, allowed_names: &[&str]) -> bool {
    let name = command_name(value);
    allowed_names.iter().any(|allowed| name == *allowed)
}

fn command_configured(path_value: &Option<String>, allowed_names: &[&str]) -> bool {
    let Some(value) = path_value.as_ref() else {
        return false;
    };

    if !allowed_command(value, allowed_names) {
        return false;
    }

    if looks_like_path(value) && !Path::new(value).exists() {
        return false;
    }

    Command::new(value)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn command_version(path_value: &Option<String>, allowed_names: &[&str]) -> Option<String> {
    let value = path_value.as_ref()?;
    if !allowed_command(value, allowed_names) {
        return None;
    }
    if looks_like_path(value) && !Path::new(value).exists() {
        return None;
    }

    let output = Command::new(value)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect::<Vec<_>>()
        .join("")
}

fn header_end_index(bytes: &[u8]) -> Option<usize> {
    bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

fn content_length(headers: &str) -> Option<usize> {
    headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            value.trim().parse::<usize>().ok()
        } else {
            None
        }
    })
}

fn is_chunked_response(headers: &str) -> bool {
    headers.lines().any(|line| {
        let Some((name, value)) = line.split_once(':') else {
            return false;
        };
        name.trim().eq_ignore_ascii_case("transfer-encoding")
            && value.to_ascii_lowercase().contains("chunked")
    })
}

fn decode_chunked_body(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoded = Vec::new();
    let mut cursor = 0usize;

    loop {
        let Some(line_end) = body[cursor..]
            .windows(2)
            .position(|window| window == b"\r\n")
            .map(|index| cursor + index)
        else {
            return Err("Local playback returned an incomplete chunked response.".to_string());
        };

        let size_line = String::from_utf8_lossy(&body[cursor..line_end]);
        let size_text = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_text, 16)
            .map_err(|error| format!("Could not parse local playback chunk size: {}", error))?;
        cursor = line_end + 2;

        if size == 0 {
            break;
        }

        if body.len() < cursor + size + 2 {
            return Err("Local playback returned an incomplete chunked body.".to_string());
        }

        decoded.extend_from_slice(&body[cursor..cursor + size]);
        cursor += size + 2;
    }

    Ok(decoded)
}

fn local_http_request(method: &str, path: &str, body: Option<&str>) -> Result<String, String> {
    let addr: SocketAddr = "127.0.0.1:3030"
        .parse()
        .map_err(|error| format!("Invalid local playback address: {}", error))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(700))
        .map_err(|error| format!("Local playback service is not reachable: {}", error))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(45)))
        .map_err(|error| format!("Could not set local playback timeout: {}", error))?;

    let body = body.unwrap_or("");
    let request = format!(
        "{} {} HTTP/1.1\r\nHost: 127.0.0.1:3030\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        method,
        path,
        body.as_bytes().len(),
        body
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("Could not send local playback request: {}", error))?;

    let mut response = Vec::new();
    let mut buffer = [0u8; 16 * 1024];
    let mut headers_text = String::new();

    loop {
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => {
                response.extend_from_slice(&buffer[..count]);
                if let Some(header_end) = header_end_index(&response) {
                    headers_text = String::from_utf8_lossy(&response[..header_end]).to_string();
                    let body_len = response.len().saturating_sub(header_end);

                    if let Some(length) = content_length(&headers_text) {
                        if body_len >= length {
                            break;
                        }
                    } else if is_chunked_response(&headers_text) {
                        if response[header_end..]
                            .windows(5)
                            .any(|window| window == b"\r\n0\r\n")
                        {
                            break;
                        }
                    } else if body_len > 0 {
                        break;
                    }
                }
            }
            Err(error) => {
                if header_end_index(&response).is_some() {
                    break;
                }
                return Err(format!("Could not read local playback response: {}", error));
            }
        }
    }

    let Some(header_end) = header_end_index(&response) else {
        return Err("Local playback returned an empty response.".to_string());
    };

    if headers_text.is_empty() {
        headers_text = String::from_utf8_lossy(&response[..header_end]).to_string();
    }

    let body = &response[header_end..];
    let payload_bytes = if is_chunked_response(&headers_text) {
        decode_chunked_body(body)?
    } else if let Some(length) = content_length(&headers_text) {
        body[..body.len().min(length)].to_vec()
    } else {
        body.to_vec()
    };
    let payload = String::from_utf8_lossy(&payload_bytes).to_string();
    let status_line = headers_text.lines().next().unwrap_or("unknown status");
    let ok_status = status_line.contains(" 200 ")
        || status_line.contains(" 201 ")
        || status_line.contains(" 202 ")
        || status_line.contains(" 204 ");
    if !ok_status {
        return Err(format!("Local playback returned an error: {}", status_line));
    }

    Ok(payload)
}

fn magnet_info_hash(magnet: &str) -> Option<String> {
    magnet
        .split(['?', '&'])
        .find_map(|part| part.strip_prefix("xt=urn:btih:"))
        .and_then(|value| clean_value(Some(value.to_string())))
        .map(|value| value.to_ascii_lowercase())
}

fn find_existing_torrent_id(info_hash: &str) -> Option<String> {
    if info_hash.trim().is_empty() {
        return None;
    }

    let normalized_hash = info_hash.trim().to_ascii_lowercase();
    let payload = local_http_request("GET", "/torrents", None).ok()?;
    let json: serde_json::Value = serde_json::from_str(&payload).ok()?;
    let torrents = json.get("torrents").and_then(|value| value.as_array())?;

    torrents.iter().find_map(|torrent| {
        let hash_matches = torrent
            .get("info_hash")
            .and_then(|value| value.as_str())
            .map(|value| value.eq_ignore_ascii_case(&normalized_hash))
            .unwrap_or(false);
        if !hash_matches {
            return None;
        }

        torrent
            .get("id")
            .and_then(|id| {
                id.as_u64()
                    .map(|value| value.to_string())
                    .or_else(|| id.as_str().map(|value| value.to_string()))
            })
    })
}

fn find_number(value: &serde_json::Value, keys: &[&str]) -> Option<f64> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(number) = map.get(*key).and_then(|item| item.as_f64()) {
                    return Some(number);
                }
                if let Some(number) = map
                    .get(*key)
                    .and_then(|item| item.as_u64())
                    .map(|item| item as f64)
                {
                    return Some(number);
                }
            }

            map.values().find_map(|item| find_number(item, keys))
        }
        serde_json::Value::Array(items) => items.iter().find_map(|item| find_number(item, keys)),
        _ => None,
    }
}

fn find_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(text) = map.get(*key).and_then(|item| item.as_str()) {
                    return Some(text.to_string());
                }
            }

            map.values().find_map(|item| find_string(item, keys))
        }
        serde_json::Value::Array(items) => items.iter().find_map(|item| find_string(item, keys)),
        _ => None,
    }
}

fn playback_progress_from_json(
    torrent_id: &str,
    playlist_url: &str,
    json: serde_json::Value,
) -> LocalPlaybackProgress {
    let downloaded_bytes = find_number(
        &json,
        &[
            "downloaded_bytes",
            "bytes_completed",
            "completed_bytes",
            "downloaded",
            "finished_bytes",
        ],
    )
    .map(|value| value.max(0.0) as u64);
    let total_bytes = find_number(
        &json,
        &[
            "total_bytes",
            "bytes_total",
            "size_bytes",
            "total_size",
            "length",
            "size",
        ],
    )
    .map(|value| value.max(0.0) as u64);
    let progress = find_number(&json, &["progress", "progress_percent", "finished_percent"])
        .or_else(|| match (downloaded_bytes, total_bytes) {
            (Some(downloaded), Some(total)) if total > 0 => {
                Some(((downloaded as f64 / total as f64) * 100.0).clamp(0.0, 100.0))
            }
            _ => None,
        });
    let peers = find_number(
        &json,
        &[
            "peers",
            "num_peers",
            "live_peers",
            "connected_peers",
            "peer_count",
        ],
    )
    .map(|value| value.max(0.0) as u64);
    let download_speed = find_number(
        &json,
        &[
            "download_speed",
            "download_speed_bytes_per_second",
            "download_rate",
            "down_rate",
        ],
    );
    let raw_state = find_string(&json, &["state", "status", "phase"]).unwrap_or_else(|| {
        if progress.unwrap_or(0.0) >= 99.9 {
            "ready".to_string()
        } else if downloaded_bytes.unwrap_or(0) > 0 || peers.unwrap_or(0) > 0 {
            "buffering".to_string()
        } else {
            "starting".to_string()
        }
    });
    let normalized_state = raw_state.to_ascii_lowercase();
    let message = if normalized_state.contains("error") {
        "Local playback reported an error for this source.".to_string()
    } else if progress.unwrap_or(0.0) >= 99.9 {
        "The selected source is ready locally. Playback can continue inside StreamNyaa."
            .to_string()
    } else if peers.unwrap_or(0) > 0 {
        "Torrent metadata is active and pieces are being fetched locally.".to_string()
    } else {
        "Waiting for torrent metadata and peers. Low-seed sources can take longer.".to_string()
    };

    LocalPlaybackProgress {
        ok: true,
        torrent_id: torrent_id.to_string(),
        state: normalized_state,
        message,
        progress,
        downloaded_bytes,
        total_bytes,
        peers,
        download_speed,
        playlist_url: playlist_url.to_string(),
    }
}

fn wait_for_playlist_ready(torrent_id: &str) -> bool {
    let path = format!("/torrents/{}/playlist", percent_encode(torrent_id));
    for _ in 0..20 {
        if local_http_request("GET", &path, None).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(350));
    }
    false
}

fn ensure_streamnyaa_vlc_notes(cache_dir: &str) -> Result<(), String> {
    let mut config_dir = PathBuf::from(cache_dir);
    config_dir.push("streamnyaa-vlc");
    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Could not prepare VLC support folder: {}", error))?;
    fs::write(
        config_dir.join("README.txt"),
        "StreamNyaa uses this folder for VLC-only local playback support files.\n",
    )
    .map_err(|error| format!("Could not write VLC support note: {}", error))?;
    Ok(())
}

#[cfg(windows)]
fn stop_streamnyaa_player_processes() {
    let _ = Command::new("taskkill")
        .arg("/IM")
        .arg("vlc.exe")
        .arg("/F")
        .arg("/T")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn stop_streamnyaa_player_processes() {
    let _ = Command::new("pkill")
        .arg("-f")
        .arg("vlc")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn launch_vlc_player(player_path: &str, playlist_url: &str, title: &str, cache_dir: &str) -> Result<(), String> {
    ensure_streamnyaa_vlc_notes(cache_dir)?;
    stop_streamnyaa_player_processes();
    let mut last_error = None;

    for attempt in 0..2 {
        let mut command = Command::new(player_path);
        let result = command
            .arg("--started-from-file")
            .arg("--no-playlist-enqueue")
            .arg("--play-and-exit")
            .arg("--video-title")
            .arg(format!("StreamNyaa - {}", title))
            .arg("--meta-title")
            .arg(format!("StreamNyaa - {}", title))
            .arg("--network-caching=1800")
            .arg("--file-caching=1800")
            .arg("--disc-caching=1800")
            .arg("--live-caching=1800")
            .arg("--avcodec-hw=any")
            .arg("--sub-track=0")
            .arg(playlist_url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        match result {
            Ok(mut child) => {
                let cleanup_dir = cache_dir.to_string();
                if let Ok(mut active_dir) = ACTIVE_PLAYBACK_CACHE_DIR.lock() {
                    *active_dir = Some(cleanup_dir.clone());
                }
                thread::spawn(move || {
                    let _ = child.wait();
                    clear_local_torrents(true);
                    let _ = clear_cache_dir(&cleanup_dir);
                    cleanup_legacy_temp_cache(&cleanup_dir);
                    maintain_cache_dir(&cleanup_dir);
                    if let Ok(mut active_dir) = ACTIVE_PLAYBACK_CACHE_DIR.lock() {
                        if active_dir.as_deref() == Some(cleanup_dir.as_str()) {
                            *active_dir = None;
                        }
                    }
                });
                return Ok(());
            }
            Err(error) => {
                last_error = Some(error.to_string());
                if attempt == 0 {
                    thread::sleep(Duration::from_millis(450));
                }
            }
        }
    }

    Err(format!(
        "Could not start the local player: {}",
        last_error.unwrap_or_else(|| "unknown launch error".to_string())
    ))
}

fn rqbit_server_ready() -> bool {
    local_http_request("GET", "/", None).is_ok()
}

fn rqbit_server_uses_cache(cache_dir: &str) -> bool {
    let payload = match local_http_request("GET", "/torrents", None) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let parsed: serde_json::Value = match serde_json::from_str(&payload) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let torrents = parsed
        .get("torrents")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    if torrents.is_empty() {
        return true;
    }
    torrents.iter().all(|torrent| {
        torrent
            .get("output_folder")
            .and_then(|value| value.as_str())
            .map(|folder| same_path_text(folder, cache_dir))
            .unwrap_or(false)
    })
}

#[cfg(windows)]
fn stop_rqbit_processes() {
    let _ = Command::new("taskkill")
        .arg("/IM")
        .arg("rqbit.exe")
        .arg("/F")
        .arg("/T")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn stop_rqbit_processes() {
    let _ = Command::new("pkill")
        .arg("-f")
        .arg("rqbit")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn wait_for_rqbit_stop() {
    for _ in 0..20 {
        if !rqbit_server_ready() {
            return;
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn active_torrent_ids() -> Vec<String> {
    let payload = match local_http_request("GET", "/torrents", None) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let parsed: serde_json::Value = match serde_json::from_str(&payload) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    parsed
        .get("torrents")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|torrent| {
                    torrent.get("id").and_then(|id| {
                        id.as_u64()
                            .map(|value| value.to_string())
                            .or_else(|| id.as_str().map(|value| value.to_string()))
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn clear_local_torrents(delete_files: bool) {
    for id in active_torrent_ids() {
        let path = format!(
            "/torrents/{}?with_files={}",
            percent_encode(&id),
            if delete_files { "true" } else { "false" }
        );
        let _ = local_http_request("DELETE", &path, None);
    }
}

fn reset_playback_session(cache_dir: &str) -> Result<(), String> {
    stop_streamnyaa_player_processes();
    clear_local_torrents(true);
    clear_cache_dir(cache_dir)?;
    maintain_cache_dir(cache_dir);
    if let Ok(mut active_dir) = ACTIVE_PLAYBACK_CACHE_DIR.lock() {
        *active_dir = Some(cache_dir.to_string());
    }
    Ok(())
}

fn start_rqbit_server(engine_path: &str, cache_dir: &str) -> Result<(), String> {
    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not prepare local storage folder: {}", error))?;
    maintain_cache_dir(cache_dir);

    if rqbit_server_ready() {
        if RQBIT_SERVER_VALIDATED.load(Ordering::SeqCst) && rqbit_server_uses_cache(cache_dir) {
            return Ok(());
        }
        stop_rqbit_processes();
        wait_for_rqbit_stop();
        maintain_cache_dir(cache_dir);
        if rqbit_server_ready() {
            return Err("A stale local playback engine is still running. Close StreamNyaa and any local playback processes, then reopen the app.".to_string());
        }
    }

    Command::new(engine_path)
        .arg("server")
        .arg("start")
        .arg(cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start local playback: {}", error))?;

    for _ in 0..40 {
        if rqbit_server_ready() && rqbit_server_uses_cache(cache_dir) {
            RQBIT_SERVER_VALIDATED.store(true, Ordering::SeqCst);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }

    Err("Local playback did not become ready in time.".to_string())
}

fn default_cache_dir() -> String {
    let mut path = env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::temp_dir());
    path.push("StreamNyaa");
    path.push("Cache");
    path.to_string_lossy().to_string()
}

fn same_path_text(left: &str, right: &str) -> bool {
    left.trim_end_matches(|ch| ch == '\\' || ch == '/')
        .eq_ignore_ascii_case(right.trim_end_matches(|ch| ch == '\\' || ch == '/'))
}

fn resolved_cache_dir(settings: Option<String>) -> String {
    let legacy_dir = legacy_temp_cache_dir();
    let configured = clean_value(settings)
        .or_else(|| clean_value(env::var("STREAMNYAA_CACHE_DIR").ok()));
    if let Some(value) = configured {
        if !same_path_text(&value, &legacy_dir) {
            return value;
        }
    }
    default_cache_dir()
}

fn legacy_temp_cache_dir() -> String {
    let mut path = env::temp_dir();
    path.push("streamnyaa-desktop");
    path.to_string_lossy().to_string()
}

#[cfg(windows)]
fn available_disk_bytes(cache_dir: &str) -> Option<u64> {
    let drive = cache_dir
        .chars()
        .next()
        .filter(|_| cache_dir.as_bytes().get(1) == Some(&b':'))
        .unwrap_or('C');
    let command = format!("(Get-PSDrive -Name '{}').Free", drive);
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(command)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u64>()
        .ok()
}

#[cfg(not(windows))]
fn available_disk_bytes(cache_dir: &str) -> Option<u64> {
    let output = Command::new("df")
        .arg("-Pk")
        .arg(cache_dir)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().nth(1)?;
    let available_kib = line.split_whitespace().nth(3)?.parse::<u64>().ok()?;
    Some(available_kib.saturating_mul(1024))
}

fn parse_size_bytes(size: Option<&str>) -> Option<u64> {
    let text = size?.trim().replace(',', "");
    if text.is_empty() {
        return None;
    }

    let number_text: String = text
        .chars()
        .take_while(|character| character.is_ascii_digit() || *character == '.')
        .collect();
    if number_text.is_empty() {
        return None;
    }

    let value = number_text.parse::<f64>().ok()?;
    if !value.is_finite() || value <= 0.0 {
        return None;
    }

    let unit = text[number_text.len()..].trim().to_ascii_lowercase();
    let multiplier = if unit.contains("tib") || unit.contains("tb") {
        1024_f64.powi(4)
    } else if unit.contains("gib") || unit.contains("gb") {
        1024_f64.powi(3)
    } else if unit.contains("mib") || unit.contains("mb") {
        1024_f64.powi(2)
    } else if unit.contains("kib") || unit.contains("kb") {
        1024_f64
    } else {
        1.0
    };

    Some((value * multiplier).round().max(0.0) as u64)
}

fn format_bytes(bytes: u64) -> String {
    let gib = 1024_f64.powi(3);
    let mib = 1024_f64.powi(2);
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / gib)
    } else if bytes >= 1024 * 1024 {
        format!("{:.0} MB", bytes as f64 / mib)
    } else {
        format!("{} bytes", bytes)
    }
}

fn storage_guard_message(cache_dir: &str, source_size: Option<&str>) -> Option<String> {
    if !enough_space_for_playback(cache_dir) {
        return Some("Your device is too low on free space to start local playback safely. Clear storage or choose a smaller source.".to_string());
    }

    let source_bytes = parse_size_bytes(source_size)?;
    let free_bytes = available_disk_bytes(cache_dir)?;
    if free_bytes <= MIN_PLAYBACK_RESERVE_BYTES
        || source_bytes.saturating_add(MIN_PLAYBACK_RESERVE_BYTES) > free_bytes
    {
        return Some(format!(
            "This source is {} and your device has {} free. Choose a smaller source or clear storage before playback.",
            format_bytes(source_bytes),
            format_bytes(free_bytes)
        ));
    }

    None
}

fn cache_pressure_for_free_space(free_bytes: Option<u64>) -> String {
    match free_bytes {
        Some(value) if value < CRITICAL_FREE_BYTES => "critical".to_string(),
        Some(value) if value < LOW_FREE_BYTES => "low".to_string(),
        Some(value) if value < GUARDED_FREE_BYTES => "guarded".to_string(),
        Some(_) => "normal".to_string(),
        None => "unknown".to_string(),
    }
}

fn adaptive_cache_max_bytes(cache_dir: &str) -> u64 {
    match available_disk_bytes(cache_dir) {
        Some(value) if value < CRITICAL_FREE_BYTES => EMERGENCY_CACHE_MAX_BYTES,
        Some(value) if value < LOW_FREE_BYTES => LOW_SPACE_CACHE_MAX_BYTES,
        Some(value) if value < GUARDED_FREE_BYTES => GUARDED_CACHE_MAX_BYTES,
        _ => DEFAULT_CACHE_MAX_BYTES,
    }
}

fn modified_ms(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn collect_cache_file_entries(cache_dir: &str) -> Vec<CacheEntry> {
    let root = PathBuf::from(cache_dir);
    let mut entries = Vec::new();
    let mut stack = vec![root.clone()];

    while let Some(path) = stack.pop() {
        let Ok(read_dir) = fs::read_dir(&path) else {
            continue;
        };

        for item in read_dir.flatten() {
            let item_path = item.path();
            let Ok(metadata) = item.metadata() else {
                continue;
            };

            if metadata.is_dir() {
                stack.push(item_path);
            } else if metadata.is_file() {
                let size = metadata.len();
                entries.push(CacheEntry {
                    name: item_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("cached file")
                        .to_string(),
                    path: item_path.to_string_lossy().to_string(),
                    size_bytes: size,
                    modified_ms: modified_ms(&item_path),
                });
            }
        }
    }

    entries
}

fn collect_cache_entries(cache_dir: &str) -> CacheStatus {
    let mut entries = collect_cache_file_entries(cache_dir);
    let total_bytes = entries.iter().fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));
    let file_count = entries.len() as u64;
    let free_bytes = available_disk_bytes(cache_dir);
    let max_bytes = adaptive_cache_max_bytes(cache_dir);
    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    entries.truncate(12);

    CacheStatus {
        cache_dir: cache_dir.to_string(),
        total_bytes,
        file_count,
        max_bytes,
        free_bytes,
        pressure: cache_pressure_for_free_space(free_bytes),
        entries,
    }
}

fn is_protected_cache_path(path: &Path) -> bool {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
    name == "streamnyaa-vlc"
}

fn is_incomplete_cache_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    name.contains(".part")
        || name.contains(".tmp")
        || name.contains(".crdownload")
        || name.contains("incomplete")
}

fn cleanup_incomplete_cache_files(cache_dir: &str) {
    let now = now_millis();
    for entry in collect_cache_file_entries(cache_dir) {
        let path = PathBuf::from(&entry.path);
        if is_protected_cache_path(&path) || !is_incomplete_cache_file(&path) {
            continue;
        }
        if entry.modified_ms > 0 && now.saturating_sub(entry.modified_ms) < INCOMPLETE_CACHE_MAX_AGE_MS {
            continue;
        }
        let _ = fs::remove_file(path);
    }
}

fn prune_cache_dir(cache_dir: &str) {
    let mut entries = collect_cache_file_entries(cache_dir);
    let mut total_bytes = entries.iter().fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));
    let max_bytes = adaptive_cache_max_bytes(cache_dir);
    if total_bytes <= max_bytes {
        return;
    }

    entries.sort_by(|a, b| a.modified_ms.cmp(&b.modified_ms));
    for entry in entries {
        if total_bytes <= max_bytes {
            break;
        }
        let path = PathBuf::from(&entry.path);
        if is_protected_cache_path(&path) {
            continue;
        }
        if fs::remove_file(&path).is_ok() {
            total_bytes = total_bytes.saturating_sub(entry.size_bytes);
        }
    }
}

fn cleanup_legacy_temp_cache(cache_dir: &str) {
    let legacy = PathBuf::from(legacy_temp_cache_dir());
    if !legacy.exists() || legacy == PathBuf::from(cache_dir) {
        return;
    }

    let _ = fs::remove_dir_all(legacy);
}

fn maintain_cache_dir(cache_dir: &str) {
    cleanup_legacy_temp_cache(cache_dir);
    cleanup_incomplete_cache_files(cache_dir);
    prune_cache_dir(cache_dir);
}

fn startup_storage_maintenance() {
    let cache_dir = default_cache_dir();
    let _ = fs::create_dir_all(&cache_dir);

    if rqbit_server_ready() && !rqbit_server_uses_cache(&cache_dir) {
        stop_rqbit_processes();
        wait_for_rqbit_stop();
    }

    let _ = clear_cache_dir(&cache_dir);
    cleanup_legacy_temp_cache(&cache_dir);
    maintain_cache_dir(&cache_dir);
}

fn enough_space_for_playback(cache_dir: &str) -> bool {
    let Some(free_before) = available_disk_bytes(cache_dir) else {
        return true;
    };
    if free_before >= MIN_PLAYBACK_FREE_BYTES {
        return true;
    }

    let _ = clear_cache_dir(cache_dir);
    maintain_cache_dir(cache_dir);
    available_disk_bytes(cache_dir)
        .map(|free_after| free_after >= MIN_PLAYBACK_FREE_BYTES)
        .unwrap_or(true)
}

fn clear_cache_dir(cache_dir: &str) -> Result<(), String> {
    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not prepare storage folder: {}", error))?;

    for item in fs::read_dir(cache_dir)
        .map_err(|error| format!("Could not read storage folder: {}", error))?
        .flatten()
    {
        let path = item.path();
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
        if name == "streamnyaa-vlc" {
            continue;
        }

        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|error| format!("Could not remove cached folder: {}", error))?;
        } else {
            fs::remove_file(&path)
                .map_err(|error| format!("Could not remove cached file: {}", error))?;
        }
    }

    Ok(())
}

fn cleanup_playback_on_exit() {
    let active_cache_dir = ACTIVE_PLAYBACK_CACHE_DIR
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .unwrap_or_else(default_cache_dir);

    clear_local_torrents(true);
    stop_streamnyaa_player_processes();
    stop_rqbit_processes();
    wait_for_rqbit_stop();

    let _ = clear_cache_dir(&active_cache_dir);
    cleanup_legacy_temp_cache(&active_cache_dir);
    if active_cache_dir != default_cache_dir() {
        let default_dir = default_cache_dir();
        let _ = clear_cache_dir(&default_dir);
        cleanup_legacy_temp_cache(&default_dir);
    }
}

#[tauri::command]
fn get_desktop_runtime_status(settings: Option<DesktopSettings>) -> RuntimeStatus {
    let settings = settings.unwrap_or(DesktopSettings {
        torrent_engine_path: None,
        vlc_path: None,
        cache_dir: None,
    });
    let torrent_engine_path = configured_value(
        settings.torrent_engine_path,
        "STREAMNYAA_TORRENT_ENGINE_PATH",
        "rqbit",
    );
    let player_path = configured_command(
        settings.vlc_path,
        "STREAMNYAA_VLC_PATH",
        "vlc",
        &[
            r"C:\Program Files\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
        ],
    );
    let cache_dir = resolved_cache_dir(settings.cache_dir);
    let torrent_engine_configured =
        command_configured(&torrent_engine_path, &["rqbit", "rqbit.exe"]);
    let player_configured =
        command_configured(&player_path, &["vlc", "vlc.exe"]);
    let torrent_engine_version = command_version(&torrent_engine_path, &["rqbit", "rqbit.exe"]);
    let player_version = command_version(&player_path, &["vlc", "vlc.exe"]);
    let ready = torrent_engine_configured && player_configured;
    let message = if ready {
        "Local playback is ready.".to_string()
    } else if !torrent_engine_configured {
        "Set the local playback engine path to enable playback.".to_string()
    } else if !player_configured {
        "Install VLC or set the VLC executable path to enable playback.".to_string()
    } else {
        "Local playback is installed. Configure the playback paths to enable playback.".to_string()
    };

    RuntimeStatus {
        ready,
        torrent_engine_configured,
        player_configured,
        torrent_engine_path,
        player_path,
        torrent_engine_version,
        player_version,
        cache_dir,
        message,
    }
}

#[tauri::command]
fn test_vlc_player(settings: Option<DesktopSettings>) -> ToolTestStatus {
    let settings = settings.unwrap_or(DesktopSettings {
        torrent_engine_path: None,
        vlc_path: None,
        cache_dir: None,
    });
    let player_path = configured_command(
        settings.vlc_path,
        "STREAMNYAA_VLC_PATH",
        "vlc",
        &[
            r"C:\Program Files\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
        ],
    );
    let version = command_version(&player_path, &["vlc", "vlc.exe"]);

    let Some(path) = player_path else {
        return ToolTestStatus {
            ok: false,
            message: "VLC path is missing.".to_string(),
            path: None,
            version: None,
        };
    };

    if version.is_none() {
        return ToolTestStatus {
            ok: false,
            message: "VLC was not found at the configured path.".to_string(),
            path: Some(path),
            version: None,
        };
    }

    match Command::new(&path)
        .arg("--started-from-file")
        .arg("--one-instance")
        .arg("--qt-start-minimized")
        .arg("--play-and-exit")
        .arg("--meta-title=StreamNyaa VLC Test")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => ToolTestStatus {
            ok: true,
            message: "VLC was detected and opened successfully.".to_string(),
            path: Some(path),
            version,
        },
        Err(error) => ToolTestStatus {
            ok: false,
            message: format!("Could not open VLC: {}", error),
            path: Some(path),
            version,
        },
    }
}

#[tauri::command]
fn open_cache_folder(settings: Option<DesktopSettings>) -> Result<(), String> {
    let cache_dir = resolved_cache_dir(settings.and_then(|value| value.cache_dir));
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Could not create local cache folder: {}", error))?;

    Command::new("explorer")
        .arg(&cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not open cache folder: {}", error))?;

    Ok(())
}

#[tauri::command]
fn get_cache_status(settings: Option<DesktopSettings>) -> Result<CacheStatus, String> {
    let cache_dir = resolved_cache_dir(settings.and_then(|value| value.cache_dir));
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Could not prepare storage folder: {}", error))?;
    maintain_cache_dir(&cache_dir);
    Ok(collect_cache_entries(&cache_dir))
}

#[tauri::command]
fn clear_playback_cache(settings: Option<DesktopSettings>) -> Result<CacheStatus, String> {
    let cache_dir = resolved_cache_dir(settings.and_then(|value| value.cache_dir));
    cleanup_legacy_temp_cache(&cache_dir);
    clear_cache_dir(&cache_dir)?;
    Ok(collect_cache_entries(&cache_dir))
}

#[tauri::command]
fn get_desktop_diagnostics(settings: Option<DesktopSettings>) -> Result<DiagnosticsStatus, String> {
    let runtime = get_desktop_runtime_status(settings.clone());
    let cache = collect_cache_entries(&runtime.cache_dir);
    Ok(DiagnosticsStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        runtime,
        cache,
        recent_errors: Vec::new(),
    })
}

fn prepare_local_playback_blocking(settings: Option<DesktopSettings>) -> Result<RuntimeStatus, String> {
    let runtime = get_desktop_runtime_status(settings);
    if !runtime.ready {
        return Ok(runtime);
    }

    if let Some(engine_path) = runtime.torrent_engine_path.as_ref() {
        fs::create_dir_all(&runtime.cache_dir)
            .map_err(|error| format!("Could not create local cache folder: {}", error))?;
        start_rqbit_server(engine_path, &runtime.cache_dir)?;
    }

    Ok(RuntimeStatus {
        message: "Local playback is warmed up.".to_string(),
        ..runtime
    })
}

#[tauri::command]
async fn prepare_local_playback(settings: Option<DesktopSettings>) -> Result<RuntimeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_local_playback_blocking(settings))
        .await
        .map_err(|error| format!("Local playback warmup task could not finish: {}", error))?
}

fn add_local_torrent_blocking(
    request: PlaybackRequest,
    open_player: bool,
) -> Result<PlaybackStatus, String> {
    if request.magnet.trim().is_empty() {
        return Err("No source link was provided.".to_string());
    }
    if !request
        .magnet
        .trim_start()
        .starts_with("magnet:?xt=urn:btih:")
    {
        return Err("Only magnet source links are supported for local playback.".to_string());
    }

    let source_hash = clean_value(request.info_hash.clone()).or_else(|| magnet_info_hash(&request.magnet));
    let label = if request.anime_title.trim().is_empty() {
        request.title
    } else if request.episode.trim().is_empty() {
        format!("{} - {}", request.anime_title, request.title)
    } else {
        format!("{} - Episode {}", request.anime_title, request.episode)
    };

    let runtime = get_desktop_runtime_status(request.settings.clone());
    if !runtime.ready {
        return Ok(PlaybackStatus {
            ok: false,
            state: "needs_setup".to_string(),
            message: runtime.message,
            title: label,
            torrent_id: None,
            playlist_url: None,
        });
    }

    let Some(engine_path) = runtime.torrent_engine_path.clone() else {
        return Err("Torrent engine path is missing.".to_string());
    };
    let player_path = runtime.player_path.clone();

    fs::create_dir_all(&runtime.cache_dir)
        .map_err(|error| format!("Could not create local cache folder: {}", error))?;
    maintain_cache_dir(&runtime.cache_dir);
    if let Some(message) = storage_guard_message(&runtime.cache_dir, request.size.as_deref()) {
        return Ok(PlaybackStatus {
            ok: false,
            state: "low_storage".to_string(),
            message,
            title: label,
            torrent_id: None,
            playlist_url: None,
        });
    }

    if let Err(error) = start_rqbit_server(&engine_path, &runtime.cache_dir) {
        return Err(error);
    }

    if open_player {
        reset_playback_session(&runtime.cache_dir)?;
    }

    let torrent_id = if let Some(hash) = source_hash.as_deref() {
        find_existing_torrent_id(hash)
    } else {
        None
    }
    .map(Ok)
    .unwrap_or_else(|| {
        let add_path = format!(
            "/torrents?output_folder={}",
            percent_encode(&runtime.cache_dir)
        );
        let add_response = local_http_request("POST", &add_path, Some(&request.magnet))?;
        let add_json: serde_json::Value = serde_json::from_str(&add_response)
            .map_err(|error| format!("Could not parse local playback response: {}", error))?;
        add_json
            .get("id")
            .and_then(|id| {
                id.as_u64()
                    .map(|value| value.to_string())
                    .or_else(|| id.as_str().map(|value| value.to_string()))
            })
            .ok_or_else(|| "Local playback did not return a playable source id yet.".to_string())
    })?;
    let playlist_url = format!("http://127.0.0.1:3030/torrents/{}/playlist", torrent_id);

    if open_player {
        let Some(player_path) = player_path else {
            return Err("VLC path is missing.".to_string());
        };
        if !wait_for_playlist_ready(&torrent_id) {
            return Ok(PlaybackStatus {
                ok: false,
                state: "preparing".to_string(),
                message: "The local stream is still preparing. Try again in a few seconds or choose a higher-seeder source.".to_string(),
                title: label,
                torrent_id: Some(torrent_id),
                playlist_url: Some(playlist_url),
            });
        }
        launch_vlc_player(&player_path, &playlist_url, &label, &runtime.cache_dir)?;
    }

    Ok(PlaybackStatus {
        ok: true,
        state: if open_player { "started" } else { "downloading" }.to_string(),
        message: if open_player {
            "Local stream started. Playback will begin once metadata and pieces are ready."
                .to_string()
        } else {
            "Local playback started. The file will be saved in StreamNyaa storage."
                .to_string()
        },
        title: label,
        torrent_id: Some(torrent_id),
        playlist_url: Some(playlist_url),
    })
}

fn play_local_torrent_blocking(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    add_local_torrent_blocking(request, true)
}

fn download_local_torrent_blocking(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    add_local_torrent_blocking(request, false)
}

#[tauri::command]
async fn play_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    tauri::async_runtime::spawn_blocking(move || play_local_torrent_blocking(request))
        .await
        .map_err(|error| format!("Local playback task could not finish: {}", error))?
}

#[tauri::command]
async fn download_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    tauri::async_runtime::spawn_blocking(move || download_local_torrent_blocking(request))
        .await
        .map_err(|error| format!("Local download task could not finish: {}", error))?
}

fn get_local_playback_progress_blocking(
    request: PlaybackProgressRequest,
) -> Result<LocalPlaybackProgress, String> {
    let torrent_id = request.torrent_id.trim();
    if torrent_id.is_empty() {
        return Err("Torrent id is missing.".to_string());
    }

    let playlist_url = format!("http://127.0.0.1:3030/torrents/{}/playlist", torrent_id);
    let stats_payload =
        local_http_request("GET", &format!("/torrents/{}/stats/v1", torrent_id), None)
            .or_else(|_| local_http_request("GET", &format!("/torrents/{}", torrent_id), None))?;
    let stats_json: serde_json::Value = serde_json::from_str(&stats_payload)
        .map_err(|error| format!("Could not parse local playback status: {}", error))?;

    Ok(playback_progress_from_json(
        torrent_id,
        &playlist_url,
        stats_json,
    ))
}

#[tauri::command]
async fn get_local_playback_progress(
    request: PlaybackProgressRequest,
) -> Result<LocalPlaybackProgress, String> {
    tauri::async_runtime::spawn_blocking(move || get_local_playback_progress_blocking(request))
        .await
        .map_err(|error| format!("Playback progress task could not finish: {}", error))?
}

fn stop_local_playback_blocking(request: StopPlaybackRequest) -> Result<(), String> {
    let torrent_id = request.torrent_id.trim();
    if torrent_id.is_empty() {
        return Ok(());
    }

    stop_streamnyaa_player_processes();
    let delete_path = format!("/torrents/{}", percent_encode(torrent_id));
    local_http_request("DELETE", &delete_path, None)
        .or_else(|_| local_http_request("DELETE", &format!("{}?with_files=true", delete_path), None))
        .map(|_| ())
        .map_err(|error| format!("Could not stop local torrent: {}", error))
}

#[tauri::command]
async fn stop_local_playback(request: StopPlaybackRequest) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop_local_playback_blocking(request))
        .await
        .map_err(|error| format!("Stop task could not finish: {}", error))?
}

fn open_local_torrent_player_blocking(request: OpenTorrentPlayerRequest) -> Result<PlaybackStatus, String> {
    let torrent_id = request.torrent_id.trim();
    if torrent_id.is_empty() {
        return Err("Torrent id is missing.".to_string());
    }

    let runtime = get_desktop_runtime_status(request.settings.clone());
    if !runtime.ready {
        return Ok(PlaybackStatus {
            ok: false,
            state: "needs_setup".to_string(),
            message: runtime.message,
            title: "Local stream".to_string(),
            torrent_id: Some(torrent_id.to_string()),
            playlist_url: None,
        });
    }

    let Some(engine_path) = runtime.torrent_engine_path.clone() else {
        return Err("Torrent engine path is missing.".to_string());
    };
    let Some(player_path) = runtime.player_path.clone() else {
        return Err("VLC path is missing.".to_string());
    };

    fs::create_dir_all(&runtime.cache_dir)
        .map_err(|error| format!("Could not create local cache folder: {}", error))?;
    maintain_cache_dir(&runtime.cache_dir);
    if !enough_space_for_playback(&runtime.cache_dir) {
        return Ok(PlaybackStatus {
            ok: false,
            state: "low_storage".to_string(),
            message: "Your device is too low on free space to open local playback safely. Clear storage or choose a smaller source.".to_string(),
            title: "Local stream".to_string(),
            torrent_id: Some(torrent_id.to_string()),
            playlist_url: None,
        });
    }
    start_rqbit_server(&engine_path, &runtime.cache_dir)?;

    let title = clean_value(request.title).unwrap_or_else(|| "Local stream".to_string());
    let playlist_url = format!("http://127.0.0.1:3030/torrents/{}/playlist", percent_encode(torrent_id));
    if !wait_for_playlist_ready(torrent_id) {
        return Ok(PlaybackStatus {
            ok: false,
            state: "preparing".to_string(),
            message: "The stream playlist is still preparing. Try opening this source again in a few seconds.".to_string(),
            title,
            torrent_id: Some(torrent_id.to_string()),
            playlist_url: Some(playlist_url),
        });
    }
    launch_vlc_player(&player_path, &playlist_url, &title, &runtime.cache_dir)?;

    Ok(PlaybackStatus {
        ok: true,
        state: "opened".to_string(),
        message: "The active local stream opened.".to_string(),
        title,
        torrent_id: Some(torrent_id.to_string()),
        playlist_url: Some(playlist_url),
    })
}

#[tauri::command]
async fn open_local_torrent_player(request: OpenTorrentPlayerRequest) -> Result<PlaybackStatus, String> {
    tauri::async_runtime::spawn_blocking(move || open_local_torrent_player_blocking(request))
        .await
        .map_err(|error| format!("Open player task could not finish: {}", error))?
}

fn fetch_desktop_source_api_blocking(url: String) -> Result<SourceApiResponse, String> {
    let trimmed_url = url.trim();
    if !trimmed_url.starts_with("https://www.streamnyaa.xyz/api/nyaa?") {
        return Err("Desktop source search can only call the StreamNyaa source API.".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(35))
        .user_agent("StreamNyaa Desktop/0.1")
        .build()
        .map_err(|error| format!("Could not prepare desktop source search: {}", error))?;

    let response = client
        .get(trimmed_url)
        .send()
        .map_err(|error| format!("Desktop source search failed: {}", error))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Desktop source search returned {}", status.as_u16()));
    }

    let data = response
        .json::<serde_json::Value>()
        .map_err(|error| format!("Could not read desktop source results: {}", error))?;

    Ok(SourceApiResponse {
        data,
        fetched_at: now_millis(),
    })
}

#[tauri::command]
async fn fetch_desktop_source_api(url: String) -> Result<SourceApiResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_desktop_source_api_blocking(url))
        .await
        .map_err(|error| format!("Desktop source search task could not finish: {}", error))?
}

fn main() {
    tauri::Builder::default()
        .setup(|_| {
            thread::spawn(startup_storage_maintenance);
            Ok(())
        })
        .on_window_event(|_, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                cleanup_playback_on_exit();
            }
        })
        .invoke_handler(tauri::generate_handler![
            fetch_desktop_source_api,
            clear_playback_cache,
            download_local_torrent,
            get_cache_status,
            get_desktop_diagnostics,
            get_desktop_runtime_status,
            get_local_playback_progress,
            open_cache_folder,
            open_local_torrent_player,
            prepare_local_playback,
            play_local_torrent,
            stop_local_playback,
            test_vlc_player
        ])
        .run(tauri::generate_context!())
        .expect("failed to start StreamNyaa desktop app");
}
