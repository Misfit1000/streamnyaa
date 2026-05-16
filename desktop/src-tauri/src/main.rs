use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::Path,
    process::{Command, Stdio},
    thread,
    time::Duration,
};

#[derive(Serialize)]
struct PlaybackStatus {
    ok: bool,
    state: String,
    message: String,
    title: String,
}

#[derive(Serialize)]
struct RuntimeStatus {
    ready: bool,
    torrent_engine_configured: bool,
    player_configured: bool,
    torrent_engine_path: Option<String>,
    player_path: Option<String>,
    cache_dir: String,
    message: String,
}

#[derive(Clone, Deserialize)]
struct DesktopSettings {
    torrent_engine_path: Option<String>,
    mpv_path: Option<String>,
    cache_dir: Option<String>,
    player_mode: Option<String>,
}

#[derive(Deserialize)]
struct PlaybackRequest {
    magnet: String,
    title: String,
    anime_title: String,
    episode: String,
    settings: Option<DesktopSettings>,
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

fn local_http_request(method: &str, path: &str, body: Option<&str>) -> Result<String, String> {
    let addr: SocketAddr = "127.0.0.1:3030"
        .parse()
        .map_err(|error| format!("Invalid rqbit address: {}", error))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(700))
        .map_err(|error| format!("rqbit server is not reachable: {}", error))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(8)))
        .map_err(|error| format!("Could not set rqbit read timeout: {}", error))?;

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
        .map_err(|error| format!("Could not write rqbit request: {}", error))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Could not read rqbit response: {}", error))?;

    let mut parts = response.splitn(2, "\r\n\r\n");
    let headers = parts.next().unwrap_or("");
    let payload = parts.next().unwrap_or("").to_string();
    let status_line = headers.lines().next().unwrap_or("unknown status");
    let ok_status = status_line.contains(" 200 ")
        || status_line.contains(" 201 ")
        || status_line.contains(" 202 ")
        || status_line.contains(" 204 ");
    if !ok_status {
        return Err(format!("rqbit returned an error: {}", status_line));
    }

    Ok(payload)
}

fn rqbit_server_ready() -> bool {
    local_http_request("GET", "/", None).is_ok()
}

fn start_rqbit_server(engine_path: &str, cache_dir: &str) -> Result<(), String> {
    if rqbit_server_ready() {
        return Ok(());
    }

    Command::new(engine_path)
        .arg("server")
        .arg("start")
        .arg(cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start rqbit server: {}", error))?;

    for _ in 0..40 {
        if rqbit_server_ready() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }

    Err("rqbit server did not become ready in time.".to_string())
}

fn resolved_cache_dir(settings: Option<String>) -> String {
    clean_value(settings)
        .or_else(|| clean_value(env::var("STREAMNYAA_CACHE_DIR").ok()))
        .unwrap_or_else(|| {
            let mut path = env::temp_dir();
            path.push("streamnyaa-desktop");
            path.to_string_lossy().to_string()
        })
}

#[tauri::command]
fn get_desktop_runtime_status(settings: Option<DesktopSettings>) -> RuntimeStatus {
    let settings = settings.unwrap_or(DesktopSettings {
        torrent_engine_path: None,
        mpv_path: None,
        cache_dir: None,
        player_mode: None,
    });
    let player_mode = settings
        .player_mode
        .clone()
        .unwrap_or_else(|| "mpv".to_string());
    let torrent_engine_path = configured_value(
        settings.torrent_engine_path,
        "STREAMNYAA_TORRENT_ENGINE_PATH",
        "rqbit",
    );
    let player_path = if player_mode == "mpv" {
        configured_value(settings.mpv_path, "STREAMNYAA_MPV_PATH", "mpv")
    } else {
        None
    };
    let cache_dir = resolved_cache_dir(settings.cache_dir);
    let torrent_engine_configured =
        command_configured(&torrent_engine_path, &["rqbit", "rqbit.exe"]);
    let player_configured =
        player_mode != "mpv" || command_configured(&player_path, &["mpv", "mpv.exe"]);
    let ready = torrent_engine_configured && player_configured;
    let message = if ready {
        "rqbit and MPV commands are configured.".to_string()
    } else if !torrent_engine_configured {
        "Set the rqbit command or full executable path to enable local playback.".to_string()
    } else if !player_configured {
        "Set the MPV command or full executable path to enable local playback.".to_string()
    } else {
        "Local playback bridge is installed. Configure the torrent engine and MPV paths to enable playback.".to_string()
    };

    RuntimeStatus {
        ready,
        torrent_engine_configured,
        player_configured,
        torrent_engine_path,
        player_path,
        cache_dir,
        message,
    }
}

#[tauri::command]
fn play_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
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
        });
    }

    let Some(engine_path) = runtime.torrent_engine_path.clone() else {
        return Err("Torrent engine path is missing.".to_string());
    };
    let Some(player_path) = runtime.player_path.clone() else {
        return Err("MPV path is missing.".to_string());
    };

    fs::create_dir_all(&runtime.cache_dir)
        .map_err(|error| format!("Could not create local cache folder: {}", error))?;

    start_rqbit_server(&engine_path, &runtime.cache_dir)?;

    let add_path = format!(
        "/torrents?output_folder={}",
        percent_encode(&runtime.cache_dir)
    );
    let add_response = local_http_request("POST", &add_path, Some(&request.magnet))?;
    let add_json: serde_json::Value = serde_json::from_str(&add_response)
        .map_err(|error| format!("Could not parse rqbit add response: {}", error))?;
    let torrent_id = add_json
        .get("id")
        .and_then(|id| {
            id.as_u64()
                .map(|value| value.to_string())
                .or_else(|| id.as_str().map(|value| value.to_string()))
        })
        .ok_or_else(|| "rqbit did not return a playable torrent id yet.".to_string())?;
    let playlist_url = format!("http://127.0.0.1:3030/torrents/{}/playlist", torrent_id);

    Command::new(&player_path)
        .arg(&playlist_url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start MPV: {}", error))?;

    Ok(PlaybackStatus {
        ok: true,
        state: "started".to_string(),
        message:
            "Local rqbit stream started. MPV should open once torrent metadata and pieces are ready."
                .to_string(),
        title: label,
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_desktop_runtime_status,
            play_local_torrent
        ])
        .run(tauri::generate_context!())
        .expect("failed to start StreamNyaa desktop app");
}
