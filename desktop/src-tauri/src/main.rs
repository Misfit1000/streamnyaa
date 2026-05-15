use serde::{Deserialize, Serialize};
use std::{
  env,
  fs,
  path::{Path, PathBuf},
  process::{Command, Stdio},
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

fn configured_value(settings_value: Option<String>, env_key: &str, fallback: &str) -> Option<String> {
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

fn resolved_cache_dir(settings: Option<String>) -> String {
  clean_value(settings)
    .or_else(|| clean_value(env::var("STREAMNYAA_CACHE_DIR").ok()))
    .unwrap_or_else(|| {
      let mut path = env::temp_dir();
      path.push("streamnyaa-desktop");
      path.to_string_lossy().to_string()
    })
}

fn with_mpv_path(mut command: Command, mpv_path: &Option<String>) -> Command {
  let Some(path_value) = mpv_path else {
    return command;
  };
  if !looks_like_path(path_value) {
    return command;
  }

  let path = PathBuf::from(path_value);
  let Some(parent) = path.parent() else {
    return command;
  };

  let current_path = env::var_os("PATH").unwrap_or_default();
  let mut paths = env::split_paths(&current_path).collect::<Vec<_>>();
  paths.insert(0, parent.to_path_buf());
  if let Ok(joined) = env::join_paths(paths) {
    command.env("PATH", joined);
  }

  command
}

#[tauri::command]
fn get_desktop_runtime_status(settings: Option<DesktopSettings>) -> RuntimeStatus {
  let settings = settings.unwrap_or(DesktopSettings {
    torrent_engine_path: None,
    mpv_path: None,
    cache_dir: None,
    player_mode: None,
  });
  let player_mode = settings.player_mode.clone().unwrap_or_else(|| "mpv".to_string());
  let torrent_engine_path = configured_value(settings.torrent_engine_path, "STREAMNYAA_TORRENT_ENGINE_PATH", "webtorrent");
  let player_path = if player_mode == "mpv" {
    configured_value(settings.mpv_path, "STREAMNYAA_MPV_PATH", "mpv")
  } else {
    None
  };
  let cache_dir = resolved_cache_dir(settings.cache_dir);
  let torrent_engine_configured = command_configured(&torrent_engine_path, &["webtorrent", "webtorrent.cmd", "webtorrent.exe"]);
  let player_configured = player_mode != "mpv" || command_configured(&player_path, &["mpv", "mpv.exe"]);
  let ready = torrent_engine_configured && player_configured;
  let message = if ready {
    "Local torrent engine and player command are configured.".to_string()
  } else if !torrent_engine_configured {
    "Set the WebTorrent CLI command or full executable path to enable local playback.".to_string()
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
  if !request.magnet.trim_start().starts_with("magnet:?xt=urn:btih:") {
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

  fs::create_dir_all(&runtime.cache_dir)
    .map_err(|error| format!("Could not create local cache folder: {}", error))?;

  let mut command = Command::new(&engine_path);
  command
    .arg(&request.magnet)
    .arg("--out")
    .arg(&runtime.cache_dir)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

  if runtime.player_path.is_some() {
    command.arg("--mpv");
    command = with_mpv_path(command, &runtime.player_path);
  }

  command
    .spawn()
    .map_err(|error| format!("Could not start local torrent player: {}", error))?;

  Ok(PlaybackStatus {
    ok: true,
    state: "started".to_string(),
    message: "Local playback started. MPV should open once the source is ready.".to_string(),
    title: label,
  })
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_desktop_runtime_status, play_local_torrent])
    .run(tauri::generate_context!())
    .expect("failed to start StreamNyaa desktop app");
}
