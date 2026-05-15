use serde::Serialize;

#[derive(Serialize)]
struct PlaybackStatus {
  ok: bool,
  message: String,
}

#[tauri::command]
fn play_local_torrent(
  magnet: String,
  title: String,
  anime_title: String,
  episode: String,
) -> Result<PlaybackStatus, String> {
  if magnet.trim().is_empty() {
    return Err("No source link was provided.".to_string());
  }

  let label = if anime_title.trim().is_empty() {
    title
  } else if episode.trim().is_empty() {
    format!("{} - {}", anime_title, title)
  } else {
    format!("{} - Episode {}", anime_title, episode)
  };

  Err(format!(
    "Local playback bridge received \"{}\", but the torrent engine and MPV sidecar are not bundled yet.",
    label
  ))
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![play_local_torrent])
    .run(tauri::generate_context!())
    .expect("failed to start StreamNyaa desktop app");
}
