use serde::{Deserialize, Serialize};
use std::{env, path::Path};

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
  message: String,
}

#[derive(Deserialize)]
struct PlaybackRequest {
  magnet: String,
  title: String,
  anime_title: String,
  episode: String,
}

fn configured_path(env_key: &str) -> Option<String> {
  let value = env::var(env_key).ok()?.trim().to_string();
  if value.is_empty() {
    return None;
  }
  Some(value)
}

fn path_exists(path_value: &Option<String>) -> bool {
  path_value
    .as_ref()
    .map(|value| Path::new(value).exists())
    .unwrap_or(false)
}

#[tauri::command]
fn get_desktop_runtime_status() -> RuntimeStatus {
  let torrent_engine_path = configured_path("STREAMNYAA_TORRENT_ENGINE_PATH");
  let player_path = configured_path("STREAMNYAA_MPV_PATH");
  let torrent_engine_configured = path_exists(&torrent_engine_path);
  let player_configured = path_exists(&player_path);
  let ready = torrent_engine_configured && player_configured;
  let message = if ready {
    "Local torrent engine and MPV player paths are configured.".to_string()
  } else {
    "Local playback bridge is installed. Configure the torrent engine and MPV paths to enable playback.".to_string()
  };

  RuntimeStatus {
    ready,
    torrent_engine_configured,
    player_configured,
    torrent_engine_path,
    player_path,
    message,
  }
}

#[tauri::command]
fn play_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
  if request.magnet.trim().is_empty() {
    return Err("No source link was provided.".to_string());
  }

  let label = if request.anime_title.trim().is_empty() {
    request.title
  } else if request.episode.trim().is_empty() {
    format!("{} - {}", request.anime_title, request.title)
  } else {
    format!("{} - Episode {}", request.anime_title, request.episode)
  };

  let runtime = get_desktop_runtime_status();
  if !runtime.ready {
    return Ok(PlaybackStatus {
      ok: false,
      state: "needs_setup".to_string(),
      message: runtime.message,
      title: label,
    });
  }

  Ok(PlaybackStatus {
    ok: false,
    state: "engine_not_started".to_string(),
    message: "Runtime paths are configured. The next desktop step is wiring the engine process to produce a local stream path for MPV.".to_string(),
    title: label,
  })
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_desktop_runtime_status, play_local_torrent])
    .run(tauri::generate_context!())
    .expect("failed to start StreamNyaa desktop app");
}
