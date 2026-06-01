#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::Manager;

const RQBIT_URL: &str = "http://127.0.0.1:3030";
const PER_SESSION_CACHE_MAX_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const GLOBAL_CACHE_MAX_BYTES: u64 = 6 * 1024 * 1024 * 1024;
const LOW_SPACE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MIN_PLAYBACK_FREE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const ABSOLUTE_STREAM_SOURCE_MAX_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const INITIAL_PLAYBACK_BUFFER_BYTES: u64 = 24 * 1024 * 1024;
const MIN_INITIAL_PLAYBACK_BUFFER_BYTES: u64 = 6 * 1024 * 1024;
const STREAM_READY_TIMEOUT_MS: u128 = 20_000;
const STREAM_SESSION_HARD_STOP_BYTES: u64 = PER_SESSION_CACHE_MAX_BYTES;
const PLAYER_PIPE_PREFIX: &str = "streamnyaa-player";
const SOURCE_API_CACHE_TTL_MS: u128 = 1000 * 60 * 3;
const SOURCE_API_CACHE_MAX_ENTRIES: usize = 24;
const METADATA_CACHE_MAX_ENTRIES: usize = 64;
const LOG_FILE_LIMIT_BYTES: u64 = 512 * 1024;
const LOG_FILE_KEEP_COUNT: usize = 5;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
struct PlaybackStatus {
    ok: bool,
    state: String,
    message: String,
    title: String,
    torrent_id: Option<String>,
    playlist_url: Option<String>,
    media_url: Option<String>,
}

#[derive(Serialize)]
struct LocalPlaybackProgress {
    ok: bool,
    torrent_id: String,
    state: String,
    message: String,
    progress: Option<f64>,
    current_seconds: Option<f64>,
    duration_seconds: Option<f64>,
    downloaded_bytes: Option<u64>,
    total_bytes: Option<u64>,
    peers: Option<u64>,
    download_speed: Option<f64>,
    playlist_url: String,
    media_url: Option<String>,
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

#[derive(Deserialize)]
struct MetadataApiRequest {
    provider: String,
    path: Option<String>,
    body: Option<serde_json::Value>,
    ttl_seconds: Option<u64>,
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
    logs_dir: String,
    active_session: Option<ActiveSessionStatus>,
}

#[derive(Serialize)]
struct ActiveSessionStatus {
    torrent_id: String,
    session_dir: String,
    cache_bytes: u64,
    media_url: Option<String>,
}

#[derive(Clone, Deserialize)]
struct DesktopSettings {
    torrent_engine_path: Option<String>,
    player_path: Option<String>,
    mpv_path: Option<String>,
    cache_dir: Option<String>,
}

#[derive(Deserialize)]
struct PlaybackRequest {
    magnet: String,
    torrent_url: Option<String>,
    info_hash: Option<String>,
    title: String,
    anime_title: String,
    episode: String,
    size: Option<String>,
    poster: Option<String>,
    banner: Option<String>,
    resume_seconds: Option<f64>,
    settings: Option<DesktopSettings>,
}

#[derive(Deserialize)]
struct PlaybackProgressRequest {
    torrent_id: String,
}

#[derive(Clone)]
struct ActiveSession {
    torrent_id: String,
    session_dir: PathBuf,
    engine_path: String,
    media_url: String,
}

#[derive(Clone)]
struct ResolvedStreamTarget {
    media_url: String,
    subtitle_urls: Vec<String>,
}

#[derive(Clone)]
struct PlaylistEntry {
    url: String,
    label: String,
    file_name: String,
    file_stem: String,
    kind: PlaylistKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlaylistKind {
    Video,
    Subtitle,
    Other,
}

#[derive(Default)]
struct PlaybackManager {
    active: Option<ActiveSession>,
    player: Option<Child>,
    player_ipc: Option<String>,
    recent_errors: Vec<String>,
}

#[derive(Clone)]
struct SourceCacheEntry {
    data: serde_json::Value,
    fetched_at: u128,
}

static MANAGER: OnceLock<Mutex<PlaybackManager>> = OnceLock::new();
static PLAYBACK_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static SOURCE_CACHE: OnceLock<Mutex<HashMap<String, SourceCacheEntry>>> = OnceLock::new();
static METADATA_CACHE: OnceLock<Mutex<HashMap<String, SourceCacheEntry>>> = OnceLock::new();

fn manager() -> &'static Mutex<PlaybackManager> {
    MANAGER.get_or_init(|| Mutex::new(PlaybackManager::default()))
}

fn source_cache() -> &'static Mutex<HashMap<String, SourceCacheEntry>> {
    SOURCE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn playback_operation_lock() -> &'static Mutex<()> {
    PLAYBACK_OPERATION_LOCK.get_or_init(|| Mutex::new(()))
}

fn metadata_cache() -> &'static Mutex<HashMap<String, SourceCacheEntry>> {
    METADATA_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn clean_value(value: Option<String>) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value)
}

fn command_name(value: &str) -> String {
    Path::new(value)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(value)
        .to_ascii_lowercase()
}

fn prepared_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn looks_like_path(value: &str) -> bool {
    value.contains('/') || value.contains('\\')
}

fn command_from_path(command: &str) -> Option<String> {
    let mut names = vec![command.to_string()];
    if !command.to_ascii_lowercase().ends_with(".exe") {
        names.push(format!("{}.exe", command));
    }

    for name in names {
        let output = prepared_command("where.exe")
            .arg(&name)
            .stdin(Stdio::null())
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }

        if let Some(path) = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && Path::new(line).exists())
            .map(str::to_string)
        {
            return Some(path);
        }
    }

    None
}

fn push_env_candidate(paths: &mut Vec<String>, base: Option<String>, suffix: &str) {
    if let Some(base) = clean_value(base) {
        paths.push(format!(
            r"{}\{}",
            base.trim_end_matches(['\\', '/']),
            suffix
        ));
    }
}

fn candidate_paths(command: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let manifest_bin = Path::new(env!("CARGO_MANIFEST_DIR")).join("bin");

    if command.eq_ignore_ascii_case("mpv") {
        paths.push(manifest_bin.join("mpv.exe").to_string_lossy().to_string());
        if let Ok(exe) = env::current_exe() {
            if let Some(dir) = exe.parent() {
                paths.push(dir.join("bin").join("mpv.exe").to_string_lossy().to_string());
                paths.push(dir.join("resources").join("bin").join("mpv.exe").to_string_lossy().to_string());
            }
        }
        push_env_candidate(&mut paths, env::var("ProgramW6432").ok(), r"MPV Player\mpv.exe");
        push_env_candidate(&mut paths, env::var("ProgramFiles").ok(), r"MPV Player\mpv.exe");
        push_env_candidate(&mut paths, env::var("ProgramFiles").ok(), r"mpv\mpv.exe");
        push_env_candidate(&mut paths, env::var("ProgramFiles(x86)").ok(), r"MPV Player\mpv.exe");
        push_env_candidate(&mut paths, env::var("LOCALAPPDATA").ok(), r"Microsoft\WinGet\Links\mpv.exe");
    }

    if command.eq_ignore_ascii_case("rqbit") {
        paths.push(manifest_bin.join("rqbit.exe").to_string_lossy().to_string());
        if let Ok(exe) = env::current_exe() {
            if let Some(dir) = exe.parent() {
                paths.push(dir.join("bin").join("rqbit.exe").to_string_lossy().to_string());
                paths.push(dir.join("resources").join("bin").join("rqbit.exe").to_string_lossy().to_string());
            }
        }
        push_env_candidate(&mut paths, env::var("LOCALAPPDATA").ok(), r"Microsoft\WinGet\Links\rqbit.exe");
    }

    paths
}

fn configured_command(
    settings_value: Option<String>,
    env_key: &str,
    fallback: &str,
    allowed_names: &[&str],
) -> Option<String> {
    if let Some(value) = clean_value(settings_value) {
        if looks_like_path(&value) {
            if Path::new(&value).exists() {
                return Some(value);
            }
        } else if allowed_command(&value, allowed_names) {
            if let Some(path) = command_from_path(&value) {
                return Some(path);
            }
        }
    }

    if let Some(value) = clean_value(env::var(env_key).ok()) {
        return Some(value);
    }

    for path in candidate_paths(fallback) {
        if Path::new(&path).exists() {
            return Some(path);
        }
    }

    command_from_path(fallback).or_else(|| Some(fallback.to_string()))
}

fn allowed_command(value: &str, allowed_names: &[&str]) -> bool {
    let name = command_name(value);
    allowed_names.iter().any(|allowed| name == *allowed)
}

fn command_version(path_value: &Option<String>, allowed_names: &[&str]) -> Option<String> {
    let value = path_value.as_ref()?;
    if !allowed_command(value, allowed_names) {
        return None;
    }
    if looks_like_path(value) && !Path::new(value).exists() {
        return None;
    }
    let output = prepared_command(value)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
}

fn command_configured(path_value: &Option<String>, allowed_names: &[&str]) -> bool {
    command_version(path_value, allowed_names).is_some()
}

fn cache_root() -> PathBuf {
    let mut path = env::temp_dir();
    path.push("StreamNyaa");
    path
}

fn logs_root() -> PathBuf {
    if let Ok(local) = env::var("LOCALAPPDATA") {
        return PathBuf::from(local).join("StreamNyaa").join("logs");
    }
    cache_root().join("logs")
}

fn rotate_logs(log_file: &Path) {
    let Ok(meta) = fs::metadata(log_file) else {
        return;
    };
    if meta.len() < LOG_FILE_LIMIT_BYTES {
        return;
    }

    for index in (1..LOG_FILE_KEEP_COUNT).rev() {
        let older = log_file.with_extension(format!("{}.log", index));
        let newer = log_file.with_extension(format!("{}.log", index + 1));
        if newer.exists() {
            let _ = fs::remove_file(&newer);
        }
        if older.exists() {
            let _ = fs::rename(&older, &newer);
        }
    }

    let first_archive = log_file.with_extension("1.log");
    if first_archive.exists() {
        let _ = fs::remove_file(&first_archive);
    }
    let _ = fs::rename(log_file, first_archive);
}

fn append_log_line(level: &str, message: &str) {
    let logs_dir = logs_root();
    let _ = fs::create_dir_all(&logs_dir);
    let log_file = logs_dir.join("desktop.log");
    rotate_logs(&log_file);
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let _ = writeln!(file, "[{}] [{}] {}", unix_timestamp(), level, message.trim());
    }
}

fn log_info(message: impl AsRef<str>) {
    append_log_line("INFO", message.as_ref());
}

fn log_error(message: impl AsRef<str>) {
    append_log_line("ERROR", message.as_ref());
}

fn resolved_cache_dir(settings_value: Option<String>) -> PathBuf {
    clean_value(settings_value)
        .map(PathBuf::from)
        .filter(|path| is_temp_cache_path(path))
        .unwrap_or_else(cache_root)
}

fn old_appdata_cache_roots() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(local) = env::var("LOCALAPPDATA") {
        let local = PathBuf::from(local);
        paths.push(local.join("StreamNyaa").join("Cache"));
        paths.push(local.join("streamnyaa-desktop"));
        paths.push(local.join("StreamNyaaDesktop").join("Cache"));
        paths.push(local.join("StreamNyaa Desktop").join("Cache"));
    }
    paths
}

fn is_temp_cache_path(path: &Path) -> bool {
    let full = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    full.starts_with(env::temp_dir().canonicalize().unwrap_or_else(|_| env::temp_dir()))
}

fn is_safe_cache_path(path: &Path) -> bool {
    let full = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let allowed = [
        env::var("LOCALAPPDATA").ok().map(PathBuf::from),
        env::var("APPDATA").ok().map(PathBuf::from),
        Some(env::temp_dir()),
    ];

    allowed
        .into_iter()
        .flatten()
        .any(|root| full.starts_with(root.canonicalize().unwrap_or(root)))
}

fn legacy_cache_dirs(active_root: &Path) -> Vec<PathBuf> {
    let mut paths = vec![
        env::temp_dir().join("streamnyaa-desktop"),
        env::temp_dir().join("StreamNyaa"),
    ];
    paths.extend(old_appdata_cache_roots());
    paths
        .into_iter()
        .filter(|path| path != active_root)
        .collect::<Vec<_>>()
}

fn session_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join(format!("session-{}", now_millis()))
}

fn file_modified_ms(path: &Path) -> u128 {
    path.metadata()
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }

    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}

fn cache_entries(cache_dir: &Path) -> Vec<CacheEntry> {
    let mut entries = Vec::new();
    if !cache_dir.exists() {
        return entries;
    }
    if let Ok(items) = fs::read_dir(cache_dir) {
        for item in items.flatten() {
            let path = item.path();
            let size = if path.is_dir() {
                dir_size(&path)
            } else {
                item.metadata().map(|meta| meta.len()).unwrap_or(0)
            };
            entries.push(CacheEntry {
                name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("cache item")
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: size,
                modified_ms: file_modified_ms(&path),
            });
        }
    }
    entries.sort_by(|a, b| a.modified_ms.cmp(&b.modified_ms));
    entries
}

fn available_disk_bytes(path: &Path) -> Option<u64> {
    #[cfg(windows)]
    {
        let root = path
            .to_string_lossy()
            .chars()
            .next()
            .map(|drive| format!("{}:", drive))?;
        let output = prepared_command("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(format!(
                "(Get-PSDrive -Name '{}').Free",
                root.trim_end_matches(':')
            ))
            .stdin(Stdio::null())
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout).trim().parse().ok()
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("df")
            .arg("-Pk")
            .arg(path)
            .stdin(Stdio::null())
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .nth(1)
            .and_then(|line| line.split_whitespace().nth(3))
            .and_then(|value| value.parse::<u64>().ok())
            .map(|kb| kb.saturating_mul(1024))
    }
}

fn pressure_for(free_bytes: Option<u64>) -> String {
    match free_bytes {
        Some(value) if value < LOW_SPACE_BYTES => "low".to_string(),
        Some(_) => "normal".to_string(),
        None => "unknown".to_string(),
    }
}

fn collect_cache_status(cache_dir: &Path) -> CacheStatus {
    let mut entries = cache_entries(cache_dir);
    let total_bytes = entries.iter().fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));
    let file_count = entries.len() as u64;
    let free_bytes = available_disk_bytes(cache_dir);
    entries.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    entries.truncate(12);
    CacheStatus {
        cache_dir: cache_dir.to_string_lossy().to_string(),
        total_bytes,
        file_count,
        max_bytes: GLOBAL_CACHE_MAX_BYTES,
        free_bytes,
        pressure: pressure_for(free_bytes),
        entries,
    }
}

fn safe_delete_dir(path: &Path) {
    if !path.exists() || !is_safe_cache_path(path) {
        return;
    }
    for _ in 0..8 {
        if !path.exists() {
            return;
        }
        if fs::remove_dir_all(path).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(220));
    }
}

fn safe_delete_file(path: &Path) {
    if !path.exists() || !is_safe_cache_path(path) {
        return;
    }
    for _ in 0..8 {
        if !path.exists() {
            return;
        }
        if fs::remove_file(path).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(180));
    }
}

fn remember_error(message: impl Into<String>) {
    let message = message.into();
    if let Ok(mut guard) = manager().lock() {
        guard.recent_errors.insert(0, message.clone());
        guard.recent_errors.truncate(20);
    }
    log_error(&message);
}

fn trim_memory_cache(cache: &mut HashMap<String, SourceCacheEntry>, ttl_ms: u128, max_entries: usize) {
    let now = now_millis();
    cache.retain(|_, entry| now.saturating_sub(entry.fetched_at) <= ttl_ms);
    if cache.len() <= max_entries {
        return;
    }

    let mut entries = cache
        .iter()
        .map(|(key, entry)| (key.clone(), entry.fetched_at))
        .collect::<Vec<_>>();
    entries.sort_by_key(|(_, fetched_at)| *fetched_at);

    let overflow = entries.len().saturating_sub(max_entries);
    for (key, _) in entries.into_iter().take(overflow) {
        cache.remove(&key);
    }
}

fn clear_memory_caches() {
    if let Ok(mut cache) = source_cache().lock() {
        cache.clear();
    }
    if let Ok(mut cache) = metadata_cache().lock() {
        cache.clear();
    }
}

fn active_session_snapshot() -> Option<ActiveSessionStatus> {
    manager()
        .lock()
        .ok()
        .and_then(|guard| guard.active.clone())
        .map(|active| ActiveSessionStatus {
            torrent_id: active.torrent_id,
            session_dir: active.session_dir.to_string_lossy().to_string(),
            cache_bytes: dir_size(&active.session_dir),
            media_url: (!active.media_url.trim().is_empty()).then_some(active.media_url),
        })
}

fn cleanup_abandoned_sessions(cache_dir: &Path, keep: Option<&Path>) {
    let _ = fs::create_dir_all(cache_dir);
    for legacy in legacy_cache_dirs(cache_dir) {
        safe_delete_dir(&legacy);
    }
    let Ok(entries) = fs::read_dir(cache_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if keep.map(|keep| keep == path).unwrap_or(false) {
            continue;
        }
        if path.is_dir() {
            safe_delete_dir(&path);
        } else if path.is_file() {
            safe_delete_file(&path);
        }
    }
}

fn prune_cache(cache_dir: &Path, active: Option<&Path>) {
    let _ = fs::create_dir_all(cache_dir);
    let entries = cache_entries(cache_dir);
    let mut total = entries.iter().fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));

    for entry in entries.clone() {
        if total <= GLOBAL_CACHE_MAX_BYTES {
            break;
        }
        let path = PathBuf::from(&entry.path);
        if active.map(|active| active == path).unwrap_or(false) {
            continue;
        }
        safe_delete_dir(&path);
        total = total.saturating_sub(entry.size_bytes);
    }

    if let Some(active) = active {
        let active_size = dir_size(active);
        if active_size > PER_SESSION_CACHE_MAX_BYTES.saturating_mul(2) {
            let mut files = collect_files(active);
            files.sort_by(|a, b| a.1.cmp(&b.1));
            let mut session_total = active_size;
            for (file, _, size) in files {
                if session_total <= PER_SESSION_CACHE_MAX_BYTES {
                    break;
                }
                let _ = fs::remove_file(&file);
                session_total = session_total.saturating_sub(size);
            }
        }
    }
}

fn collect_files(root: &Path) -> Vec<(PathBuf, u128, u64)> {
    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() {
                files.push((path.clone(), file_modified_ms(&path), meta.len()));
            }
        }
    }
    files
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

fn rqbit_get(path: &str) -> Result<String, String> {
    let url = format!("{}{}", RQBIT_URL, path);
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|error| format!("Could not prepare local stream request: {}", error))?
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Local stream request failed: {}", error))?
        .text()
        .map_err(|error| format!("Could not read local stream response: {}", error))
}

fn rqbit_post(path: &str, body: &str) -> Result<String, String> {
    let url = format!("{}{}", RQBIT_URL, path);
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Could not prepare local stream request: {}", error))?
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(body.to_string())
        .send()
        .map_err(|error| format!("Could not add source to local stream engine: {}", error))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Could not read local stream response: {}", error))?;
    if !status.is_success() {
        let detail = friendly_rqbit_error(&text);
        return Err(if detail.is_empty() {
            format!(
                "Could not add source to local stream engine: HTTP {}",
                status
            )
        } else {
            format!(
                "Could not add source to local stream engine: HTTP {}. {}",
                status, detail
            )
        });
    }
    Ok(text)
}

fn rqbit_delete(path: &str) -> Result<(), String> {
    let url = format!("{}{}", RQBIT_URL, path);
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not prepare local stream request: {}", error))?
        .delete(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map(|_| ())
        .map_err(|error| format!("Could not stop local stream: {}", error))
}

fn rqbit_ready() -> bool {
    rqbit_get("/").is_ok()
}

fn start_rqbit(engine_path: &str, cache_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not prepare StreamNyaa cache: {}", error))?;
    if rqbit_ready() {
        return Ok(());
    }
    log_info(format!("Starting local stream engine from {}", engine_path));
    prepared_command(engine_path)
        .arg("server")
        .arg("start")
        .arg("--disable-persistence")
        .arg("--persistence-location")
        .arg(cache_dir)
        .arg(cache_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start local stream engine: {}", error))?;

    for _ in 0..50 {
        if rqbit_ready() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    Err("Local stream engine did not become ready in time.".to_string())
}

fn stop_rqbit_server(engine_path: Option<&str>) {
    let Some(engine_path) = engine_path else {
        return;
    };
    let _ = prepared_command(engine_path)
        .arg("server")
        .arg("stop")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output();

    #[cfg(windows)]
    {
        let _ = prepared_command("taskkill")
            .args(["/F", "/T", "/IM", "rqbit.exe"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn trim_for_display(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, ch) in value.trim().chars().enumerate() {
        if index >= max_chars {
            output.push_str("...");
            break;
        }
        output.push(ch);
    }
    output
}

fn html_entity_decode(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn strip_cdata(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed
        .strip_prefix("<![CDATA[")
        .and_then(|inner| inner.strip_suffix("]]>"))
        .unwrap_or(trimmed)
        .trim()
}

fn xml_tag_value(block: &str, tag: &str) -> String {
    let open_prefix = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let Some(open_start) = block.find(&open_prefix) else {
        return String::new();
    };
    let after_open = &block[open_start..];
    let Some(open_end) = after_open.find('>') else {
        return String::new();
    };
    let content_start = open_start + open_end + 1;
    let Some(close_start) = block[content_start..].find(&close).map(|index| content_start + index) else {
        return String::new();
    };
    html_entity_decode(strip_cdata(&block[content_start..close_start]))
}

fn percent_decode_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = &value[index + 1..index + 3];
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    decoded.push(byte);
                    index += 3;
                } else {
                    decoded.push(bytes[index]);
                    index += 1;
                }
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode_component(name) == key {
            return Some(percent_decode_component(value));
        }
    }
    None
}

fn normalize_source_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut last_space = true;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            output.push(ch.to_ascii_lowercase());
            last_space = false;
        } else if !last_space {
            output.push(' ');
            last_space = true;
        }
    }
    output.trim().to_string()
}

fn meaningful_source_tokens(value: &str) -> Vec<String> {
    const IGNORE: &[&str] = &[
        "anime", "episode", "episodes", "season", "movie", "ova", "ona", "special", "batch",
        "complete", "pack", "1080p", "720p", "480p", "2160p", "4k", "x264", "x265",
        "h264", "h265", "hevc", "aac", "flac", "web", "webrip", "webdl", "dl",
        "sub", "subs", "dub", "dubbed", "dual", "multi", "audio", "english", "eng",
    ];
    normalize_source_text(value)
        .split_whitespace()
        .filter(|token| !IGNORE.contains(token))
        .filter(|token| token.len() > 1 || token.chars().all(|ch| ch.is_ascii_digit()))
        .map(str::to_string)
        .collect()
}

fn parse_episode_from_query(query: &str) -> Option<u64> {
    let normalized = normalize_source_text(query);
    for token in normalized.split_whitespace().rev() {
        let numeric: String = token.chars().filter(|ch| ch.is_ascii_digit()).collect();
        if numeric.is_empty() || numeric.len() > 4 {
            continue;
        }
        let Ok(number) = numeric.parse::<u64>() else {
            continue;
        };
        if [480, 720, 1080, 2160].contains(&number) || (1900..=2099).contains(&number) {
            continue;
        }
        if number > 0 && number < 3000 {
            return Some(number);
        }
    }
    None
}

fn source_title_matches_episode(title: &str, episode: u64) -> bool {
    let normalized = normalize_source_text(title);
    let ep = episode.to_string();
    let ep2 = format!("{:02}", episode);
    let ep3 = format!("{:03}", episode);
    normalized
        .split_whitespace()
        .any(|token| token == ep || token == ep2 || token == ep3 || token.ends_with(&format!("e{}", ep2)))
}

fn source_title_match_ratio(title: &str, tokens: &[String]) -> f64 {
    if tokens.is_empty() {
        return 1.0;
    }
    let normalized_title = normalize_source_text(title);
    let matched = tokens
        .iter()
        .filter(|token| normalized_title.split_whitespace().any(|part| part == token.as_str()) || normalized_title.contains(token.as_str()))
        .count();
    matched as f64 / tokens.len() as f64
}

fn direct_source_score(title: &str, seeders: u64, downloads: u64, trusted: &str, tokens: &[String], episode: Option<u64>) -> u64 {
    let mut score = (source_title_match_ratio(title, tokens) * 30.0).round() as u64;
    score += (((seeders + 1) as f64).log10() * 12.0).round().min(30.0) as u64;
    score += (((downloads + 1) as f64).log10() * 3.0).round().min(8.0) as u64;
    let lower = title.to_ascii_lowercase();
    if trusted.eq_ignore_ascii_case("yes") || trusted.eq_ignore_ascii_case("true") || trusted == "1" {
        score += 12;
    }
    if lower.contains("1080p") {
        score += 8;
    } else if lower.contains("720p") {
        score += 5;
    }
    if lower.contains("hevc") || lower.contains("x265") || lower.contains("h265") {
        score += 6;
    }
    if lower.contains("dual") || lower.contains("multi") || lower.contains("dub") {
        score += 3;
    }
    if episode.is_some_and(|number| source_title_matches_episode(title, number)) {
        score += 16;
    }
    score.min(100)
}

fn nyaa_rss_url(query: &str, category: &str, filter: &str, page: u64) -> String {
    let mut url = format!(
        "https://nyaa.si/?page=rss&q={}&c={}&f={}",
        percent_encode(query),
        percent_encode(category),
        percent_encode(filter)
    );
    if page > 1 {
        url.push_str("&p=");
        url.push_str(&page.to_string());
    }
    url
}

fn nyaa_query_variants(query: &str, episode: Option<u64>) -> Vec<String> {
    let title_tokens = meaningful_source_tokens(query);
    let title_only = title_tokens.join(" ");
    let mut variants = vec![query.trim().to_string(), normalize_source_text(query)];
    if let Some(number) = episode {
        if !title_only.is_empty() {
            variants.push(format!("{} {:02}", title_only, number));
            variants.push(format!("{} {}", title_only, number));
        }
    } else if !title_only.is_empty() {
        variants.push(title_only);
    }
    variants.sort();
    variants.dedup();
    variants
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .take(5)
        .collect()
}

fn parse_nyaa_rss_items(
    xml: &str,
    matched_query: &str,
    category: &str,
    page: u64,
    query_count: usize,
) -> Vec<serde_json::Value> {
    let tokens = meaningful_source_tokens(matched_query);
    let episode = parse_episode_from_query(matched_query);
    let mut output = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<item") {
        let after_start = &rest[start..];
        let Some(open_end) = after_start.find('>') else {
            break;
        };
        let content_start = start + open_end + 1;
        let Some(close_rel) = rest[content_start..].find("</item>") else {
            break;
        };
        let close = content_start + close_rel;
        let block = &rest[content_start..close];
        let title = xml_tag_value(block, "title");
        if title.trim().is_empty() {
            rest = &rest[close + "</item>".len()..];
            continue;
        }

        let ratio = source_title_match_ratio(&title, &tokens);
        if !tokens.is_empty() && ratio < 0.45 {
            rest = &rest[close + "</item>".len()..];
            continue;
        }
        if let Some(number) = episode {
            if looks_like_batch_source(&title) || !source_title_matches_episode(&title, number) {
                rest = &rest[close + "</item>".len()..];
                continue;
            }
        }

        let seeders = xml_tag_value(block, "nyaa:seeders");
        let downloads = xml_tag_value(block, "nyaa:downloads");
        let trusted = xml_tag_value(block, "nyaa:trusted");
        let seeders_number = seeders.parse::<u64>().unwrap_or(0);
        let downloads_number = downloads.parse::<u64>().unwrap_or(0);
        let source_score = direct_source_score(
            &title,
            seeders_number,
            downloads_number,
            &trusted,
            &tokens,
            episode,
        );

        output.push(serde_json::json!({
            "title": title,
            "link": xml_tag_value(block, "link"),
            "guid": xml_tag_value(block, "guid"),
            "pubDate": xml_tag_value(block, "pubDate"),
            "seeders": seeders,
            "leechers": xml_tag_value(block, "nyaa:leechers"),
            "downloads": downloads,
            "infoHash": xml_tag_value(block, "nyaa:infoHash"),
            "categoryId": xml_tag_value(block, "nyaa:categoryId"),
            "category": xml_tag_value(block, "nyaa:category"),
            "size": xml_tag_value(block, "nyaa:size"),
            "comments": xml_tag_value(block, "nyaa:comments"),
            "trusted": trusted,
            "remake": xml_tag_value(block, "nyaa:remake"),
            "matchedQuery": matched_query,
            "matchedCategory": category,
            "matchedPage": page,
            "sourceScore": source_score,
            "matchScore": (ratio * 100.0).round() as u64,
            "sourceQueryCount": query_count,
        }));
        rest = &rest[close + "</item>".len()..];
    }
    output
}

fn dedupe_source_json(items: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    let mut map = HashMap::<String, serde_json::Value>::new();
    for item in items {
        let hash = item.get("infoHash").and_then(|value| value.as_str()).unwrap_or("");
        let link = item.get("link").and_then(|value| value.as_str()).unwrap_or("");
        let title = item.get("title").and_then(|value| value.as_str()).unwrap_or("");
        let key = if !hash.is_empty() {
            format!("hash:{}", hash.to_ascii_lowercase())
        } else if !link.is_empty() {
            format!("link:{}", link.to_ascii_lowercase())
        } else {
            format!("title:{}", normalize_source_text(title))
        };
        let score = item.get("sourceScore").and_then(|value| value.as_u64()).unwrap_or(0);
        let seeders = item
            .get("seeders")
            .and_then(|value| value.as_str())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let replace = map
            .get(&key)
            .map(|existing| {
                let existing_score = existing
                    .get("sourceScore")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let existing_seeders = existing
                    .get("seeders")
                    .and_then(|value| value.as_str())
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(0);
                score > existing_score || (score == existing_score && seeders > existing_seeders)
            })
            .unwrap_or(true);
        if replace {
            map.insert(key, item);
        }
    }
    let mut values: Vec<_> = map.into_values().collect();
    values.sort_by(|a, b| {
        let a_score = a.get("sourceScore").and_then(|value| value.as_u64()).unwrap_or(0);
        let b_score = b.get("sourceScore").and_then(|value| value.as_u64()).unwrap_or(0);
        let a_seeders = a
            .get("seeders")
            .and_then(|value| value.as_str())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        let b_seeders = b
            .get("seeders")
            .and_then(|value| value.as_str())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0);
        b_score.cmp(&a_score).then_with(|| b_seeders.cmp(&a_seeders))
    });
    values
}

fn fetch_nyaa_direct_from_api_url(trimmed_url: &str) -> Result<serde_json::Value, String> {
    let query = query_param(trimmed_url, "q").unwrap_or_default();
    let category = query_param(trimmed_url, "c").unwrap_or_else(|| "1_2".to_string());
    let filter = query_param(trimmed_url, "f").unwrap_or_else(|| "0".to_string());
    let page = query_param(trimmed_url, "p")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1)
        .max(1);
    let pages = query_param(trimmed_url, "pages")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1)
        .clamp(1, 3);
    let deep = query_param(trimmed_url, "deep").map(|value| value != "0").unwrap_or(false);
    let wide = query_param(trimmed_url, "wide").map(|value| value == "1").unwrap_or(false);
    let episode = parse_episode_from_query(&query);
    let variants = if deep {
        nyaa_query_variants(&query, episode)
    } else {
        vec![query.clone()]
    };
    let mut categories = vec![category.clone()];
    if wide && category.starts_with("1_") {
        categories.extend(["1_2", "1_3", "1_4"].iter().map(|value| value.to_string()));
        categories.sort();
        categories.dedup();
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(18))
        .user_agent("StreamNyaa Desktop/0.1")
        .build()
        .map_err(|error| format!("Could not prepare direct source search: {}", error))?;
    let query_count = variants
        .len()
        .saturating_mul(categories.len())
        .saturating_mul(pages as usize)
        .max(1);
    let mut items = Vec::new();
    for variant in variants {
        for category_item in &categories {
            for page_item in page..page + pages {
                let rss_url = nyaa_rss_url(&variant, category_item, &filter, page_item);
                let xml = client
                    .get(&rss_url)
                    .send()
                    .and_then(|response| response.error_for_status())
                    .map_err(|error| format!("Direct Nyaa source search failed: {}", error))?
                    .text()
                    .map_err(|error| format!("Could not read direct Nyaa source results: {}", error))?;
                items.extend(parse_nyaa_rss_items(
                    &xml,
                    &variant,
                    category_item,
                    page_item,
                    query_count,
                ));
            }
        }
    }
    Ok(serde_json::Value::Array(dedupe_source_json(items)))
}

fn normalize_torrent_url(value: &str) -> Option<String> {
    let value = value.trim();
    if !(value.starts_with("http://") || value.starts_with("https://")) {
        return None;
    }
    if value.ends_with(".torrent") || value.contains("/download/") {
        return Some(value.to_string());
    }
    if let Some(rest) = value.split("nyaa.si/view/").nth(1) {
        let id: String = rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        if !id.is_empty() {
            return Some(format!("https://nyaa.si/download/{}.torrent", id));
        }
    }
    None
}

fn normalize_info_hash(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() == 40 && trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Some(trimmed.to_ascii_lowercase());
    }
    let upper = trimmed.to_ascii_uppercase();
    if upper.len() == 32
        && upper
            .chars()
            .all(|ch| matches!(ch, 'A'..='Z' | '2'..='7'))
    {
        return Some(upper);
    }
    None
}

fn magnet_info_hash(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let marker = "magnet:?xt=urn:btih:";
    if !trimmed
        .get(..marker.len())
        .map(|prefix| prefix.eq_ignore_ascii_case(marker))
        .unwrap_or(false)
    {
        return None;
    }
    let hash = trimmed[marker.len()..]
        .split('&')
        .next()
        .unwrap_or("")
        .trim();
    normalize_info_hash(hash)
}

fn build_magnet_uri(info_hash: &str, title: &str) -> String {
    let trackers = [
        "http://nyaa.tracker.wf:7777/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.torrent.eu.org:451/announce",
    ];
    let mut magnet = format!(
        "magnet:?xt=urn:btih:{}&dn={}",
        info_hash,
        percent_encode(title.trim())
    );
    for tracker in trackers {
        magnet.push_str("&tr=");
        magnet.push_str(&percent_encode(tracker));
    }
    magnet
}

fn playback_source_candidates(request: &PlaybackRequest) -> Result<Vec<String>, String> {
    let mut candidates = Vec::new();

    if let Some(hash) = magnet_info_hash(&request.magnet) {
        candidates.push(request.magnet.trim().to_string());
        if let Some(request_hash) = request
            .info_hash
            .as_deref()
            .and_then(normalize_info_hash)
        {
            if request_hash != hash {
                candidates.push(build_magnet_uri(&request_hash, &request.title));
            }
        }
    } else if let Some(hash) = request
        .info_hash
        .as_deref()
        .and_then(normalize_info_hash)
    {
        candidates.push(build_magnet_uri(&hash, &request.title));
    }

    if let Some(url) = request
        .torrent_url
        .as_deref()
        .and_then(normalize_torrent_url)
    {
        candidates.push(url);
    }

    let mut seen = HashMap::<String, bool>::new();
    candidates.retain(|candidate| seen.insert(candidate.clone(), true).is_none());
    if candidates.is_empty() {
        return Err("Desktop streaming needs a valid torrent file URL or a valid magnet link.".to_string());
    }
    Ok(candidates)
}

fn describe_source_candidate(value: &str) -> &'static str {
    if value.trim_start().starts_with("magnet:?") {
        "magnet"
    } else {
        "torrent URL"
    }
}

fn friendly_rqbit_error(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(message) = json
            .get("human_readable")
            .and_then(|inner| inner.as_str())
            .map(|inner| inner.split_whitespace().collect::<Vec<_>>().join(" "))
        {
            return message;
        }
        if let Some(message) = json
            .get("status_text")
            .and_then(|inner| inner.as_str())
            .map(str::to_string)
        {
            return message;
        }
    }
    trimmed.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn last_url_segment(value: &str) -> String {
    value
        .split('?')
        .next()
        .unwrap_or(value)
        .rsplit('/')
        .next()
        .unwrap_or(value)
        .trim()
        .to_string()
}

fn stem_from_name(value: &str) -> String {
    Path::new(value)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(value)
        .trim()
        .to_string()
}

fn extension_from_name(value: &str) -> String {
    Path::new(value)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
}

fn infer_extension_from_label(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    for extension in ["mkv", "mp4", "webm", "avi", "m4v", "mov", "ts", "ass", "ssa", "srt", "vtt"] {
        if lower.contains(&format!(".{}", extension)) {
            return extension.to_string();
        }
    }
    String::new()
}

fn is_video_extension(value: &str) -> bool {
    matches!(
        value,
        "mkv" | "mp4" | "webm" | "avi" | "m4v" | "mov" | "ts"
    )
}

fn is_subtitle_extension(value: &str) -> bool {
    matches!(value, "ass" | "ssa" | "srt" | "vtt")
}

fn normalize_playlist_url(playlist_url: &str, value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with('/') {
        return format!("{}{}", RQBIT_URL, trimmed);
    }
    let base = playlist_url.rsplit_once('/').map(|(prefix, _)| prefix).unwrap_or(playlist_url);
    format!("{}/{}", base.trim_end_matches('/'), trimmed.trim_start_matches('/'))
}

fn parse_playlist_entries(playlist_url: &str, content: &str) -> Vec<PlaylistEntry> {
    let mut entries = Vec::new();
    let mut label_hint: Option<String> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((_, label)) = line.strip_prefix("#EXTINF:").and_then(|value| value.split_once(',')) {
            let label = label.trim();
            if !label.is_empty() {
                label_hint = Some(label.to_string());
            }
            continue;
        }
        if line.starts_with('#') {
            continue;
        }

        let url = normalize_playlist_url(playlist_url, line);
        let raw_file_name = last_url_segment(&url);
        let label = label_hint
            .take()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| raw_file_name.clone());
        let label_name = last_url_segment(&label);
        let label_extension = extension_from_name(&label_name);
        let fallback_extension = infer_extension_from_label(&label);
        let extension = extension_from_name(&raw_file_name);
        let extension = if !extension.is_empty() {
            extension
        } else if !label_extension.is_empty() {
            label_extension
        } else {
            fallback_extension
        };
        let file_name = if !label_name.is_empty() && label_name.contains('.') {
            label_name.clone()
        } else {
            raw_file_name.clone()
        };
        let file_stem = stem_from_name(if !label_name.is_empty() { &label_name } else { &file_name });
        let kind = if is_video_extension(&extension) {
            PlaylistKind::Video
        } else if is_subtitle_extension(&extension) {
            PlaylistKind::Subtitle
        } else {
            PlaylistKind::Other
        };

        entries.push(PlaylistEntry {
            url,
            label,
            file_name,
            file_stem,
            kind,
        });
    }

    entries
}

fn episode_signal_in_text(value: &str, episode: &str) -> bool {
    let episode = episode.trim();
    if episode.is_empty() {
        return false;
    }
    let padded = format!("{:0>2}", episode);
    [
        format!("e{}", padded),
        format!("ep{}", episode),
        format!("episode {}", episode),
        format!("s01e{}", padded),
        format!(" {}", padded),
        format!("-{}", padded),
        format!("_{}", padded),
    ]
    .iter()
    .any(|needle| value.contains(needle))
}

fn looks_like_auxiliary_video(value: &str) -> bool {
    [
        "nced",
        "ncop",
        "creditless",
        "opening",
        "ending",
        "preview",
        "pv",
        "trailer",
        "sample",
        "extra",
        "menu",
        "op ",
        "ed ",
    ]
    .iter()
    .any(|needle| value.contains(needle))
}

fn playlist_video_score(entry: &PlaylistEntry, request: &PlaybackRequest) -> i32 {
    let value = format!(
        "{} {}",
        entry.file_name.to_ascii_lowercase(),
        entry.label.to_ascii_lowercase()
    );
    let mut score = 0i32;

    if entry.kind == PlaylistKind::Video {
        score += 1000;
    }
    if !request.episode.trim().is_empty() && episode_signal_in_text(&value, &request.episode) {
        score += 220;
    }
    if !request.anime_title.trim().is_empty() {
        let title = request
            .anime_title
            .to_ascii_lowercase()
            .replace(':', " ")
            .replace('-', " ")
            .replace('_', " ");
        let overlap = title
            .split_whitespace()
            .filter(|part| part.len() > 2 && value.contains(part))
            .count() as i32;
        score += overlap * 12;
    }
    if !request.title.trim().is_empty() {
        let title = request
            .title
            .to_ascii_lowercase()
            .replace(':', " ")
            .replace('-', " ")
            .replace('_', " ");
        let overlap = title
            .split_whitespace()
            .filter(|part| part.len() > 2 && value.contains(part))
            .count() as i32;
        score += overlap * 8;
    }
    if value.contains("1080") {
        score += 16;
    }
    if value.contains("720") {
        score += 8;
    }
    if value.contains("hevc") || value.contains("x265") || value.contains("h265") {
        score += 8;
    }
    if value.contains("dual") || value.contains("multi audio") || value.contains("dub") {
        score += 18;
    }
    if looks_like_auxiliary_video(&value) {
        score -= 240;
    }
    if value.contains("sample") {
        score -= 500;
    }

    score
}

fn select_stream_target(entries: &[PlaylistEntry], request: &PlaybackRequest) -> Option<ResolvedStreamTarget> {
    let media = entries
        .iter()
        .filter(|entry| entry.kind == PlaylistKind::Video)
        .max_by_key(|entry| playlist_video_score(entry, request))
        .cloned()
        .or_else(|| {
            entries
                .iter()
                .filter(|entry| entry.kind != PlaylistKind::Subtitle)
                .max_by_key(|entry| playlist_video_score(entry, request))
                .cloned()
        })?;

    let subtitle_urls = entries
        .iter()
        .filter(|entry| entry.kind == PlaylistKind::Subtitle)
        .filter(|entry| entry.file_stem.eq_ignore_ascii_case(&media.file_stem))
        .map(|entry| entry.url.clone())
        .collect::<Vec<_>>();

    let subtitle_urls = if subtitle_urls.is_empty() {
        entries
            .iter()
            .filter(|entry| entry.kind == PlaylistKind::Subtitle)
            .take(3)
            .map(|entry| entry.url.clone())
            .collect::<Vec<_>>()
    } else {
        subtitle_urls
    };

    Some(ResolvedStreamTarget {
        media_url: media.url,
        subtitle_urls,
    })
}

fn playlist_target(torrent_id: &str, request: &PlaybackRequest) -> Result<Option<ResolvedStreamTarget>, String> {
    let playlist_path = format!("/torrents/{}/playlist", percent_encode(torrent_id));
    let playlist_url = format!("{}{}", RQBIT_URL, &playlist_path);
    let payload = rqbit_get(&playlist_path)?;
    let entries = parse_playlist_entries(&playlist_url, &payload);
    Ok(select_stream_target(&entries, request))
}

fn loading_artwork_url(request: &PlaybackRequest) -> Option<String> {
    [request.banner.as_deref(), request.poster.as_deref()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| value.starts_with("https://") || value.starts_with("http://"))
        .map(str::to_string)
}

fn loading_palette_seed(value: &str) -> usize {
    value
        .bytes()
        .fold(0usize, |sum, item| sum.wrapping_add(item as usize))
        % 4
}

fn loading_palette(value: &str) -> (&'static str, &'static str, &'static str, &'static str) {
    match loading_palette_seed(value) {
        0 => ("#e11d48", "#7c3aed", "#241018", "#0a0a0f"),
        1 => ("#fb7185", "#2563eb", "#201018", "#090b12"),
        2 => ("#a855f7", "#ec4899", "#1a0d17", "#08070d"),
        _ => ("#f43f5e", "#0ea5e9", "#1f1016", "#07090d"),
    }
}

fn loading_stage_markup(step: usize, label: &str) -> String {
    let active = step.min(4);
    let marks = (0..4)
        .map(|index| if index < active { "[####]" } else { "[----]" })
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "{{\\fs14\\b1}}{}\\N{{\\fs16\\b1}}STEP {} OF 4  {}",
        ass_escape(label),
        active.max(1),
        marks
    )
}

fn loading_svg(cache_dir: &Path, request: &PlaybackRequest, title: &str) -> Result<PathBuf, String> {
    let path = cache_dir.join("streamnyaa-loading.svg");
    let display_title = trim_for_display(title, 42);
    let display_anime_title = if request.anime_title.trim().is_empty() {
        display_title.clone()
    } else {
        trim_for_display(request.anime_title.trim(), 40)
    };
    let display_source_title = trim_for_display(request.title.trim(), 64);
    let title = xml_escape(&display_title);
    let anime_title = xml_escape(&display_anime_title);
    let source_title = xml_escape(&display_source_title);
    let episode = xml_escape(request.episode.trim());
    let artwork = loading_artwork_url(request)
        .map(|value| {
            format!(
                r#"<image href="{}" x="704" y="78" width="510" height="564" preserveAspectRatio="xMidYMid slice" clip-path="url(#artClip)" opacity="0.92"/>"#,
                xml_escape(&value)
            )
        })
        .unwrap_or_else(|| {
            r#"<rect x="704" y="78" width="510" height="564" rx="28" fill="url(#artFallback)"/>"#.to_string()
        });
    let (accent, accent_secondary, panel_top, panel_bottom) = loading_palette(&format!(
        "{}|{}|{}",
        request.anime_title, request.episode, request.title
    ));
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs>
<radialGradient id="g" cx="52%" cy="40%" r="78%">
<stop offset="0" stop-color="{2}" stop-opacity="0.78"/>
<stop offset="0.38" stop-color="{3}"/>
<stop offset="1" stop-color="#040405"/>
</radialGradient>
<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#17171d" stop-opacity="0.92"/>
<stop offset="1" stop-color="#09090d" stop-opacity="0.84"/>
</linearGradient>
<linearGradient id="artFallback" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="{2}" stop-opacity="0.92"/>
<stop offset="1" stop-color="{3}" stop-opacity="0.78"/>
</linearGradient>
<linearGradient id="accentGlow" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="{0}"/>
<stop offset="1" stop-color="{1}"/>
</linearGradient>
<clipPath id="artClip">
  <rect x="704" y="78" width="510" height="564" rx="28"/>
</clipPath>
</defs>
<rect width="1280" height="720" fill="url(#g)"/>
<circle cx="950" cy="112" r="236" fill="{0}" fill-opacity="0.16"/>
<circle cx="1028" cy="158" r="172" fill="{1}" fill-opacity="0.12"/>
<rect x="84" y="88" width="580" height="544" rx="28" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.09"/>
<rect x="84" y="88" width="580" height="544" rx="28" fill="url(#g)" fill-opacity="0.10"/>
<rect x="704" y="78" width="510" height="564" rx="28" fill="#0b0b10" stroke="#ffffff" stroke-opacity="0.08"/>
{4}
<rect x="704" y="78" width="510" height="564" rx="28" fill="url(#panel)" fill-opacity="0.20"/>
<rect x="704" y="78" width="510" height="564" rx="28" fill="url(#g)" fill-opacity="0.42"/>
<text x="126" y="146" fill="{0}" font-family="Segoe UI,Arial" font-size="16" font-weight="800" letter-spacing="4">STREAMNYAA</text>
<text x="126" y="194" fill="#8f96a3" font-family="Segoe UI,Arial" font-size="16" font-weight="700" letter-spacing="3">LOCAL CINEMA</text>
<text x="126" y="252" fill="#ffffff" font-family="Segoe UI,Arial" font-size="18" font-weight="700">Selected anime</text>
<text x="126" y="306" fill="#ffffff" font-family="Segoe UI,Arial" font-size="48" font-weight="800">{5}</text>
<text x="126" y="344" fill="#c4c7cf" font-family="Segoe UI,Arial" font-size="24">{6}</text>
<rect x="126" y="378" width="134" height="40" rx="20" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="152" y="403" fill="#ffffff" font-family="Segoe UI,Arial" font-size="15" font-weight="700">Episode {7}</text>
<rect x="274" y="378" width="154" height="40" rx="20" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="300" y="403" fill="#ffffff" font-family="Segoe UI,Arial" font-size="15" font-weight="700">Local player</text>
<text x="126" y="452" fill="#9ca3af" font-family="Segoe UI,Arial" font-size="18">Selected release</text>
<text x="126" y="486" fill="#ffffff" font-family="Segoe UI,Arial" font-size="22" font-weight="700">{8}</text>
<text x="126" y="528" fill="#9ca3af" font-family="Segoe UI,Arial" font-size="18">The player stays open while metadata, peers, and the first video pieces arrive.</text>
<rect x="126" y="564" width="104" height="42" rx="21" fill="url(#accentGlow)"/>
<text x="146" y="590" fill="#ffffff" font-family="Segoe UI,Arial" font-size="15" font-weight="800">METADATA</text>
<rect x="242" y="564" width="88" height="42" rx="21" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="265" y="590" fill="#ffffff" fill-opacity="0.78" font-family="Segoe UI,Arial" font-size="15" font-weight="800">PEERS</text>
<rect x="342" y="564" width="104" height="42" rx="21" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="368" y="590" fill="#ffffff" fill-opacity="0.78" font-family="Segoe UI,Arial" font-size="15" font-weight="800">BUFFER</text>
<rect x="458" y="564" width="86" height="42" rx="21" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="486" y="590" fill="#ffffff" fill-opacity="0.78" font-family="Segoe UI,Arial" font-size="15" font-weight="800">PLAY</text>
<text x="126" y="636" fill="#c9ced9" font-family="Segoe UI,Arial" font-size="16">Preparing the first playback buffer. StreamNyaa keeps this source locked to the same player window.</text>
<circle cx="955" cy="378" r="72" fill="{0}"/>
<polygon points="908,330 908,402 972,366" fill="white"/>
<text x="932" y="482" text-anchor="middle" fill="#ffffff" font-family="Segoe UI,Arial" font-size="28" font-weight="800">Opening player</text>
<text x="932" y="520" text-anchor="middle" fill="#9ca3af" font-family="Segoe UI,Arial" font-size="18">Selected source remains active while playback initializes</text>
</svg>"##,
        accent,
        accent_secondary,
        panel_top,
        panel_bottom,
        artwork,
        if anime_title.is_empty() { title.clone() } else { anime_title },
        title,
        if episode.is_empty() { "Current".to_string() } else { episode },
        source_title,
    );
    fs::write(&path, svg).map_err(|error| format!("Could not prepare loading screen: {}", error))?;
    Ok(path)
}

fn mpv_ipc_path() -> String {
    #[cfg(windows)]
    {
        format!(r"\\.\pipe\{}-{}", PLAYER_PIPE_PREFIX, now_millis())
    }
    #[cfg(not(windows))]
    {
        env::temp_dir()
            .join(format!("{}-{}.sock", PLAYER_PIPE_PREFIX, now_millis()))
            .to_string_lossy()
            .to_string()
    }
}

fn send_mpv(ipc: &str, command: &str) -> bool {
    #[cfg(windows)]
    {
        if let Ok(mut stream) = std::fs::OpenOptions::new().write(true).open(ipc) {
            return stream.write_all(command.as_bytes()).is_ok() && stream.write_all(b"\n").is_ok();
        }
        false
    }
    #[cfg(not(windows))]
    {
        use std::os::unix::net::UnixStream;
        if let Ok(mut stream) = UnixStream::connect(ipc) {
            return stream.write_all(command.as_bytes()).is_ok() && stream.write_all(b"\n").is_ok();
        }
        false
    }
}

fn send_mpv_request(ipc: &str, command: &str) -> Option<serde_json::Value> {
    #[cfg(windows)]
    {
        use std::io::{BufRead, BufReader};
        let mut stream = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(ipc)
            .ok()?;
        stream.write_all(command.as_bytes()).ok()?;
        stream.write_all(b"\n").ok()?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        for _ in 0..6 {
            line.clear();
            if reader.read_line(&mut line).ok()? == 0 {
                break;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if json.get("request_id").is_some() || json.get("data").is_some() {
                    return Some(json);
                }
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        use std::io::{BufRead, BufReader};
        use std::os::unix::net::UnixStream;
        let mut stream = UnixStream::connect(ipc).ok()?;
        stream.write_all(command.as_bytes()).ok()?;
        stream.write_all(b"\n").ok()?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        for _ in 0..6 {
            line.clear();
            if reader.read_line(&mut line).ok()? == 0 {
                break;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                if json.get("request_id").is_some() || json.get("data").is_some() {
                    return Some(json);
                }
            }
        }
        None
    }
}

fn player_ipc_ready(ipc: &str, retries: usize, delay_ms: u64) -> bool {
    for _ in 0..retries {
        if send_mpv(ipc, r#"{"command":["get_property","idle-active"],"request_id":1}"#) {
            return true;
        }
        thread::sleep(Duration::from_millis(delay_ms));
    }
    false
}

fn get_player_property_f64(ipc: &str, property: &str) -> Option<f64> {
    let command = format!(
        r#"{{"command":["get_property",{}],"request_id":41}}"#,
        json_string(property)
    );
    let response = send_mpv_request(ipc, &command)?;
    response
        .get("data")
        .and_then(|value| value.as_f64().or_else(|| value.as_u64().map(|item| item as f64)))
}

fn ass_escape(value: &str) -> String {
    value
        .replace('\\', r"\\")
        .replace('{', r"\{")
        .replace('}', r"\}")
        .replace('\n', r"\N")
}

fn player_overlay_copy(status: &str) -> (&'static str, String, usize) {
    if status.contains("Preparing torrent session") || status.contains("Fetching torrent metadata") || status.contains("Fetching metadata and peers") {
        (
            "Preparing stream session",
            "Reading torrent metadata, validating the release, and waiting for the first peer responses.".to_string(),
            1,
        )
    } else if status.contains("Looking for the episode file") || status.contains("Matching the correct episode file") {
        (
            "Selecting the episode file",
            "The torrent is ready. StreamNyaa is matching the exact video file for this episode.".to_string(),
            2,
        )
    } else if status.contains("connecting") || status.contains("responsive peers") || status.contains("Connecting peers") {
        (
            "Connecting to peers",
            "Peers are responding. StreamNyaa is building a stable session before playback begins.".to_string(),
            2,
        )
    } else if status.contains("Buffering") || status.contains("buffering") || status.contains("Opening the player while the first buffer fills") || status.contains("Preparing the player handoff") {
        (
            "Building the playback buffer",
            "The player is open. StreamNyaa is filling the first playback buffer for a smooth start.".to_string(),
            3,
        )
    } else if status.contains("Starting playback") || status.contains("Opening stream") || status.contains("Opening the stream in the current player") {
        (
            "Starting the episode",
            "The selected release is now entering playback in the same player window.".to_string(),
            4,
        )
    } else if status.contains("Switching episode") {
        (
            "Switching episode",
            "Reusing the current player window and handing the next episode over cleanly.".to_string(),
            1,
        )
    } else if status.contains("Stopping previous stream") {
        (
            "Cleaning the previous stream",
            "Stopping the old torrent session before the next episode takes over.".to_string(),
            1,
        )
    } else if status.contains("Stopping stream") {
        (
            "Closing the playback session",
            "Cleaning temporary files and releasing the local stream session.".to_string(),
            4,
        )
    } else if status.contains("Retrying") {
        (
            "Retrying the player handoff",
            "Reopening the selected stream after a player handoff retry.".to_string(),
            3,
        )
    } else {
        (
            "Preparing local playback",
            "StreamNyaa keeps the selected source active while the local player prepares playback.".to_string(),
            1,
        )
    }
}

fn player_overlay_message(status: &str) -> String {
    let (headline, detail, stage_number) = player_overlay_copy(status);
    let stage = loading_stage_markup(stage_number, headline);
    format!(
        "{{\\an7\\fs14\\bord2.4\\shad0\\b1}}STREAMNYAA LOCAL PLAYER\\N{{\\fs28\\b1}}{}\\N{{\\fs17\\b0}}{}\\N{}",
        ass_escape(headline),
        ass_escape(&detail),
        stage
    )
}

fn show_player_text(ipc: &str, text: &str) {
    let command = format!(
        r#"{{"command":["show-text",{},"3500"],"request_id":2}}"#,
        json_string(&player_overlay_message(text))
    );
    let _ = send_mpv(ipc, &command);
}

fn load_player_file(ipc: &str, url: &str) -> bool {
    let command = format!(
        r#"{{"command":["loadfile",{},"replace"],"request_id":3}}"#,
        json_string(url)
    );
    send_mpv(ipc, &command)
}

fn set_player_title(ipc: &str, title: &str) {
    let command = format!(
        r#"{{"command":["set_property","force-media-title",{}],"request_id":31}}"#,
        json_string(title)
    );
    let _ = send_mpv(ipc, &command);
}

fn add_player_subtitle(ipc: &str, url: &str) {
    let command = format!(
        r#"{{"command":["sub-add",{},"select"],"request_id":32}}"#,
        json_string(url)
    );
    let _ = send_mpv(ipc, &command);
}

fn seek_player_resume(ipc: &str, resume_seconds: f64) {
    if !resume_seconds.is_finite() || resume_seconds < 5.0 {
        return;
    }
    let command = format!(
        r#"{{"command":["seek",{},"absolute+exact"],"request_id":34}}"#,
        resume_seconds.max(0.0)
    );
    let _ = send_mpv(ipc, &command);
}

fn load_player_target(
    ipc: &str,
    title: &str,
    target: &ResolvedStreamTarget,
    resume_seconds: Option<f64>,
) -> bool {
    if !load_player_file(ipc, &target.media_url) {
        return false;
    }
    set_player_title(ipc, title);
    if !target.subtitle_urls.is_empty() {
        thread::sleep(Duration::from_millis(220));
        for subtitle in &target.subtitle_urls {
            add_player_subtitle(ipc, subtitle);
        }
    }
    if let Some(resume_seconds) = resume_seconds {
        thread::sleep(Duration::from_millis(280));
        seek_player_resume(ipc, resume_seconds);
    }
    true
}

fn stop_player_stream_only(ipc: &str) {
    let _ = send_mpv(ipc, r#"{"command":["stop"],"request_id":33}"#);
}

fn launch_or_reuse_player(player_path: &str, cache_dir: &Path, request: &PlaybackRequest, title: &str) -> Result<String, String> {
    let stale_player = {
        let mut guard = manager()
            .lock()
            .map_err(|_| "Playback manager is unavailable.".to_string())?;

        let existing_ipc = guard.player_ipc.clone();
        if let (Some(child), Some(ipc)) = (guard.player.as_mut(), existing_ipc) {
            if child.try_wait().ok().flatten().is_none() && player_ipc_ready(&ipc, 2, 60) {
                show_player_text(&ipc, "Switching episode...");
                return Ok(ipc);
            }
        }

        let stale_player = guard.player.take();
        guard.player_ipc = None;
        stale_player
    };

    if let Some(mut child) = stale_player {
        let _ = child.kill();
        let _ = child.wait();
    }

    let ipc = mpv_ipc_path();
    let loading = loading_svg(cache_dir, request, title)?;
    let child = prepared_command(player_path)
        .arg("--no-config")
        .arg("--force-window=yes")
        .arg("--idle=yes")
        .arg("--keep-open=yes")
        .arg("--osc=yes")
        .arg("--osd-bar=yes")
        .arg("--osd-level=1")
        .arg("--cursor-autohide=700")
        .arg("--input-default-bindings=yes")
        .arg("--background-color=#050508")
        .arg("--hwdec=auto-safe")
        .arg("--cache=yes")
        .arg("--cache-on-disk=no")
        .arg("--cache-pause=yes")
        .arg("--cache-pause-initial=yes")
        .arg("--cache-secs=18")
        .arg("--demuxer-max-bytes=64MiB")
        .arg("--demuxer-readahead-secs=45")
        .arg("--save-position-on-quit=no")
        .arg("--sub-auto=fuzzy")
        .arg("--sub-ass-override=no")
        .arg("--sub-scale=0.92")
        .arg("--sub-pos=90")
        .arg("--sub-scale-by-window=yes")
        .arg("--sub-use-margins=yes")
        .arg("--osd-font=Segoe UI Semibold")
        .arg("--osd-font-size=24")
        .arg("--osd-color=#FFFFFFFF")
        .arg("--osd-border-color=#09090D")
        .arg("--osd-border-size=2.2")
        .arg("--osd-shadow-offset=0")
        .arg("--sub-font=Segoe UI Semibold")
        .arg("--sub-font-size=42")
        .arg("--sub-color=#FFF8F7")
        .arg("--sub-border-color=#06070A")
        .arg("--sub-border-size=2.5")
        .arg("--sub-shadow-offset=0")
        .arg("--sub-back-color=#00000022")
        .arg(format!("--input-ipc-server={}", ipc))
        .arg(format!("--title=StreamNyaa - {}", title))
        .arg(loading)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not open the StreamNyaa player: {}", error))?;

    {
        let mut guard = manager()
            .lock()
            .map_err(|_| "Playback manager is unavailable.".to_string())?;
        guard.player = Some(child);
        guard.player_ipc = Some(ipc.clone());
    }

    if player_ipc_ready(&ipc, 35, 100) {
        show_player_text(&ipc, "Preparing torrent session...");
        return Ok(ipc);
    }

    close_player_if_needed();
    Err("The native player did not become ready in time.".to_string())
}

fn relaunch_player_and_load_target(
    player_path: &str,
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
    target: &ResolvedStreamTarget,
) -> Result<String, String> {
    close_player_if_needed();
    let ipc = launch_or_reuse_player(player_path, cache_dir, request, title)?;
    show_player_text(&ipc, "Retrying the player handoff...");
    if !load_player_target(&ipc, title, target, request.resume_seconds) {
        close_player_if_needed();
        return Err("The native player could not load the stream after retrying.".to_string());
    }
    Ok(ipc)
}

fn close_player_if_needed() {
    if let Ok(mut guard) = manager().lock() {
        if let Some(ipc) = guard.player_ipc.as_deref() {
            let _ = send_mpv(ipc, r#"{"command":["stop"],"request_id":4}"#);
            let _ = send_mpv(ipc, r#"{"command":["quit"],"request_id":5}"#);
        }
        if let Some(mut child) = guard.player.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        guard.player_ipc = None;
    }
}

fn cleanup_session(active: ActiveSession, delete_files: bool) {
    log_info(format!("Stopping stream session {}", active.torrent_id));
    let path = format!("/torrents/{}", percent_encode(&active.torrent_id));
    let _ = rqbit_delete(&path).or_else(|_| rqbit_delete(&format!("{}?with_files=false", path)));
    thread::sleep(Duration::from_millis(250));
    stop_rqbit_server(Some(&active.engine_path));
    thread::sleep(Duration::from_millis(250));
    if delete_files {
        safe_delete_dir(&active.session_dir);
    }
}

fn take_active_session() -> Option<ActiveSession> {
    let mut guard = manager().lock().ok()?;
    guard.active.take()
}

fn stop_active_session(delete_files: bool) {
    if let Some(active) = take_active_session() {
        cleanup_session(active, delete_files);
    }
}

fn spawn_player_watchdog() {
    thread::spawn(|| loop {
        enum WatchdogAction {
            PlayerExited(ActiveSession),
            GuardTrip {
                active: ActiveSession,
                ipc: Option<String>,
                reason: String,
            },
        }

        let next_action = {
            let mut guard = match manager().lock() {
                Ok(guard) => guard,
                Err(_) => {
                    thread::sleep(Duration::from_millis(1200));
                    continue;
                }
            };

            let mut player_exited = false;
            if let Some(child) = guard.player.as_mut() {
                if child.try_wait().ok().flatten().is_some() {
                    player_exited = true;
                }
            }

            if player_exited {
                guard.player = None;
                guard.player_ipc = None;
                guard.active.take().map(WatchdogAction::PlayerExited)
            } else {
                if let Some(active) = guard.active.clone() {
                    let session_bytes = dir_size(&active.session_dir);
                    let free_bytes = available_disk_bytes(&active.session_dir);
                    let over_session_limit = session_bytes > STREAM_SESSION_HARD_STOP_BYTES;
                    let low_disk = free_bytes
                        .map(|value| value < MIN_PLAYBACK_FREE_BYTES)
                        .unwrap_or(false);
                    if over_session_limit || low_disk {
                        let ipc = guard.player_ipc.clone();
                        let active = guard.active.take().expect("active session exists");
                        let reason = if over_session_limit {
                            "The active stream was stopped because its temporary files exceeded the desktop storage guard.".to_string()
                        } else {
                            "The active stream was stopped because the device is too low on free space for safe playback.".to_string()
                        };
                        Some(WatchdogAction::GuardTrip { active, ipc, reason })
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
        };

        if let Some(action) = next_action {
            match action {
                WatchdogAction::PlayerExited(active) => {
                    let cache_dir = active
                        .session_dir
                        .parent()
                        .map(Path::to_path_buf)
                        .unwrap_or_else(cache_root);
                    cleanup_session(active, true);
                    cleanup_abandoned_sessions(&cache_dir, None);
                    prune_cache(&cache_dir, None);
                    log_info("Cleaned playback session after player exit");
                }
                WatchdogAction::GuardTrip { active, ipc, reason } => {
                    let cache_dir = active
                        .session_dir
                        .parent()
                        .map(Path::to_path_buf)
                        .unwrap_or_else(cache_root);
                    if let Some(ipc) = ipc.as_deref() {
                        show_player_text(ipc, &reason);
                        stop_player_stream_only(ipc);
                    }
                    remember_error(reason);
                    cleanup_session(active, true);
                    cleanup_abandoned_sessions(&cache_dir, None);
                    prune_cache(&cache_dir, None);
                    log_info("Stopped playback session after runtime storage guard trip");
                }
            }
        }

        thread::sleep(Duration::from_millis(1200));
    });
}

fn playback_title(request: &PlaybackRequest) -> String {
    if request.anime_title.trim().is_empty() {
        request.title.clone()
    } else if request.episode.trim().is_empty() {
        format!("{} - {}", request.anime_title, request.title)
    } else {
        format!("{} - Episode {}", request.anime_title, request.episode)
    }
}

fn parse_size_bytes(size: Option<&str>) -> Option<u64> {
    let raw = size?.trim();
    let lower = raw.to_ascii_lowercase();
    let number = lower
        .split_whitespace()
        .next()
        .and_then(|value| value.replace(',', "").parse::<f64>().ok())?;
    let multiplier = if lower.contains("tib") || lower.contains("tb") {
        1024f64 * 1024f64 * 1024f64 * 1024f64
    } else if lower.contains("gib") || lower.contains("gb") {
        1024f64 * 1024f64 * 1024f64
    } else if lower.contains("mib") || lower.contains("mb") {
        1024f64 * 1024f64
    } else {
        1f64
    };
    Some((number * multiplier).max(0.0) as u64)
}

fn looks_like_batch_source(title: &str) -> bool {
    let lower = title.to_ascii_lowercase();
    [" batch", "complete season", "season pack", " collection", "[batch]", " complete"]
        .iter()
        .any(|needle| lower.contains(needle))
}

fn torrent_stats(torrent_id: &str) -> Result<serde_json::Value, String> {
    let payload = rqbit_get(&format!("/torrents/{}/stats/v1", percent_encode(torrent_id)))
        .or_else(|_| rqbit_get(&format!("/torrents/{}", percent_encode(torrent_id))))?;
    serde_json::from_str(&payload)
        .map_err(|error| format!("Could not parse stream status: {}", error))
}

fn session_guard_error(cache_dir: &Path, session_dir: &Path) -> Option<String> {
    let session_bytes = dir_size(session_dir);
    if session_bytes > STREAM_SESSION_HARD_STOP_BYTES {
        return Some(format!(
            "This source is using too much local storage for one stream ({} MB). Choose a smaller release.",
            session_bytes / 1024 / 1024
        ));
    }

    if let Some(free) = available_disk_bytes(cache_dir) {
        if free < MIN_PLAYBACK_FREE_BYTES {
            return Some(
                "Your device dropped below the safe free-space limit during playback. The stream was stopped to avoid filling the drive."
                    .to_string(),
            );
        }
    }

    None
}

fn wait_for_stream_with_session_guard(
    torrent_id: &str,
    request: &PlaybackRequest,
    player_ipc: Option<&str>,
    cache_dir: &Path,
    session_dir: &Path,
) -> Result<ResolvedStreamTarget, String> {
    let started_at = now_millis();
    let mut saw_peer = false;
    let mut best_downloaded = 0u64;
    let mut selected_target: Option<ResolvedStreamTarget> = None;
    let mut selected_target_at: Option<u128> = None;

    while now_millis().saturating_sub(started_at) <= STREAM_READY_TIMEOUT_MS {
        if let Some(error) = session_guard_error(cache_dir, session_dir) {
            if let Some(ipc) = player_ipc {
                show_player_text(ipc, "Stopping stream to protect local storage...");
            }
            return Err(error);
        }

        let json = torrent_stats(torrent_id)?;
        let downloaded_bytes =
            find_number(&json, &["downloaded_bytes", "bytes_completed", "downloaded"]).unwrap_or(0.0) as u64;
        let total_bytes =
            find_number(&json, &["total_bytes", "bytes_total", "size_bytes", "total_size"]).unwrap_or(0.0) as u64;
        let peers =
            find_number(&json, &["peers", "num_peers", "live_peers", "peer_count"]).unwrap_or(0.0) as u64;

        saw_peer |= peers > 0;
        best_downloaded = best_downloaded.max(downloaded_bytes);

        if selected_target.is_none() {
            if let Ok(target) = playlist_target(torrent_id, request) {
                if let Some(target) = target {
                    selected_target_at = Some(now_millis());
                    selected_target = Some(target);
                }
            }
        }

        let target_buffer = if total_bytes > 0 {
            INITIAL_PLAYBACK_BUFFER_BYTES.min((total_bytes / 6).max(MIN_INITIAL_PLAYBACK_BUFFER_BYTES))
        } else {
            INITIAL_PLAYBACK_BUFFER_BYTES
        };

        if let Some(target) = selected_target.clone() {
            let target_age = selected_target_at
                .map(|value| now_millis().saturating_sub(value))
                .unwrap_or(0);
            let ready_for_player = downloaded_bytes >= target_buffer
                || (saw_peer && downloaded_bytes >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES)
                || target_age >= 2200;
            if ready_for_player {
                if let Some(ipc) = player_ipc {
                    if downloaded_bytes >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES || saw_peer {
                        show_player_text(ipc, "Starting playback...");
                    } else {
                        show_player_text(ipc, "Opening the player while the first buffer fills...");
                    }
                }
                return Ok(target);
            }
        }

        let status_text = if selected_target.is_none() && peers == 0 {
            "Preparing torrent session. Reading metadata and waiting for the first peers...".to_string()
        } else if selected_target.is_none() {
            format!(
                "Torrent ready. Matching the correct episode file... {} MB cached from {} peer{}",
                downloaded_bytes / 1024 / 1024,
                peers,
                if peers == 1 { "" } else { "s" }
            )
        } else if peers > 0 {
            format!(
                "Buffering the episode... {} MB cached from {} peer{}",
                downloaded_bytes / 1024 / 1024,
                peers,
                if peers == 1 { "" } else { "s" }
            )
        } else {
            format!("Preparing the player handoff... {} MB cached", downloaded_bytes / 1024 / 1024)
        };
        if let Some(ipc) = player_ipc {
            show_player_text(ipc, &status_text);
        }
        thread::sleep(Duration::from_millis(450));
    }

    if selected_target.is_none() {
        return Err("This source did not expose a playable video file in time. Try another release.".to_string());
    }

    if saw_peer || best_downloaded > 0 {
        Err("The source did not become ready quickly enough. The player can stay open, but this release may be too slow or unstable.".to_string())
    } else {
        Err("No responsive peers were found for this source. Try another release.".to_string())
    }
}

fn runtime_status(settings: Option<DesktopSettings>) -> RuntimeStatus {
    let settings = settings.unwrap_or(DesktopSettings {
        torrent_engine_path: None,
        player_path: None,
        mpv_path: None,
        cache_dir: None,
    });
    let cache_dir = resolved_cache_dir(settings.cache_dir);
    let engine_path = configured_command(
        settings.torrent_engine_path,
        "STREAMNYAA_TORRENT_ENGINE_PATH",
        "rqbit",
        &["rqbit", "rqbit.exe"],
    );
    let player_override = settings
        .player_path
        .or(settings.mpv_path)
        .or_else(|| clean_value(env::var("STREAMNYAA_PLAYER_PATH").ok()))
        .or_else(|| clean_value(env::var("STREAMNYAA_MPV_PATH").ok()));
    let player_path = configured_command(
        player_override,
        "STREAMNYAA_PLAYER_PATH",
        "mpv",
        &["mpv", "mpv.exe"],
    );
    let engine_configured = command_configured(&engine_path, &["rqbit", "rqbit.exe"]);
    let player_configured = command_configured(&player_path, &["mpv", "mpv.exe"]);
    let ready = engine_configured && player_configured;
    let message = if ready {
        "Bundled streaming engine and native player are ready.".to_string()
    } else if !engine_configured {
        "The bundled torrent engine is missing or unavailable. Add the engine to this desktop build or set an override path.".to_string()
    } else {
        "The bundled native player is missing or unavailable. Add the player to this desktop build or set an override path.".to_string()
    };
    RuntimeStatus {
        ready,
        torrent_engine_configured: engine_configured,
        player_configured,
        torrent_engine_path: engine_path.clone(),
        player_path: player_path.clone(),
        torrent_engine_version: command_version(&engine_path, &["rqbit", "rqbit.exe"]),
        player_version: command_version(&player_path, &["mpv", "mpv.exe"]),
        cache_dir: cache_dir.to_string_lossy().to_string(),
        message,
    }
}

#[tauri::command]
fn get_desktop_runtime_status(settings: Option<DesktopSettings>) -> RuntimeStatus {
    runtime_status(settings)
}

#[tauri::command]
fn clear_playback_cache(settings: Option<DesktopSettings>) -> Result<CacheStatus, String> {
    let _operation_guard = playback_operation_lock()
        .try_lock()
        .map_err(|_| "Playback cleanup is busy. Try again in a moment.".to_string())?;
    let status = runtime_status(settings);
    close_player_if_needed();
    stop_active_session(true);
    stop_rqbit_server(status.torrent_engine_path.as_deref());
    let cache_dir = PathBuf::from(status.cache_dir);
    cleanup_abandoned_sessions(&cache_dir, None);
    prune_cache(&cache_dir, None);
    clear_memory_caches();
    log_info("Playback cache cleared");
    Ok(collect_cache_status(&cache_dir))
}

#[tauri::command]
fn stop_local_playback(settings: Option<DesktopSettings>) -> Result<PlaybackStatus, String> {
    let _operation_guard = playback_operation_lock()
        .try_lock()
        .map_err(|_| "Playback shutdown is busy. Try again in a moment.".to_string())?;
    let status = runtime_status(settings);
    let cache_dir = PathBuf::from(status.cache_dir);
    if let Ok(guard) = manager().lock() {
        if let Some(ipc) = guard.player_ipc.as_deref() {
            show_player_text(ipc, "Stopping stream and cleaning temporary files...");
            stop_player_stream_only(ipc);
        }
    }
    stop_active_session(true);
    stop_rqbit_server(status.torrent_engine_path.as_deref());
    cleanup_abandoned_sessions(&cache_dir, None);
    prune_cache(&cache_dir, None);
    clear_memory_caches();
    log_info("Stopped local playback and cleaned the active session");
    Ok(PlaybackStatus {
        ok: true,
        state: "stopped".to_string(),
        message: "The active playback session was stopped and its temporary files were cleaned.".to_string(),
        title: "StreamNyaa".to_string(),
        torrent_id: None,
        playlist_url: None,
        media_url: None,
    })
}

#[tauri::command]
fn get_desktop_diagnostics(settings: Option<DesktopSettings>) -> Result<DiagnosticsStatus, String> {
    let runtime = runtime_status(settings);
    let cache = collect_cache_status(Path::new(&runtime.cache_dir));
    let recent_errors = manager()
        .lock()
        .map(|manager| manager.recent_errors.clone())
        .unwrap_or_default();
    Ok(DiagnosticsStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        runtime,
        cache,
        recent_errors,
        logs_dir: logs_root().to_string_lossy().to_string(),
        active_session: active_session_snapshot(),
    })
}

fn start_stream(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    let _operation_guard = playback_operation_lock()
        .try_lock()
        .map_err(|_| "Another playback action is already running. Wait for it to finish.".to_string())?;
    let source_inputs = playback_source_candidates(&request)?;

    let status = runtime_status(request.settings.clone());
    let title = playback_title(&request);
    if !status.ready {
        return Ok(PlaybackStatus {
            ok: false,
            state: "needs_setup".to_string(),
            message: status.message,
            title,
            torrent_id: None,
            playlist_url: None,
            media_url: None,
        });
    }

    let cache_dir = PathBuf::from(&status.cache_dir);
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Could not prepare StreamNyaa cache: {}", error))?;
    log_info(format!("Starting playback: {}", title));
    if let Some(free) = available_disk_bytes(&cache_dir) {
        if free < MIN_PLAYBACK_FREE_BYTES {
            return Ok(PlaybackStatus {
                ok: false,
                state: "low_storage".to_string(),
                message: "Your device is too low on free space for reliable streaming. Clear storage before starting playback.".to_string(),
                title,
                torrent_id: None,
                playlist_url: None,
                media_url: None,
            });
        }
    }
    if let Some(size) = parse_size_bytes(request.size.as_deref()) {
        if size > ABSOLUTE_STREAM_SOURCE_MAX_BYTES {
            return Ok(PlaybackStatus {
                ok: false,
                state: "large_source".to_string(),
                message: "This source is too large for reliable desktop streaming. Choose a smaller release.".to_string(),
                title,
                torrent_id: None,
                playlist_url: None,
                media_url: None,
            });
        }
        if !request.episode.trim().is_empty() && looks_like_batch_source(&request.title) && size > PER_SESSION_CACHE_MAX_BYTES {
            return Ok(PlaybackStatus {
                ok: false,
                state: "batch_source".to_string(),
                message: "This looks like a season or batch torrent. Choose an episode-specific source for reliable playback.".to_string(),
                title,
                torrent_id: None,
                playlist_url: None,
                media_url: None,
            });
        }
    }

    let session_dir = session_dir(&cache_dir);
    let engine_dir = session_dir.join("engine");
    let media_dir = session_dir.join("media");
    fs::create_dir_all(&session_dir)
        .map_err(|error| format!("Could not create stream session: {}", error))?;
    fs::create_dir_all(&engine_dir)
        .map_err(|error| format!("Could not prepare the session engine folder: {}", error))?;
    fs::create_dir_all(&media_dir)
        .map_err(|error| format!("Could not prepare the session media folder: {}", error))?;
    let stream_result = (|| -> Result<PlaybackStatus, String> {
        let player_path = status
            .player_path
            .as_deref()
            .ok_or_else(|| "Player path is missing.".to_string())?;
        let existing_player_ipc = {
            let mut guard = manager()
                .lock()
                .map_err(|_| "Playback manager is unavailable.".to_string())?;
            let existing_ipc = guard.player_ipc.clone();
            if let (Some(child), Some(ipc)) = (guard.player.as_mut(), existing_ipc) {
                if child.try_wait().ok().flatten().is_none() && player_ipc_ready(&ipc, 2, 60) {
                    Some(ipc)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(ipc) = existing_player_ipc.as_deref() {
            show_player_text(ipc, "Stopping previous stream...");
            stop_player_stream_only(ipc);
        }
        stop_active_session(true);
        cleanup_abandoned_sessions(&cache_dir, Some(&session_dir));
        prune_cache(&cache_dir, Some(&session_dir));

        let engine_path = status
            .torrent_engine_path
            .as_deref()
            .ok_or_else(|| "Torrent engine path is missing.".to_string())?;
        start_rqbit(engine_path, &engine_dir)?;
        if let Some(ipc) = existing_player_ipc.as_deref() {
            show_player_text(ipc, "Preparing torrent session...");
        }

        let add_path = format!(
            "/torrents?output_folder={}",
            percent_encode(&media_dir.to_string_lossy())
        );
        let mut add_payload = None;
        let last_index = source_inputs.len().saturating_sub(1);
        for (index, source_input) in source_inputs.iter().enumerate() {
            match rqbit_post(&add_path, source_input) {
                Ok(payload) => {
                    add_payload = Some(payload);
                    break;
                }
                Err(error) if index < last_index => {
                    log_info(format!(
                        "Local stream engine rejected {} candidate, trying fallback: {}",
                        describe_source_candidate(source_input),
                        error
                    ));
                }
                Err(error) => return Err(error),
            }
        }
        let add_payload = add_payload
            .ok_or_else(|| "Desktop streaming could not add a playable source.".to_string())?;
        let add_json: serde_json::Value = serde_json::from_str(&add_payload)
            .map_err(|error| format!("Could not parse stream engine response: {}", error))?;
        let torrent_id = add_json
            .get("id")
            .and_then(|id| {
                id.as_u64()
                    .map(|value| value.to_string())
                    .or_else(|| id.as_str().map(str::to_string))
            })
            .or(request.info_hash.clone())
            .ok_or_else(|| "Stream engine did not return a torrent id.".to_string())?;
        let playlist_url = format!("{}/torrents/{}/playlist", RQBIT_URL, percent_encode(&torrent_id));

        {
            let mut guard = manager()
                .lock()
                .map_err(|_| "Playback manager is unavailable.".to_string())?;
            guard.active = Some(ActiveSession {
                torrent_id: torrent_id.clone(),
                session_dir: session_dir.clone(),
                engine_path: engine_path.to_string(),
                media_url: String::new(),
            });
        }

        let player_ipc = launch_or_reuse_player(player_path, &cache_dir, &request, &title)?;
        show_player_text(&player_ipc, "Preparing torrent session...");
        let target = wait_for_stream_with_session_guard(
            &torrent_id,
            &request,
            Some(&player_ipc),
            &cache_dir,
            &session_dir,
        )?;

        {
            let mut guard = manager()
                .lock()
                .map_err(|_| "Playback manager is unavailable.".to_string())?;
            if let Some(active) = guard.active.as_mut() {
                active.media_url = target.media_url.clone();
            }
        }

        show_player_text(&player_ipc, "Opening the stream in the current player...");
        if !load_player_target(&player_ipc, &title, &target, request.resume_seconds) {
            let _ = relaunch_player_and_load_target(player_path, &cache_dir, &request, &title, &target)?;
        }

        log_info(format!("Playback handed off to player for torrent {}", torrent_id));

        Ok(PlaybackStatus {
            ok: true,
            state: "started".to_string(),
            message: "Stream session started. The same player window will be reused for the next episode.".to_string(),
            title: title.clone(),
            torrent_id: Some(torrent_id),
            playlist_url: Some(playlist_url),
            media_url: Some(target.media_url),
        })
    })();

    if let Err(error) = &stream_result {
        remember_error(format!("{}: {}", title, error));
        stop_active_session(true);
        safe_delete_dir(&session_dir);
        prune_cache(&cache_dir, None);
    }

    stream_result
}

#[tauri::command]
async fn play_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    tauri::async_runtime::spawn_blocking(move || start_stream(request))
        .await
        .map_err(|error| {
            let message = format!("Playback task could not finish: {}", error);
            remember_error(message.clone());
            message
        })?
}

#[tauri::command]
async fn get_local_playback_progress(
    request: PlaybackProgressRequest,
) -> Result<LocalPlaybackProgress, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let torrent_id = request.torrent_id.trim().to_string();
        if torrent_id.is_empty() {
            return Err("Torrent id is missing.".to_string());
        }
        let playlist_url = format!("{}/torrents/{}/playlist", RQBIT_URL, percent_encode(&torrent_id));
        let (media_url, player_ipc, still_active) = manager()
            .lock()
            .ok()
            .map(|guard| {
                if let Some(active) = guard
                    .active
                    .as_ref()
                    .filter(|active| active.torrent_id == torrent_id)
                {
                    (
                        Some(active.media_url.clone()).filter(|value| !value.trim().is_empty()),
                        guard.player_ipc.clone(),
                        true,
                    )
                } else {
                    (None, guard.player_ipc.clone(), false)
                }
            })
            .unwrap_or((None, None, false));
        let payload = match rqbit_get(&format!("/torrents/{}/stats/v1", percent_encode(&torrent_id)))
            .or_else(|_| rqbit_get(&format!("/torrents/{}", percent_encode(&torrent_id))))
        {
            Ok(payload) => payload,
            Err(error) => {
                if !still_active {
                    return Ok(LocalPlaybackProgress {
                        ok: false,
                        torrent_id,
                        state: "stopped".to_string(),
                        message: "The local playback session ended and its temporary files were cleaned.".to_string(),
                        progress: Some(100.0),
                        current_seconds: None,
                        duration_seconds: None,
                        downloaded_bytes: None,
                        total_bytes: None,
                        peers: None,
                        download_speed: None,
                        playlist_url,
                        media_url,
                    });
                }
                return Err(error);
            }
        };
        let json: serde_json::Value = serde_json::from_str(&payload)
            .map_err(|error| format!("Could not parse stream status: {}", error))?;
        let downloaded_bytes = find_number(&json, &["downloaded_bytes", "bytes_completed", "downloaded"]).map(|value| value as u64);
        let total_bytes = find_number(&json, &["total_bytes", "bytes_total", "size_bytes", "total_size"]).map(|value| value as u64);
        let progress = find_number(&json, &["progress", "progress_percent"]).or_else(|| {
            match (downloaded_bytes, total_bytes) {
                (Some(downloaded), Some(total)) if total > 0 => Some((downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)),
                _ => None,
            }
        });
        let peers = find_number(&json, &["peers", "num_peers", "live_peers", "peer_count"]).map(|value| value as u64);
        let download_speed = find_number(&json, &["download_speed", "download_rate", "down_rate"]);
        let current_seconds = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "time-pos"));
        let duration_seconds = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "duration"));
        let state = if progress.unwrap_or(0.0) > 2.0 {
            "ready"
        } else if downloaded_bytes.unwrap_or(0) >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES {
            "buffering"
        } else if peers.unwrap_or(0) > 0 {
            "connecting"
        } else {
            "fetching_metadata"
        };
        Ok(LocalPlaybackProgress {
            ok: true,
            torrent_id,
            state: state.to_string(),
            message: match state {
                "ready" => "Playback is active. The selected episode has enough buffer to keep going.".to_string(),
                "buffering" => "The player is open. StreamNyaa is still filling the playback buffer.".to_string(),
                "connecting" => "Peers are responding. StreamNyaa is building the first playback buffer.".to_string(),
                _ => "Reading torrent metadata and waiting for the first peers.".to_string(),
            },
            progress,
            current_seconds,
            duration_seconds,
            downloaded_bytes,
            total_bytes,
            peers,
            download_speed,
            playlist_url,
            media_url,
        })
    })
    .await
    .map_err(|error| format!("Progress task could not finish: {}", error))?
}

fn find_number(value: &serde_json::Value, keys: &[&str]) -> Option<f64> {
    match value {
        serde_json::Value::Object(map) => {
            for key in keys {
                if let Some(number) = map.get(*key).and_then(|item| item.as_f64()) {
                    return Some(number);
                }
                if let Some(number) = map.get(*key).and_then(|item| item.as_u64()) {
                    return Some(number as f64);
                }
            }
            map.values().find_map(|item| find_number(item, keys))
        }
        serde_json::Value::Array(items) => items.iter().find_map(|item| find_number(item, keys)),
        _ => None,
    }
}

fn fetch_desktop_source_api_blocking(url: String) -> Result<SourceApiResponse, String> {
    let trimmed_url = url.trim();
    if !trimmed_url.starts_with("https://www.streamnyaa.xyz/api/nyaa?") {
        return Err("Desktop source search can only call the StreamNyaa source API.".to_string());
    }
    if let Ok(mut cache) = source_cache().lock() {
        trim_memory_cache(&mut cache, SOURCE_API_CACHE_TTL_MS, SOURCE_API_CACHE_MAX_ENTRIES);
        if let Some(entry) = cache.get(trimmed_url) {
            log_info(format!("Desktop source API cache hit: {}", trimmed_url));
            return Ok(SourceApiResponse {
                data: entry.data.clone(),
                fetched_at: entry.fetched_at,
            });
        }
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(35))
        .user_agent("StreamNyaa Desktop/0.1")
        .build()
        .map_err(|error| format!("Could not prepare desktop source search: {}", error))?;
    let data = match client
        .get(trimmed_url)
        .send()
        .and_then(|response| response.error_for_status())
    {
        Ok(response) => response
            .json::<serde_json::Value>()
            .map_err(|error| format!("Could not read desktop source results: {}", error))?,
        Err(error) => {
            log_info(format!(
                "Desktop source API unavailable, using direct Nyaa fallback: {}",
                error
            ));
            fetch_nyaa_direct_from_api_url(trimmed_url)?
        }
    };
    let fetched_at = now_millis();
    if let Ok(mut cache) = source_cache().lock() {
        cache.insert(
            trimmed_url.to_string(),
            SourceCacheEntry {
                data: data.clone(),
                fetched_at,
            },
        );
        trim_memory_cache(&mut cache, SOURCE_API_CACHE_TTL_MS, SOURCE_API_CACHE_MAX_ENTRIES);
    }
    log_info(format!("Desktop source API fetched: {}", trimmed_url));
    Ok(SourceApiResponse { data, fetched_at })
}

#[tauri::command]
async fn fetch_desktop_source_api(url: String) -> Result<SourceApiResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_desktop_source_api_blocking(url))
        .await
        .map_err(|error| format!("Desktop source search task could not finish: {}", error))?
}

fn metadata_cache_key(request: &MetadataApiRequest) -> String {
    let body = request
        .body
        .as_ref()
        .map(serde_json::Value::to_string)
        .unwrap_or_default();
    format!(
        "{}|{}|{}",
        request.provider.trim().to_ascii_lowercase(),
        request.path.clone().unwrap_or_default(),
        body
    )
}

fn fetch_desktop_metadata_api_blocking(
    request: MetadataApiRequest,
) -> Result<SourceApiResponse, String> {
    let provider = request.provider.trim().to_ascii_lowercase();
    let ttl_ms = request.ttl_seconds.unwrap_or(900).max(30) as u128 * 1000;
    let cache_key = metadata_cache_key(&request);
    if let Ok(mut cache) = metadata_cache().lock() {
        trim_memory_cache(&mut cache, ttl_ms, METADATA_CACHE_MAX_ENTRIES);
        if let Some(entry) = cache.get(&cache_key) {
            log_info(format!("Desktop metadata cache hit: {}", provider));
            return Ok(SourceApiResponse {
                data: entry.data.clone(),
                fetched_at: entry.fetched_at,
            });
        }
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("StreamNyaa Desktop/0.1")
        .build()
        .map_err(|error| format!("Could not prepare desktop metadata request: {}", error))?;

    let data = match provider.as_str() {
        "anilist" => {
            let body = request
                .body
                .ok_or_else(|| "AniList desktop metadata request is missing a body.".to_string())?;
            client
                .post("https://graphql.anilist.co")
                .json(&body)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| format!("AniList desktop metadata request failed: {}", error))?
                .json::<serde_json::Value>()
                .map_err(|error| format!("Could not read AniList metadata: {}", error))?
        }
        "jikan" => {
            let path = request
                .path
                .as_deref()
                .map(str::trim)
                .ok_or_else(|| "Jikan desktop metadata request is missing a path.".to_string())?;
            if !path.starts_with('/') {
                return Err("Jikan desktop metadata path must start with '/'.".to_string());
            }
            let url = format!("https://api.jikan.moe/v4{}", path);
            client
                .get(&url)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| format!("Jikan desktop metadata request failed: {}", error))?
                .json::<serde_json::Value>()
                .map_err(|error| format!("Could not read Jikan metadata: {}", error))?
        }
        _ => return Err("Unsupported desktop metadata provider.".to_string()),
    };

    let fetched_at = now_millis();
    if let Ok(mut cache) = metadata_cache().lock() {
        cache.insert(
            cache_key,
            SourceCacheEntry {
                data: data.clone(),
                fetched_at,
            },
        );
        trim_memory_cache(&mut cache, ttl_ms, METADATA_CACHE_MAX_ENTRIES);
    }
    log_info(format!("Desktop metadata fetched: {}", provider));
    Ok(SourceApiResponse { data, fetched_at })
}

#[tauri::command]
async fn fetch_desktop_metadata_api(
    request: MetadataApiRequest,
) -> Result<SourceApiResponse, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_desktop_metadata_api_blocking(request))
        .await
        .map_err(|error| format!("Desktop metadata task could not finish: {}", error))?
}

fn startup_maintenance() {
    let _operation_guard = match playback_operation_lock().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let cache_dir = cache_root();
    let _ = fs::create_dir_all(&cache_dir);
    let status = runtime_status(None);
    stop_rqbit_server(status.torrent_engine_path.as_deref());
    cleanup_abandoned_sessions(&cache_dir, None);
    prune_cache(&cache_dir, None);
    clear_memory_caches();
    log_info(format!(
        "Startup maintenance completed for {}",
        cache_dir.to_string_lossy()
    ));
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            log_info("StreamNyaa desktop app starting");
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                let _ = window.set_icon(icon);
            }
            spawn_player_watchdog();
            thread::spawn(startup_maintenance);
            Ok(())
        })
        .on_window_event(|_, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Ok(_operation_guard) = playback_operation_lock().try_lock() {
                    let status = runtime_status(None);
                    close_player_if_needed();
                    stop_active_session(true);
                    stop_rqbit_server(status.torrent_engine_path.as_deref());
                    let cache_dir = PathBuf::from(status.cache_dir);
                    cleanup_abandoned_sessions(&cache_dir, None);
                    prune_cache(&cache_dir, None);
                    clear_memory_caches();
                } else {
                    close_player_if_needed();
                    let status = runtime_status(None);
                    stop_rqbit_server(status.torrent_engine_path.as_deref());
                }
                log_info("StreamNyaa desktop app closing");
            }
        })
        .invoke_handler(tauri::generate_handler![
            fetch_desktop_metadata_api,
            fetch_desktop_source_api,
            clear_playback_cache,
            get_desktop_diagnostics,
            get_desktop_runtime_status,
            get_local_playback_progress,
            play_local_torrent,
            stop_local_playback
        ])
        .run(tauri::generate_context!())
        .expect("failed to start StreamNyaa desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_cache_is_used_by_default() {
        let cache = resolved_cache_dir(None);
        assert!(cache.starts_with(env::temp_dir()));
        assert!(cache.ends_with("StreamNyaa"));
    }

    #[test]
    fn legacy_session_cleanup_removes_old_session_dirs() {
        let root = env::temp_dir().join(format!("streamnyaa-test-{}", now_millis()));
        let old_session = root.join("session-old");
        fs::create_dir_all(old_session.join("nested")).expect("create old session");
        fs::write(old_session.join("nested").join("piece.tmp"), b"abc").expect("write piece");

        cleanup_abandoned_sessions(&root, None);

        assert!(!old_session.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parse_size_bytes_understands_common_units() {
        assert_eq!(parse_size_bytes(Some("1.5 GiB")), Some(1610612736));
        assert_eq!(parse_size_bytes(Some("700 MiB")), Some(734003200));
        assert_eq!(parse_size_bytes(Some("1024 Bytes")), Some(1024));
    }

    #[test]
    fn playback_source_prefers_magnet_over_torrent_url() {
        let hash = "0123456789abcdef0123456789abcdef01234567";
        let request = PlaybackRequest {
            magnet: format!("magnet:?xt=urn:btih:{}", hash),
            torrent_url: Some("https://nyaa.si/download/12345.torrent".to_string()),
            info_hash: None,
            title: "Source".to_string(),
            anime_title: "Anime".to_string(),
            episode: "1".to_string(),
            size: None,
            poster: None,
            banner: None,
            resume_seconds: None,
            settings: None,
        };

        let candidates = playback_source_candidates(&request).expect("source input");
        assert_eq!(candidates[0], format!("magnet:?xt=urn:btih:{}", hash));
    }

    #[test]
    fn playback_source_converts_nyaa_view_url() {
        let hash = "0123456789abcdef0123456789abcdef01234567";
        let request = PlaybackRequest {
            magnet: format!("magnet:?xt=urn:btih:{}", hash),
            torrent_url: Some("https://nyaa.si/view/98765".to_string()),
            info_hash: None,
            title: "Source".to_string(),
            anime_title: "Anime".to_string(),
            episode: "1".to_string(),
            size: None,
            poster: None,
            banner: None,
            resume_seconds: None,
            settings: None,
        };

        let candidates = playback_source_candidates(&request).expect("source input");
        assert_eq!(candidates[1], "https://nyaa.si/download/98765.torrent");
    }

    #[test]
    fn playback_source_rebuilds_valid_magnet_from_info_hash() {
        let request = PlaybackRequest {
            magnet: "magnet:?xt=urn:btih:".to_string(),
            torrent_url: Some(String::new()),
            info_hash: Some("0123456789abcdef0123456789abcdef01234567".to_string()),
            title: "Example Source".to_string(),
            anime_title: "Anime".to_string(),
            episode: "7".to_string(),
            size: None,
            poster: None,
            banner: None,
            resume_seconds: None,
            settings: None,
        };

        let candidates = playback_source_candidates(&request).expect("source candidates");
        assert_eq!(candidates.len(), 1);
        assert!(candidates[0].starts_with("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"));
    }

    #[test]
    fn playback_source_rejects_missing_hash_and_url() {
        let request = PlaybackRequest {
            magnet: "magnet:?xt=urn:btih:".to_string(),
            torrent_url: Some(String::new()),
            info_hash: Some(String::new()),
            title: "Example Source".to_string(),
            anime_title: "Anime".to_string(),
            episode: "7".to_string(),
            size: None,
            poster: None,
            banner: None,
            resume_seconds: None,
            settings: None,
        };

        assert!(playback_source_candidates(&request).is_err());
    }

    #[test]
    fn direct_nyaa_parser_extracts_rss_items() {
        let xml = r#"
          <rss><channel><item>
            <title>[Group] Test Anime - 02 [1080p]</title>
            <link>https://nyaa.si/view/123</link>
            <guid>https://nyaa.si/view/123</guid>
            <pubDate>Thu, 28 May 2026 00:00:00 +0000</pubDate>
            <nyaa:seeders>42</nyaa:seeders>
            <nyaa:leechers>3</nyaa:leechers>
            <nyaa:downloads>900</nyaa:downloads>
            <nyaa:infoHash>ABC123</nyaa:infoHash>
            <nyaa:categoryId>1_2</nyaa:categoryId>
            <nyaa:category>Anime - English-translated</nyaa:category>
            <nyaa:size>1.2 GiB</nyaa:size>
            <nyaa:comments>0</nyaa:comments>
            <nyaa:trusted>Yes</nyaa:trusted>
            <nyaa:remake>No</nyaa:remake>
          </item></channel></rss>
        "#;

        let items = parse_nyaa_rss_items(xml, "Test Anime 02", "1_2", 1, 1);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["infoHash"], "ABC123");
        assert_eq!(items[0]["seeders"], "42");
    }

    #[test]
    fn query_param_decodes_values() {
        let url = "https://www.streamnyaa.xyz/api/nyaa?q=Test+Anime%2002&c=1_2";
        assert_eq!(query_param(url, "q").as_deref(), Some("Test Anime 02"));
        assert_eq!(query_param(url, "c").as_deref(), Some("1_2"));
    }

    #[test]
    fn diagnostics_report_temp_cache_and_logs_paths() {
        let diagnostics = get_desktop_diagnostics(None).expect("diagnostics");
        assert!(Path::new(&diagnostics.cache.cache_dir).starts_with(env::temp_dir()));
        let logs_root = logs_root();
        assert_eq!(PathBuf::from(&diagnostics.logs_dir), logs_root);
    }

    #[test]
    fn clear_playback_cache_removes_session_data_from_custom_temp_root() {
        let root = env::temp_dir().join(format!("streamnyaa-clear-test-{}", now_millis()));
        let session = root.join("session-to-clear");
        fs::create_dir_all(&session).expect("create session");
        fs::write(session.join("piece.tmp"), b"abc").expect("write piece");

        let settings = DesktopSettings {
            torrent_engine_path: None,
            player_path: None,
            mpv_path: None,
            cache_dir: Some(root.to_string_lossy().to_string()),
        };

        let status = clear_playback_cache(Some(settings)).expect("clear cache");
        assert_eq!(status.total_bytes, 0);
        assert!(!session.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn trim_memory_cache_drops_oldest_entries_over_limit() {
        let mut cache = HashMap::new();
        cache.insert(
            "old".to_string(),
            SourceCacheEntry {
                data: serde_json::json!({"value": 1}),
                fetched_at: 10,
            },
        );
        cache.insert(
            "mid".to_string(),
            SourceCacheEntry {
                data: serde_json::json!({"value": 2}),
                fetched_at: 20,
            },
        );
        cache.insert(
            "new".to_string(),
            SourceCacheEntry {
                data: serde_json::json!({"value": 3}),
                fetched_at: now_millis(),
            },
        );

        trim_memory_cache(&mut cache, u128::MAX, 2);

        assert_eq!(cache.len(), 2);
        assert!(!cache.contains_key("old"));
        assert!(cache.contains_key("mid"));
        assert!(cache.contains_key("new"));
    }
}
