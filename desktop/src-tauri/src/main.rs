#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    env, fs,
    hash::{Hash, Hasher},
    io::Write,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Mutex, MutexGuard, OnceLock, TryLockError,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const DESKTOP_OAUTH_EVENT: &str = "streamnyaa-desktop-oauth-callback";
const DESKTOP_OAUTH_SUPABASE_HOST: &str = "opteiijnvuwstpdjxwlk.supabase.co";

const RQBIT_URL: &str = "http://127.0.0.1:3030";
const PER_SESSION_CACHE_MAX_BYTES: u64 = 3 * 1024 * 1024 * 1024;
const MAX_SESSION_CACHE_BYTES: u64 = 12 * 1024 * 1024 * 1024;
const GLOBAL_CACHE_MAX_BYTES: u64 = 6 * 1024 * 1024 * 1024;
const LOW_SPACE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MIN_PLAYBACK_FREE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const INITIAL_PLAYBACK_BUFFER_BYTES: u64 = 24 * 1024 * 1024;
const MIN_INITIAL_PLAYBACK_BUFFER_BYTES: u64 = 6 * 1024 * 1024;
const STREAM_READY_TIMEOUT_MS: u128 = 20_000;
const STREAM_TARGET_HANDOFF_MS: u128 = 2_200;
const PLAYER_BUFFER_TARGET_SECONDS: f64 = 18.0;
const PLAYER_PIPE_PREFIX: &str = "streamnyaa-player";
const SOURCE_API_CACHE_TTL_MS: u128 = 1000 * 60 * 10;
const SOURCE_API_CACHE_MAX_ENTRIES: usize = 96;
const METADATA_CACHE_MAX_ENTRIES: usize = 64;
const LOG_FILE_LIMIT_BYTES: u64 = 512 * 1024;
const LOG_FILE_KEEP_COUNT: usize = 5;
const PLAYER_COVER_MAX_BYTES: u64 = 8 * 1024 * 1024;
const PLAYER_COVER_MAX_WIDTH: u32 = 320;
const PLAYER_COVER_MAX_HEIGHT: u32 = 440;
const PLAYER_COVER_BACKGROUND_WIDTH: u32 = 1920;
const PLAYER_COVER_BACKGROUND_HEIGHT: u32 = 1080;
const PLAYER_COVER_PRELOAD_TIMEOUT_MS: u64 = 1_600;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopOAuthCallback {
    url: String,
    action: String,
    next: String,
}

static DESKTOP_OAUTH_PENDING: OnceLock<Mutex<Option<DesktopOAuthCallback>>> = OnceLock::new();
static DESKTOP_OAUTH_LAST_FINGERPRINT: OnceLock<Mutex<Option<u64>>> = OnceLock::new();

fn pending_desktop_oauth_callback() -> &'static Mutex<Option<DesktopOAuthCallback>> {
    DESKTOP_OAUTH_PENDING.get_or_init(|| Mutex::new(None))
}

fn last_desktop_oauth_fingerprint() -> &'static Mutex<Option<u64>> {
    DESKTOP_OAUTH_LAST_FINGERPRINT.get_or_init(|| Mutex::new(None))
}

fn desktop_oauth_callback_fingerprint(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn sanitize_desktop_next_route(value: &str) -> String {
    let candidate = value.trim();
    if candidate.starts_with('/')
        && !candidate.starts_with("//")
        && !candidate.contains('\r')
        && !candidate.contains('\n')
    {
        candidate.to_string()
    } else {
        "/profile".to_string()
    }
}

fn parse_streamnyaa_auth_callback(url: &tauri::Url) -> Option<DesktopOAuthCallback> {
    if url.scheme() != "streamnyaa" || url.host_str() != Some("auth") || url.path() != "/callback" {
        return None;
    }
    let action = url
        .query_pairs()
        .find_map(|(key, value)| (key == "action").then(|| value.to_string()))?;
    if !matches!(action.as_str(), "login" | "recovery" | "confirmation") {
        return None;
    }
    let default_next = if action == "login" {
        "/profile"
    } else {
        "/login"
    };
    let next = url
        .query_pairs()
        .find_map(|(key, value)| (key == "next").then(|| value.to_string()))
        .map(|value| sanitize_desktop_next_route(&value))
        .unwrap_or_else(|| default_next.to_string());
    Some(DesktopOAuthCallback {
        url: url.to_string(),
        action,
        next,
    })
}

fn validate_google_oauth_authorize_url(url: &tauri::Url) -> Result<(), String> {
    if url.scheme() != "https"
        || url.host_str() != Some(DESKTOP_OAUTH_SUPABASE_HOST)
        || url.path().trim_end_matches('/') != "/auth/v1/authorize"
    {
        return Err("The desktop sign-in URL was rejected.".to_string());
    }

    let provider_is_google = url
        .query_pairs()
        .any(|(key, value)| key == "provider" && value == "google");
    let redirect_is_desktop_callback = url.query_pairs().any(|(key, value)| {
        if key != "redirect_to" {
            return false;
        }
        tauri::Url::parse(&value)
            .map(|redirect| {
                parse_streamnyaa_auth_callback(&redirect)
                    .map(|callback| callback.action == "login")
                    .unwrap_or(false)
            })
            .unwrap_or(false)
    });

    let account_chooser_requested = url
        .query_pairs()
        .any(|(key, value)| key == "prompt" && value == "select_account");

    if !provider_is_google || !redirect_is_desktop_callback || !account_chooser_requested {
        return Err("The desktop sign-in callback was rejected.".to_string());
    }
    Ok(())
}

#[tauri::command]
fn begin_desktop_google_oauth(app: tauri::AppHandle, authorize_url: String) -> Result<(), String> {
    let authorize_url = tauri::Url::parse(&authorize_url)
        .map_err(|_| "The desktop sign-in URL is invalid.".to_string())?;
    validate_google_oauth_authorize_url(&authorize_url)?;

    app.opener()
        .open_url(authorize_url.as_str(), None::<&str>)
        .map_err(|error| format!("Google sign-in could not open in your browser: {error}"))
}

fn publish_desktop_oauth_callback(app: &tauri::AppHandle, url: &tauri::Url) -> bool {
    let Some(callback) = parse_streamnyaa_auth_callback(url) else {
        return false;
    };
    let callback_fingerprint = desktop_oauth_callback_fingerprint(&callback.url);
    if let Ok(mut last_fingerprint) = last_desktop_oauth_fingerprint().lock() {
        if last_fingerprint.as_ref() == Some(&callback_fingerprint) {
            show_main_window(app);
            return true;
        }
        *last_fingerprint = Some(callback_fingerprint);
    }
    if let Ok(mut pending) = pending_desktop_oauth_callback().lock() {
        *pending = Some(callback.clone());
    }
    log_info("Desktop authentication callback received from system browser");
    let _ = app.emit(DESKTOP_OAUTH_EVENT, callback);
    show_main_window(app);
    true
}

#[tauri::command]
fn take_pending_desktop_oauth_callback() -> Option<DesktopOAuthCallback> {
    pending_desktop_oauth_callback()
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
}

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
    torrent_progress_percent: Option<f64>,
    buffer_percent: Option<f64>,
    buffered_seconds: Option<f64>,
    buffering: bool,
    buffer_advancing: bool,
    stall_seconds: u64,
    recovery_stage: String,
    current_seconds: Option<f64>,
    duration_seconds: Option<f64>,
    paused: Option<bool>,
    volume: Option<f64>,
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
    cache_limit_bytes: u64,
    media_url: Option<String>,
}

#[derive(Clone, Deserialize)]
struct DesktopSettings {
    torrent_engine_path: Option<String>,
    player_path: Option<String>,
    mpv_path: Option<String>,
    cache_dir: Option<String>,
}

#[derive(Clone, Deserialize)]
struct PlaybackRequest {
    magnet: String,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerMetadata {
    anime_title: String,
    episode_title: Option<String>,
    episode_number: Option<String>,
    cover_image: Option<String>,
    loading_image_path: Option<String>,
    loading_image_width: Option<u32>,
    loading_image_height: Option<u32>,
    cover_poster_bgra_path: Option<String>,
    cover_poster_width: Option<u32>,
    cover_poster_height: Option<u32>,
    cover_background_bgra_path: Option<String>,
    cover_background_width: Option<u32>,
    cover_background_height: Option<u32>,
}

struct PreparedCover {
    path: PathBuf,
    width: u32,
    height: u32,
    loading_image_path: PathBuf,
    loading_image_width: u32,
    loading_image_height: u32,
    background_path: PathBuf,
    background_width: u32,
    background_height: u32,
}

struct PlayerMetadataWrite {
    path: PathBuf,
    has_cover: bool,
    loading_image_path: Option<PathBuf>,
}

struct PlayerMetadataLaunch {
    path: Option<PathBuf>,
    cover_ready: bool,
    loading_image_path: Option<PathBuf>,
    pending_cover: Option<mpsc::Receiver<Result<PlayerMetadataWrite, String>>>,
}

#[derive(Deserialize)]
struct PlaybackProgressRequest {
    torrent_id: String,
}

#[derive(Deserialize)]
struct PlayerControlRequest {
    action: String,
    value: Option<f64>,
    key: Option<String>,
    text: Option<String>,
}

#[derive(Serialize)]
struct PlayerControlStatus {
    ok: bool,
    message: String,
    paused: Option<bool>,
    volume: Option<f64>,
    current_seconds: Option<f64>,
    duration_seconds: Option<f64>,
}

#[derive(Clone, Serialize)]
struct PlayerNextEpisodePayload {
    reason: String,
}

#[derive(Clone, Serialize)]
struct PlayerAutoNextPayload {
    enabled: bool,
}

#[derive(Clone, Serialize)]
struct PlayerSettingChangedPayload {
    key: String,
    value: String,
}

#[derive(Clone, Serialize)]
struct PlayerReadyPayload {
    ready: bool,
    at: u128,
}

#[derive(Clone, Serialize)]
struct PlayerRecoveryRequestPayload {
    action: String,
    media_key: String,
    position_seconds: f64,
}

#[derive(Clone)]
struct ActiveSession {
    torrent_id: String,
    session_dir: PathBuf,
    engine_path: String,
    media_url: String,
    cache_limit_bytes: u64,
}

#[derive(Clone)]
struct BufferTelemetrySample {
    torrent_id: String,
    buffered_seconds: f64,
    current_seconds: f64,
    downloaded_bytes: u64,
    last_advance_at: u128,
}

#[derive(Clone)]
struct ResolvedStreamTarget {
    media_url: String,
    subtitle_urls: Vec<String>,
    selected_file_indices: Vec<usize>,
    selected_file_name: String,
}

#[derive(Clone)]
struct PlaylistEntry {
    url: String,
    label: String,
    file_name: String,
    file_stem: String,
    file_index: Option<usize>,
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
    buffer_sample: Option<BufferTelemetrySample>,
}

#[derive(Clone)]
struct SourceCacheEntry {
    data: serde_json::Value,
    fetched_at: u128,
}

static MANAGER: OnceLock<Mutex<PlaybackManager>> = OnceLock::new();
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static PLAYBACK_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static LAST_NEXT_EPISODE_EVENT: OnceLock<Mutex<Option<(String, u128)>>> = OnceLock::new();
static PLAYBACK_SWITCH_GENERATION: AtomicU64 = AtomicU64::new(0);
static SOURCE_CACHE: OnceLock<Mutex<HashMap<String, SourceCacheEntry>>> = OnceLock::new();
static METADATA_CACHE: OnceLock<Mutex<HashMap<String, SourceCacheEntry>>> = OnceLock::new();
static SOURCE_HTTP_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static METADATA_HTTP_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static RQBIT_HTTP_CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
static NYAA_RATE_STATE: OnceLock<Mutex<(u128, u128)>> = OnceLock::new();
static PLAYER_PREFERENCES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static SUBTITLE_IMPORT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static APP_EXITING: AtomicBool = AtomicBool::new(false);
static TRAY_SUSPEND_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

fn manager() -> &'static Mutex<PlaybackManager> {
    MANAGER.get_or_init(|| Mutex::new(PlaybackManager::default()))
}

fn source_cache() -> &'static Mutex<HashMap<String, SourceCacheEntry>> {
    SOURCE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn playback_operation_lock() -> &'static Mutex<()> {
    PLAYBACK_OPERATION_LOCK.get_or_init(|| Mutex::new(()))
}

fn next_playback_generation() -> u64 {
    PLAYBACK_SWITCH_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

fn playback_generation_current(generation: u64) -> bool {
    PLAYBACK_SWITCH_GENERATION.load(Ordering::SeqCst) == generation
}

fn playback_superseded_error() -> String {
    "Playback source switch was superseded by a newer source.".to_string()
}

fn ensure_playback_generation_current(generation: u64) -> Result<(), String> {
    if playback_generation_current(generation) {
        Ok(())
    } else {
        Err(playback_superseded_error())
    }
}

fn acquire_playback_operation_for_switch(
    generation: u64,
    settings: Option<DesktopSettings>,
    title: &str,
) -> Result<MutexGuard<'static, ()>, String> {
    let started_at = Instant::now();
    let mut cancellation_requested = false;
    loop {
        match playback_operation_lock().try_lock() {
            Ok(guard) => return Ok(guard),
            Err(TryLockError::WouldBlock) => {
                ensure_playback_generation_current(generation)?;
                if !cancellation_requested && started_at.elapsed() > Duration::from_millis(250) {
                    cancellation_requested = true;
                    log_info(format!(
                        "Cancelling previous loading source before starting generation {}",
                        generation
                    ));
                    cancel_previous_loading_source(settings.clone(), title);
                }
                if started_at.elapsed() > Duration::from_secs(45) {
                    return Err(
                        "The previous source did not release the local stream engine in time."
                            .to_string(),
                    );
                }
                thread::sleep(Duration::from_millis(75));
            }
            Err(TryLockError::Poisoned(_)) => {
                return Err("Playback operation lock is unavailable.".to_string());
            }
        }
    }
}

fn metadata_cache() -> &'static Mutex<HashMap<String, SourceCacheEntry>> {
    METADATA_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn source_http_client() -> reqwest::blocking::Client {
    SOURCE_HTTP_CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_millis(2_500))
                .timeout(Duration::from_secs(8))
                .pool_idle_timeout(Duration::from_secs(90))
                .pool_max_idle_per_host(8)
                .tcp_keepalive(Duration::from_secs(30))
                .user_agent(concat!("StreamNyaa Desktop/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("desktop source HTTP client")
        })
        .clone()
}

fn metadata_http_client() -> reqwest::blocking::Client {
    METADATA_HTTP_CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_millis(2_500))
                .timeout(Duration::from_secs(8))
                .pool_idle_timeout(Duration::from_secs(90))
                .pool_max_idle_per_host(8)
                .tcp_keepalive(Duration::from_secs(30))
                .user_agent(concat!("StreamNyaa Desktop/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("desktop metadata HTTP client")
        })
        .clone()
}

fn wait_for_nyaa_request_slot() -> Result<(), String> {
    let state = NYAA_RATE_STATE.get_or_init(|| Mutex::new((0, 0)));
    let mut guard = state
        .lock()
        .map_err(|_| "Direct source rate coordinator is unavailable.".to_string())?;
    let now = now_millis();
    if guard.1 > now {
        return Err(format!(
            "Direct Nyaa source service is cooling down for {} seconds after rate limiting.",
            (guard.1.saturating_sub(now) / 1000).max(1)
        ));
    }
    let earliest = guard.0.saturating_add(475);
    if earliest > now {
        thread::sleep(Duration::from_millis((earliest - now) as u64));
    }
    guard.0 = now_millis();
    Ok(())
}

fn note_nyaa_response(status: reqwest::StatusCode) {
    let state = NYAA_RATE_STATE.get_or_init(|| Mutex::new((0, 0)));
    if let Ok(mut guard) = state.lock() {
        if status.as_u16() == 429 {
            guard.1 = now_millis().saturating_add(45_000);
        } else if status.is_success() {
            guard.1 = 0;
        }
    }
}

fn fetch_nyaa_rss(client: &reqwest::blocking::Client, rss_url: &str) -> Result<String, String> {
    wait_for_nyaa_request_slot()?;
    let response = client
        .get(rss_url)
        .send()
        .map_err(|error| format!("Direct Nyaa source search failed: {}", error))?;
    let status = response.status();
    note_nyaa_response(status);
    if !status.is_success() {
        return Err(format!(
            "Direct Nyaa source search returned status {}",
            status
        ));
    }
    response
        .text()
        .map_err(|error| format!("Could not read direct Nyaa source results: {}", error))
}

fn send_json_with_retry(
    request: reqwest::blocking::RequestBuilder,
    label: &str,
) -> Result<serde_json::Value, String> {
    let mut last_error = String::new();
    for attempt in 0..2 {
        let Some(next_request) = request.try_clone() else {
            return Err(format!("{} request could not be retried.", label));
        };
        match next_request.send() {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    return response
                        .json::<serde_json::Value>()
                        .map_err(|error| format!("Could not read {} response: {}", label, error));
                }
                last_error = format!("{} returned status {}", label, status);
                if status.as_u16() != 429 && !status.is_server_error() {
                    break;
                }
            }
            Err(error) => last_error = format!("{} request failed: {}", label, error),
        }
        if attempt == 0 {
            thread::sleep(Duration::from_millis(180));
        }
    }
    Err(last_error)
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
        if let Ok(exe) = env::current_exe() {
            if let Some(dir) = exe.parent() {
                paths.push(
                    dir.join("bin")
                        .join("mpv.exe")
                        .to_string_lossy()
                        .to_string(),
                );
                paths.push(
                    dir.join("resources")
                        .join("bin")
                        .join("mpv.exe")
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        paths.push(manifest_bin.join("mpv.exe").to_string_lossy().to_string());
        push_env_candidate(
            &mut paths,
            env::var("ProgramW6432").ok(),
            r"MPV Player\mpv.exe",
        );
        push_env_candidate(
            &mut paths,
            env::var("ProgramFiles").ok(),
            r"MPV Player\mpv.exe",
        );
        push_env_candidate(&mut paths, env::var("ProgramFiles").ok(), r"mpv\mpv.exe");
        push_env_candidate(
            &mut paths,
            env::var("ProgramFiles(x86)").ok(),
            r"MPV Player\mpv.exe",
        );
        push_env_candidate(
            &mut paths,
            env::var("LOCALAPPDATA").ok(),
            r"Microsoft\WinGet\Links\mpv.exe",
        );
    }

    if command.eq_ignore_ascii_case("rqbit") {
        if let Ok(exe) = env::current_exe() {
            if let Some(dir) = exe.parent() {
                paths.push(
                    dir.join("bin")
                        .join("rqbit.exe")
                        .to_string_lossy()
                        .to_string(),
                );
                paths.push(
                    dir.join("resources")
                        .join("bin")
                        .join("rqbit.exe")
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
        paths.push(manifest_bin.join("rqbit.exe").to_string_lossy().to_string());
        push_env_candidate(
            &mut paths,
            env::var("LOCALAPPDATA").ok(),
            r"Microsoft\WinGet\Links\rqbit.exe",
        );
    }

    paths
}

fn bundled_player_skin_script() -> Option<PathBuf> {
    let manifest_bin = Path::new(env!("CARGO_MANIFEST_DIR")).join("bin");
    let mut paths = Vec::new();

    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("bin").join("streamnyaa-player.lua"));
            paths.push(
                dir.join("resources")
                    .join("bin")
                    .join("streamnyaa-player.lua"),
            );
        }
    }

    paths.push(manifest_bin.join("streamnyaa-player.lua"));

    paths.into_iter().find(|path| path.exists())
}

fn configured_command(
    settings_value: Option<String>,
    env_key: &str,
    fallback: &str,
    allowed_names: &[&str],
) -> Option<String> {
    if let Some(value) = clean_value(settings_value) {
        if let Some(command) = validated_command_candidate(&value, allowed_names) {
            return Some(command);
        }
    }

    if let Some(value) = clean_value(env::var(env_key).ok()) {
        if let Some(command) = validated_command_candidate(&value, allowed_names) {
            return Some(command);
        }
    }

    for path in candidate_paths(fallback) {
        if let Some(command) = validated_command_candidate(&path, allowed_names) {
            return Some(command);
        }
    }

    command_from_path(fallback).or_else(|| Some(fallback.to_string()))
}

fn allowed_command(value: &str, allowed_names: &[&str]) -> bool {
    let name = command_name(value);
    allowed_names.iter().any(|allowed| name == *allowed)
}

fn validated_command_candidate(value: &str, allowed_names: &[&str]) -> Option<String> {
    if !allowed_command(value, allowed_names) {
        return None;
    }
    if looks_like_path(value) {
        return Path::new(value).is_file().then(|| value.to_string());
    }
    command_from_path(value)
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

fn player_preferences_path() -> PathBuf {
    if let Ok(local) = env::var("LOCALAPPDATA") {
        return PathBuf::from(local)
            .join("StreamNyaa")
            .join("player-preferences.json");
    }
    cache_root().join("player-preferences.json")
}

fn load_player_preferences_from_disk() -> HashMap<String, String> {
    fs::read_to_string(player_preferences_path())
        .ok()
        .and_then(|content| serde_json::from_str::<HashMap<String, String>>(&content).ok())
        .unwrap_or_default()
}

fn player_preferences() -> &'static Mutex<HashMap<String, String>> {
    PLAYER_PREFERENCES.get_or_init(|| Mutex::new(load_player_preferences_from_disk()))
}

fn persist_player_preference(key: &str, value: &str) {
    let key = key.trim();
    if key.is_empty() {
        return;
    }
    let snapshot = {
        let Ok(mut preferences) = player_preferences().lock() else {
            log_info("Could not lock the desktop player preference cache");
            return;
        };
        preferences.insert(key.to_string(), value.to_string());
        preferences.clone()
    };
    let path = player_preferences_path();
    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            log_info(format!(
                "Could not create player preference folder: {}",
                error
            ));
            return;
        }
    }
    let temporary = path.with_extension("json.tmp");
    let Ok(payload) = serde_json::to_vec_pretty(&snapshot) else {
        return;
    };
    if fs::write(&temporary, payload).is_err() {
        return;
    }
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
    if let Err(error) = fs::rename(&temporary, &path) {
        log_info(format!("Could not persist player preferences: {}", error));
    }
}

fn persisted_player_preference(key: &str) -> Option<String> {
    player_preferences().lock().ok()?.get(key).cloned()
}

fn add_persisted_subtitle_preferences(command: &mut Command) {
    let custom = persisted_player_preference("subtitleStyle.custom")
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "true" | "1" | "yes" | "on"
            )
        })
        .unwrap_or(false);
    command.arg(if custom {
        "--sub-ass-override=force"
    } else {
        "--sub-ass-override=no"
    });

    match persisted_player_preference("subtitleStyle.fontSize").as_deref() {
        Some("small") => {
            command.arg("--sub-font-size=34").arg("--sub-scale=0.86");
        }
        Some("large") => {
            command.arg("--sub-font-size=50").arg("--sub-scale=1.05");
        }
        Some("extra_large") => {
            command.arg("--sub-font-size=58").arg("--sub-scale=1.18");
        }
        _ => {
            command.arg("--sub-font-size=42").arg("--sub-scale=0.92");
        }
    }
    match persisted_player_preference("subtitleStyle.position").as_deref() {
        Some("low") => {
            command.arg("--sub-pos=96").arg("--sub-margin-y=20");
        }
        Some("high") => {
            command.arg("--sub-pos=78").arg("--sub-margin-y=68");
        }
        _ => {
            command.arg("--sub-pos=90").arg("--sub-margin-y=34");
        }
    }
    let color = match persisted_player_preference("subtitleStyle.textColor").as_deref() {
        Some("yellow") => "#FFD86B",
        Some("red") => "#FF4B55",
        Some("cyan") => "#4DD0E1",
        _ => "#FFF8F7",
    };
    command.arg(format!("--sub-color={}", color));
    let border_size = match persisted_player_preference("subtitleStyle.outline").as_deref() {
        Some("none") => "0",
        Some("thin") => "1.3",
        Some("thick") => "4.0",
        _ => "2.5",
    };
    command
        .arg(format!("--sub-border-size={}", border_size))
        .arg("--sub-border-color=#06070A");
    let shadow_offset = match persisted_player_preference("subtitleStyle.shadow").as_deref() {
        Some("soft") => "1.2",
        Some("strong") => "2.8",
        _ => "0",
    };
    command.arg(format!("--sub-shadow-offset={}", shadow_offset));
    match persisted_player_preference("subtitleStyle.background").as_deref() {
        Some("light") => {
            command
                .arg("--sub-back-color=#33000000")
                .arg("--sub-border-style=background-box");
        }
        Some("dark") => {
            command
                .arg("--sub-back-color=#AA000000")
                .arg("--sub-border-style=background-box");
        }
        _ => {
            command
                .arg("--sub-back-color=#00000000")
                .arg("--sub-border-style=outline-and-shadow");
        }
    }
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
        let _ = writeln!(
            file,
            "[{}] [{}] {}",
            unix_timestamp(),
            level,
            message.trim()
        );
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
    full.starts_with(
        env::temp_dir()
            .canonicalize()
            .unwrap_or_else(|_| env::temp_dir()),
    )
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

fn source_cache_identity(request: &PlaybackRequest) -> String {
    let explicit = request.info_hash.as_deref().unwrap_or("").trim();
    let source = if explicit.is_empty() {
        request
            .magnet
            .split("btih:")
            .nth(1)
            .and_then(|value| value.split('&').next())
            .unwrap_or("")
    } else {
        explicit
    };
    let normalized = source
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .take(64)
        .collect::<String>()
        .to_ascii_lowercase();
    if normalized.len() >= 12 {
        normalized
    } else {
        format!("transient-{}", now_millis())
    }
}

fn session_dir(cache_dir: &Path, request: &PlaybackRequest) -> PathBuf {
    cache_dir.join(format!("source-{}", source_cache_identity(request)))
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
    let total_bytes = entries
        .iter()
        .fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));
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

fn trim_memory_cache(
    cache: &mut HashMap<String, SourceCacheEntry>,
    ttl_ms: u128,
    max_entries: usize,
) {
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
            cache_limit_bytes: active.cache_limit_bytes,
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

fn cleanup_transient_sessions(cache_dir: &Path, keep: Option<&Path>) {
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
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if path.is_dir() && (name.starts_with("session-") || name.starts_with("source-transient-"))
        {
            safe_delete_dir(&path);
        }
    }
}

fn prune_cache(cache_dir: &Path, active: Option<&Path>) {
    let _ = fs::create_dir_all(cache_dir);
    let entries = cache_entries(cache_dir);
    let mut total = entries
        .iter()
        .fold(0u64, |sum, entry| sum.saturating_add(entry.size_bytes));
    let free_bytes = available_disk_bytes(cache_dir);
    let target_bytes = if free_bytes
        .map(|free| free < LOW_SPACE_BYTES)
        .unwrap_or(false)
    {
        GLOBAL_CACHE_MAX_BYTES.min(2 * 1024 * 1024 * 1024)
    } else {
        GLOBAL_CACHE_MAX_BYTES
    };

    for entry in entries.clone() {
        if total <= target_bytes {
            break;
        }
        let path = PathBuf::from(&entry.path);
        if active.map(|active| active == path).unwrap_or(false) {
            continue;
        }
        if path.is_dir() {
            safe_delete_dir(&path);
        } else {
            safe_delete_file(&path);
        }
        total = total.saturating_sub(entry.size_bytes);
    }

    let _ = active;
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

fn rqbit_http_client() -> reqwest::blocking::Client {
    RQBIT_HTTP_CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_millis(900))
                .pool_idle_timeout(Duration::from_secs(120))
                .pool_max_idle_per_host(12)
                .tcp_keepalive(Duration::from_secs(30))
                .user_agent(concat!(
                    "StreamNyaa Desktop Engine/",
                    env!("CARGO_PKG_VERSION")
                ))
                .build()
                .expect("local stream HTTP client")
        })
        .clone()
}

fn rqbit_get(path: &str) -> Result<String, String> {
    let url = format!("{}{}", RQBIT_URL, path);
    rqbit_http_client()
        .get(url)
        .timeout(Duration::from_secs(35))
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Local stream request failed: {}", error))?
        .text()
        .map_err(|error| format!("Could not read local stream response: {}", error))
}

fn rqbit_post(path: &str, body: &str) -> Result<String, String> {
    let url = format!("{}{}", RQBIT_URL, path);
    let response = rqbit_http_client()
        .post(url)
        .timeout(Duration::from_secs(60))
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

fn rqbit_post_json(path: &str, body: &serde_json::Value) -> Result<String, String> {
    let url = format!("{}{}", RQBIT_URL, path);
    let response = rqbit_http_client()
        .post(url)
        .timeout(Duration::from_secs(12))
        .json(body)
        .send()
        .map_err(|error| format!("Could not update local stream selection: {}", error))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Could not read local stream selection response: {}", error))?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("Local stream selection failed: HTTP {}", status))
    }
}

fn rqbit_delete(path: &str) -> Result<(), String> {
    let url = format!("{}{}", RQBIT_URL, path);
    rqbit_http_client()
        .delete(url)
        .timeout(Duration::from_secs(20))
        .send()
        .and_then(|response| response.error_for_status())
        .map(|_| ())
        .map_err(|error| format!("Could not stop local stream: {}", error))
}

fn rqbit_ready() -> bool {
    let url = format!("{}/", RQBIT_URL);
    rqbit_http_client()
        .get(url)
        .timeout(Duration::from_millis(700))
        .send()
        .ok()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn wait_for_rqbit_shutdown() -> bool {
    for _ in 0..24 {
        if !rqbit_ready() {
            return true;
        }
        thread::sleep(Duration::from_millis(125));
    }
    !rqbit_ready()
}

fn start_rqbit(engine_path: &str, cache_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not prepare StreamNyaa cache: {}", error))?;
    if rqbit_ready() {
        log_info("Stopping stale local stream engine before starting a clean session");
        stop_rqbit_server(Some(engine_path));
        if !wait_for_rqbit_shutdown() {
            return Err(
                "The previous local stream engine did not shut down cleanly. Close StreamNyaa and try again."
                    .to_string(),
            );
        }
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

fn path_for_player_option(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn player_metadata_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join("player-meta")
}

fn player_metadata_path(cache_dir: &Path) -> PathBuf {
    player_metadata_dir(cache_dir).join("current.json")
}

fn player_subtitle_import_request_path(cache_dir: &Path) -> PathBuf {
    player_metadata_dir(cache_dir).join("subtitle-import.request")
}

fn player_next_episode_request_path(cache_dir: &Path) -> PathBuf {
    player_metadata_dir(cache_dir).join("next-episode.request")
}

fn player_setting_request_path(cache_dir: &Path) -> PathBuf {
    player_metadata_dir(cache_dir).join("player-setting.request")
}

fn prepare_player_subtitle_import_request(cache_dir: &Path) -> Result<PathBuf, String> {
    let request_file = player_subtitle_import_request_path(cache_dir);
    if let Some(parent) = request_file.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not prepare subtitle import bridge: {}", error))?;
    }
    let _ = fs::remove_file(&request_file);
    Ok(request_file)
}

fn prepare_player_next_episode_request(cache_dir: &Path) -> Result<PathBuf, String> {
    let request_file = player_next_episode_request_path(cache_dir);
    if let Some(parent) = request_file.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not prepare next-episode bridge: {}", error))?;
    }
    let _ = fs::remove_file(&request_file);
    Ok(request_file)
}

fn prepare_player_setting_request(cache_dir: &Path) -> Result<PathBuf, String> {
    let request_file = player_setting_request_path(cache_dir);
    if let Some(parent) = request_file.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not prepare player-setting bridge: {}", error))?;
    }
    let _ = fs::remove_file(&request_file);
    Ok(request_file)
}

fn playback_cover_source(request: &PlaybackRequest) -> Option<String> {
    [request.banner.as_deref(), request.poster.as_deref()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn playback_cover_source_kind(request: &PlaybackRequest, source: &str) -> &'static str {
    if request
        .banner
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value == source)
        .is_some()
    {
        "banner"
    } else if request
        .poster
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value == source)
        .is_some()
    {
        "poster"
    } else {
        "cover"
    }
}

fn is_remote_url(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    value.starts_with("https://") || value.starts_with("http://")
}

fn cover_local_path(value: &str) -> PathBuf {
    let trimmed = value.trim();
    let without_file_scheme = trimmed
        .strip_prefix("file:///")
        .or_else(|| trimmed.strip_prefix("file://"))
        .unwrap_or(trimmed);
    PathBuf::from(without_file_scheme)
}

fn read_cover_bytes(source: &str) -> Result<Vec<u8>, String> {
    if is_remote_url(source) {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|error| format!("Could not prepare cover downloader: {}", error))?;
        let response = client
            .get(source)
            .send()
            .map_err(|error| format!("Could not download cover image: {}", error))?
            .error_for_status()
            .map_err(|error| format!("Cover image request failed: {}", error))?;
        if response.content_length().unwrap_or(0) > PLAYER_COVER_MAX_BYTES {
            return Err("Cover image is too large.".to_string());
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("Could not read cover image: {}", error))?;
        if bytes.len() as u64 > PLAYER_COVER_MAX_BYTES {
            return Err("Cover image is too large.".to_string());
        }
        return Ok(bytes.to_vec());
    }

    let path = cover_local_path(source);
    let size = fs::metadata(&path)
        .map_err(|error| format!("Could not read cover image metadata: {}", error))?
        .len();
    if size > PLAYER_COVER_MAX_BYTES {
        return Err("Cover image is too large.".to_string());
    }
    fs::read(&path).map_err(|error| format!("Could not read cover image: {}", error))
}

fn rgba_to_bgra(image: &image::RgbaImage) -> Vec<u8> {
    let mut bgra = Vec::with_capacity((image.width() * image.height() * 4) as usize);
    for pixel in image.pixels() {
        bgra.push(pixel[2]);
        bgra.push(pixel[1]);
        bgra.push(pixel[0]);
        bgra.push(pixel[3]);
    }
    bgra
}

fn prepare_cover_background(decoded: &image::RgbaImage) -> image::RgbaImage {
    let (source_width, source_height) = decoded.dimensions();
    let target_width = PLAYER_COVER_BACKGROUND_WIDTH;
    let target_height = PLAYER_COVER_BACKGROUND_HEIGHT;
    let scale = (target_width as f64 / source_width as f64)
        .max(target_height as f64 / source_height as f64)
        .max(1.0);
    let resized_width = ((source_width as f64 * scale).round() as u32).max(target_width);
    let resized_height = ((source_height as f64 * scale).round() as u32).max(target_height);
    let resized =
        image::imageops::resize(decoded, resized_width, resized_height, FilterType::Lanczos3);
    let crop_x = resized_width.saturating_sub(target_width) / 2;
    let crop_y = resized_height.saturating_sub(target_height) / 2;
    let cropped =
        image::imageops::crop_imm(&resized, crop_x, crop_y, target_width, target_height).to_image();
    let mut background = image::imageops::blur(&cropped, 7.0);
    for pixel in background.pixels_mut() {
        pixel[0] = ((pixel[0] as f32 * 0.62) + 12.0).clamp(0.0, 255.0) as u8;
        pixel[1] = (pixel[1] as f32 * 0.50).clamp(0.0, 255.0) as u8;
        pixel[2] = ((pixel[2] as f32 * 0.52) + 8.0).clamp(0.0, 255.0) as u8;
        pixel[3] = 255;
    }
    background
}

fn prepare_player_cover(
    cache_dir: &Path,
    request: &PlaybackRequest,
) -> Result<Option<PreparedCover>, String> {
    let Some(source) = playback_cover_source(request) else {
        return Ok(None);
    };
    let source_kind = playback_cover_source_kind(request, &source);
    log_info(format!(
        "Player cover source selected: type={} source={}",
        source_kind, source
    ));

    let bytes = read_cover_bytes(&source)?;
    let decoded = image::load_from_memory(&bytes)
        .map_err(|error| format!("Could not decode cover image: {}", error))?
        .to_rgba8();
    let (source_width, source_height) = decoded.dimensions();
    if source_width == 0 || source_height == 0 {
        return Ok(None);
    }

    let scale = (PLAYER_COVER_MAX_WIDTH as f64 / source_width as f64)
        .min(PLAYER_COVER_MAX_HEIGHT as f64 / source_height as f64)
        .min(1.0);
    let width = ((source_width as f64 * scale).round() as u32).max(1);
    let height = ((source_height as f64 * scale).round() as u32).max(1);
    let background = prepare_cover_background(&decoded);
    let resized = if width == source_width && height == source_height {
        decoded.clone()
    } else {
        image::imageops::resize(&decoded, width, height, FilterType::Lanczos3)
    };

    let metadata_dir = player_metadata_dir(cache_dir);
    fs::create_dir_all(&metadata_dir)
        .map_err(|error| format!("Could not prepare player metadata folder: {}", error))?;
    let loading_image_path = metadata_dir.join("loading-cover.jpg");
    let loading_image_rgb = image::DynamicImage::ImageRgba8(background.clone()).to_rgb8();
    let loading_image_file = fs::File::create(&loading_image_path)
        .map_err(|error| format!("Could not create cover loading image: {}", error))?;
    image::codecs::jpeg::JpegEncoder::new_with_quality(loading_image_file, 90)
        .encode_image(&image::DynamicImage::ImageRgb8(loading_image_rgb))
        .map_err(|error| format!("Could not write cover loading image: {}", error))?;
    let loading_image_size = fs::metadata(&loading_image_path)
        .map_err(|error| format!("Could not verify cover loading image: {}", error))?
        .len();
    log_info(format!(
        "Player cover loading image ready: path={} type={} dimensions={}x{} size={} bytes",
        loading_image_path.to_string_lossy(),
        source_kind,
        background.width(),
        background.height(),
        loading_image_size
    ));
    let cover_path = metadata_dir.join("current-cover.bgra");
    fs::write(&cover_path, rgba_to_bgra(&resized))
        .map_err(|error| format!("Could not write player cover overlay: {}", error))?;
    let background_path = metadata_dir.join("current-cover-background.bgra");
    fs::write(&background_path, rgba_to_bgra(&background))
        .map_err(|error| format!("Could not write player cover background: {}", error))?;
    let cover_expected_bytes = resized.width() as u64 * resized.height() as u64 * 4;
    let cover_actual_bytes = fs::metadata(&cover_path)
        .map_err(|error| format!("Could not verify player cover overlay: {}", error))?
        .len();
    if cover_actual_bytes != cover_expected_bytes {
        return Err(format!(
            "Player cover overlay byte size mismatch: got {}, expected {}.",
            cover_actual_bytes, cover_expected_bytes
        ));
    }
    let background_expected_bytes = background.width() as u64 * background.height() as u64 * 4;
    let background_actual_bytes = fs::metadata(&background_path)
        .map_err(|error| format!("Could not verify player cover background: {}", error))?
        .len();
    if background_actual_bytes != background_expected_bytes {
        return Err(format!(
            "Player cover background byte size mismatch: got {}, expected {}.",
            background_actual_bytes, background_expected_bytes
        ));
    }
    log_info(format!(
        "Player cover BGRA ready: poster={}x{} {} bytes, background={}x{} {} bytes",
        resized.width(),
        resized.height(),
        cover_actual_bytes,
        background.width(),
        background.height(),
        background_actual_bytes
    ));

    Ok(Some(PreparedCover {
        path: cover_path,
        width: resized.width(),
        height: resized.height(),
        loading_image_path,
        loading_image_width: background.width(),
        loading_image_height: background.height(),
        background_path,
        background_width: background.width(),
        background_height: background.height(),
    }))
}

fn player_metadata_for(
    request: &PlaybackRequest,
    title: &str,
    cover: Option<&PreparedCover>,
) -> PlayerMetadata {
    PlayerMetadata {
        anime_title: clean_value(Some(request.anime_title.clone()))
            .unwrap_or_else(|| title.to_string()),
        episode_title: clean_value(Some(request.title.clone())),
        episode_number: clean_value(Some(request.episode.clone())),
        cover_image: playback_cover_source(request),
        loading_image_path: cover.map(|item| path_for_player_option(&item.loading_image_path)),
        loading_image_width: cover.map(|item| item.loading_image_width),
        loading_image_height: cover.map(|item| item.loading_image_height),
        cover_poster_bgra_path: cover.map(|item| path_for_player_option(&item.path)),
        cover_poster_width: cover.map(|item| item.width),
        cover_poster_height: cover.map(|item| item.height),
        cover_background_bgra_path: cover.map(|item| path_for_player_option(&item.background_path)),
        cover_background_width: cover.map(|item| item.background_width),
        cover_background_height: cover.map(|item| item.background_height),
    }
}

fn write_player_metadata_file(
    cache_dir: &Path,
    metadata: &PlayerMetadata,
) -> Result<PathBuf, String> {
    let metadata_dir = player_metadata_dir(cache_dir);
    fs::create_dir_all(&metadata_dir)
        .map_err(|error| format!("Could not prepare player metadata folder: {}", error))?;

    let path = player_metadata_path(cache_dir);
    let bytes = serde_json::to_vec_pretty(metadata)
        .map_err(|error| format!("Could not serialize player metadata: {}", error))?;
    fs::write(&path, bytes)
        .map_err(|error| format!("Could not write player metadata: {}", error))?;
    Ok(path)
}

fn write_player_metadata(
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
) -> Result<PathBuf, String> {
    let metadata = player_metadata_for(request, title, None);
    write_player_metadata_file(cache_dir, &metadata)
}

fn write_player_metadata_with_cover(
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
) -> Result<PlayerMetadataWrite, String> {
    let cover = match prepare_player_cover(cache_dir, request) {
        Ok(cover) => cover,
        Err(error) => {
            log_info(format!("Player cover fallback: {}", error));
            None
        }
    };
    let has_cover = cover.is_some();
    let loading_image_path = cover.as_ref().map(|item| item.loading_image_path.clone());
    let metadata = player_metadata_for(request, title, cover.as_ref());
    let path = write_player_metadata_file(cache_dir, &metadata)?;
    Ok(PlayerMetadataWrite {
        path,
        has_cover,
        loading_image_path,
    })
}

fn prepare_player_metadata_for_launch(
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
) -> PlayerMetadataLaunch {
    let Some(_) = playback_cover_source(request) else {
        let path = write_player_metadata(cache_dir, request, title)
            .map_err(|error| log_info(format!("Player metadata fallback: {}", error)))
            .ok();
        return PlayerMetadataLaunch {
            path,
            cover_ready: false,
            loading_image_path: None,
            pending_cover: None,
        };
    };

    let (tx, rx) = mpsc::channel();
    let cache_dir_for_cover = cache_dir.to_path_buf();
    let request_for_cover = request.clone();
    let title_for_cover = title.to_string();
    let started_at = Instant::now();
    thread::spawn(move || {
        let result = write_player_metadata_with_cover(
            &cache_dir_for_cover,
            &request_for_cover,
            &title_for_cover,
        );
        let _ = tx.send(result);
    });

    match rx.recv_timeout(Duration::from_millis(PLAYER_COVER_PRELOAD_TIMEOUT_MS)) {
        Ok(Ok(write)) => {
            log_info(format!(
                "Playback perf: cover metadata prepared before player launch in {} ms",
                started_at.elapsed().as_millis()
            ));
            PlayerMetadataLaunch {
                path: Some(write.path),
                cover_ready: write.has_cover,
                loading_image_path: write.loading_image_path,
                pending_cover: None,
            }
        }
        Ok(Err(error)) => {
            log_info(format!("Player cover preload fallback: {}", error));
            let path = write_player_metadata(cache_dir, request, title)
                .map_err(|error| log_info(format!("Player metadata fallback: {}", error)))
                .ok();
            PlayerMetadataLaunch {
                path,
                cover_ready: false,
                loading_image_path: None,
                pending_cover: None,
            }
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            log_info(format!(
                "Player cover preload timed out after {} ms; opening player with fallback metadata",
                PLAYER_COVER_PRELOAD_TIMEOUT_MS
            ));
            let path = write_player_metadata(cache_dir, request, title)
                .map_err(|error| log_info(format!("Player metadata fallback: {}", error)))
                .ok();
            PlayerMetadataLaunch {
                path,
                cover_ready: false,
                loading_image_path: None,
                pending_cover: Some(rx),
            }
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            log_info("Player cover preload disconnected; opening player with fallback metadata");
            let path = write_player_metadata(cache_dir, request, title)
                .map_err(|error| log_info(format!("Player metadata fallback: {}", error)))
                .ok();
            PlayerMetadataLaunch {
                path,
                cover_ready: false,
                loading_image_path: None,
                pending_cover: None,
            }
        }
    }
}

fn spawn_player_cover_metadata_update(
    ipc: String,
    pending_cover: mpsc::Receiver<Result<PlayerMetadataWrite, String>>,
) {
    thread::spawn(move || {
        let started_at = Instant::now();
        match pending_cover.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(write)) => {
                let still_active = manager()
                    .lock()
                    .ok()
                    .and_then(|guard| guard.player_ipc.clone())
                    .map(|active_ipc| active_ipc == ipc)
                    .unwrap_or(false);
                if still_active && write.has_cover {
                    if let Some(loading_image_path) = write.loading_image_path.as_ref() {
                        maybe_replace_generic_loading_frame(&ipc, loading_image_path);
                    }
                    send_player_script_message_arg(
                        &ipc,
                        "streamnyaa-reload-meta",
                        &path_for_player_option(&write.path),
                    );
                }
                log_info(format!(
                    "Playback perf: late cover metadata prepared in {} ms",
                    started_at.elapsed().as_millis()
                ));
            }
            Ok(Err(error)) => {
                log_info(format!("Player cover metadata skipped: {}", error));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                log_info("Player cover metadata skipped after late timeout");
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                log_info("Player cover metadata skipped after worker disconnect");
            }
        }
    });
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
    let Some(close_start) = block[content_start..]
        .find(&close)
        .map(|index| content_start + index)
    else {
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
        "complete", "pack", "1080p", "720p", "480p", "1440p", "2160p", "2k", "4k", "uhd", "x264",
        "x265", "h264", "h265", "hevc", "aac", "flac", "web", "webrip", "webdl", "dl", "sub",
        "subs", "dub", "dubbed", "dual", "multi", "audio", "english", "eng",
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
        if [480, 720, 1080, 1440, 2160].contains(&number) || (1900..=2099).contains(&number) {
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
    normalized.split_whitespace().any(|token| {
        token == ep || token == ep2 || token == ep3 || token.ends_with(&format!("e{}", ep2))
    })
}

fn source_title_match_ratio(title: &str, tokens: &[String]) -> f64 {
    if tokens.is_empty() {
        return 1.0;
    }
    let normalized_title = normalize_source_text(title);
    let matched = tokens
        .iter()
        .filter(|token| {
            normalized_title
                .split_whitespace()
                .any(|part| part == token.as_str())
                || normalized_title.contains(token.as_str())
        })
        .count();
    matched as f64 / tokens.len() as f64
}

fn direct_source_score(
    title: &str,
    seeders: u64,
    downloads: u64,
    trusted: &str,
    tokens: &[String],
    episode: Option<u64>,
) -> u64 {
    let mut score = (source_title_match_ratio(title, tokens) * 30.0).round() as u64;
    score += (((seeders + 1) as f64).log10() * 12.0).round().min(30.0) as u64;
    score += (((downloads + 1) as f64).log10() * 3.0).round().min(8.0) as u64;
    let lower = title.to_ascii_lowercase();
    if trusted.eq_ignore_ascii_case("yes") || trusted.eq_ignore_ascii_case("true") || trusted == "1"
    {
        score += 12;
    }
    if lower.contains("1080p") {
        score += 8;
    } else if lower.contains("1440p") || lower.contains("2k") {
        score += 6;
    } else if lower.contains("2160p") || lower.contains("4k") || lower.contains("uhd") {
        score += 5;
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
            if !looks_like_batch_source(&title) && !source_title_matches_episode(&title, number) {
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
        let hash = item
            .get("infoHash")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let link = item
            .get("link")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let title = item
            .get("title")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let key = if !hash.is_empty() {
            format!("hash:{}", hash.to_ascii_lowercase())
        } else if !link.is_empty() {
            format!("link:{}", link.to_ascii_lowercase())
        } else {
            format!("title:{}", normalize_source_text(title))
        };
        let score = item
            .get("sourceScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
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
        let a_score = a
            .get("sourceScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let b_score = b
            .get("sourceScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
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
        b_score
            .cmp(&a_score)
            .then_with(|| b_seeders.cmp(&a_seeders))
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
    let deep = query_param(trimmed_url, "deep")
        .map(|value| value != "0")
        .unwrap_or(false);
    let wide = query_param(trimmed_url, "wide")
        .map(|value| value == "1")
        .unwrap_or(false);
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
    let client = source_http_client();
    let query_count = variants
        .len()
        .saturating_mul(categories.len())
        .saturating_mul(pages as usize)
        .max(1);
    let mut jobs = Vec::new();
    for variant in variants {
        for category_item in &categories {
            for page_item in page..page + pages {
                jobs.push((
                    nyaa_rss_url(&variant, category_item, &filter, page_item),
                    variant.clone(),
                    category_item.clone(),
                    page_item,
                ));
            }
        }
    }
    let mut items = Vec::new();
    let mut errors = Vec::new();
    for batch in jobs.chunks(6) {
        let results = thread::scope(|scope| {
            batch
                .iter()
                .cloned()
                .map(|(rss_url, matched_query, matched_category, matched_page)| {
                    let client = client.clone();
                    scope.spawn(move || -> Result<Vec<serde_json::Value>, String> {
                        let xml = fetch_nyaa_rss(&client, &rss_url)?;
                        Ok(parse_nyaa_rss_items(
                            &xml,
                            &matched_query,
                            &matched_category,
                            matched_page,
                            query_count,
                        ))
                    })
                })
                .collect::<Vec<_>>()
                .into_iter()
                .map(|handle| {
                    handle.join().unwrap_or_else(|_| {
                        Err("Direct Nyaa source worker stopped unexpectedly.".to_string())
                    })
                })
                .collect::<Vec<_>>()
        });
        for result in results {
            match result {
                Ok(found) => items.extend(found),
                Err(error) => errors.push(error),
            }
        }
        if !items.is_empty() {
            break;
        }
    }
    if items.is_empty() && !errors.is_empty() {
        return Err(errors.remove(0));
    }
    Ok(serde_json::Value::Array(dedupe_source_json(items)))
}

fn normalize_info_hash(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() == 40 && trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Some(trimmed.to_ascii_lowercase());
    }
    let upper = trimmed.to_ascii_uppercase();
    if upper.len() == 32 && upper.chars().all(|ch| matches!(ch, 'A'..='Z' | '2'..='7')) {
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
        let original = request.magnet.trim().to_string();
        let enhanced = build_magnet_uri(&hash, &request.title);
        if original.to_ascii_lowercase().contains("&tr=") {
            candidates.push(original);
            candidates.push(enhanced);
        } else {
            candidates.push(enhanced);
            candidates.push(original);
        }
        if let Some(request_hash) = request.info_hash.as_deref().and_then(normalize_info_hash) {
            candidates.push(build_magnet_uri(&request_hash, &request.title));
        }
    } else if let Some(hash) = request.info_hash.as_deref().and_then(normalize_info_hash) {
        candidates.push(build_magnet_uri(&hash, &request.title));
    }

    let mut seen = HashMap::<String, bool>::new();
    candidates.retain(|candidate| seen.insert(candidate.clone(), true).is_none());
    if candidates.is_empty() {
        return Err(
            "Desktop streaming needs a valid magnet link or torrent info hash.".to_string(),
        );
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
    for extension in [
        "mkv", "mp4", "webm", "avi", "m4v", "mov", "ts", "ass", "ssa", "srt", "vtt",
    ] {
        if lower.contains(&format!(".{}", extension)) {
            return extension.to_string();
        }
    }
    String::new()
}

fn is_video_extension(value: &str) -> bool {
    matches!(value, "mkv" | "mp4" | "webm" | "avi" | "m4v" | "mov" | "ts")
}

fn is_subtitle_extension(value: &str) -> bool {
    matches!(value, "ass" | "ssa" | "srt" | "vtt" | "sub" | "idx")
}

fn normalize_playlist_url(playlist_url: &str, value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with('/') {
        return format!("{}{}", RQBIT_URL, trimmed);
    }
    let base = playlist_url
        .rsplit_once('/')
        .map(|(prefix, _)| prefix)
        .unwrap_or(playlist_url);
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        trimmed.trim_start_matches('/')
    )
}

fn playlist_file_index(url: &str) -> Option<usize> {
    url.split(['/', '?', '&', '='])
        .rev()
        .find_map(|segment| segment.parse::<usize>().ok())
}

fn parse_playlist_entries(playlist_url: &str, content: &str) -> Vec<PlaylistEntry> {
    let mut entries = Vec::new();
    let mut label_hint: Option<String> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((_, label)) = line
            .strip_prefix("#EXTINF:")
            .and_then(|value| value.split_once(','))
        {
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
        let file_stem = stem_from_name(if !label_name.is_empty() {
            &label_name
        } else {
            &file_name
        });
        let kind = if is_video_extension(&extension) {
            PlaylistKind::Video
        } else if is_subtitle_extension(&extension) {
            PlaylistKind::Subtitle
        } else {
            PlaylistKind::Other
        };

        entries.push(PlaylistEntry {
            file_index: playlist_file_index(&url),
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

fn parse_episode_number(value: &str) -> Option<u32> {
    let trimmed = value.trim().trim_start_matches('0');
    if trimmed.is_empty() {
        return Some(0);
    }
    trimmed.parse::<u32>().ok().filter(|number| *number <= 2000)
}

fn push_unique_episode_number(numbers: &mut Vec<u32>, value: &str) {
    if let Some(number) = parse_episode_number(value) {
        if number > 0 && !numbers.contains(&number) {
            numbers.push(number);
        }
    }
}

fn episode_numbers_after_token(value: &str, token: &str, numbers: &mut Vec<u32>) {
    let mut start = 0usize;
    while let Some(offset) = value[start..].find(token) {
        let token_end = start + offset + token.len();
        let after = &value[token_end..];
        let skipped = after
            .char_indices()
            .take_while(|(_, ch)| matches!(ch, ' ' | '.' | '_' | '-' | ':' | '#'))
            .last()
            .map(|(index, ch)| index + ch.len_utf8())
            .unwrap_or(0);
        let digits = after[skipped..]
            .chars()
            .take_while(|ch| ch.is_ascii_digit())
            .take(4)
            .collect::<String>();
        if !digits.is_empty() {
            push_unique_episode_number(numbers, &digits);
        }
        start = token_end;
    }
}

fn sxe_episode_numbers(value: &str, numbers: &mut Vec<u32>) {
    let bytes = value.as_bytes();
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] != b's' {
            index += 1;
            continue;
        }
        let mut cursor = index + 1;
        let season_start = cursor;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            cursor += 1;
        }
        if cursor == season_start || cursor >= bytes.len() || bytes[cursor] != b'e' {
            index += 1;
            continue;
        }
        cursor += 1;
        let episode_start = cursor;
        while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
            cursor += 1;
        }
        if cursor > episode_start {
            push_unique_episode_number(numbers, &value[episode_start..cursor]);
        }
        index = cursor.max(index + 1);
    }
}

fn episode_numbers_in_text(value: &str) -> Vec<u32> {
    let lower = value.to_ascii_lowercase();
    let mut numbers = Vec::new();
    sxe_episode_numbers(&lower, &mut numbers);
    for token in ["episode", " ep", "[ep", "(ep", "_ep", "-ep", ".ep"] {
        episode_numbers_after_token(&lower, token, &mut numbers);
    }
    numbers
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

fn playlist_entry_search_text(entry: &PlaylistEntry) -> String {
    format!(
        "{} {}",
        entry.file_name.to_ascii_lowercase(),
        entry.label.to_ascii_lowercase()
    )
}

fn playlist_video_score(entry: &PlaylistEntry, request: &PlaybackRequest) -> i32 {
    let value = playlist_entry_search_text(entry);
    let mut score = 0i32;

    if entry.kind == PlaylistKind::Video {
        score += 1000;
    }
    if !request.episode.trim().is_empty() {
        if episode_signal_in_text(&value, &request.episode) {
            score += 220;
        }
        if let Some(expected_episode) = parse_episode_number(&request.episode) {
            let episode_numbers = episode_numbers_in_text(&value);
            if episode_numbers.contains(&expected_episode) {
                score += 260;
            } else if !episode_numbers.is_empty() {
                score -= 320;
            }
        }
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
    if value.contains("1440") || value.contains("2k") {
        score += 12;
    }
    if value.contains("2160") || value.contains("4k") || value.contains("uhd") {
        score += 10;
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

fn select_stream_target(
    entries: &[PlaylistEntry],
    request: &PlaybackRequest,
) -> Option<ResolvedStreamTarget> {
    let videos = entries
        .iter()
        .filter(|entry| entry.kind == PlaylistKind::Video)
        .collect::<Vec<_>>();
    let playable_videos = videos
        .iter()
        .copied()
        .filter(|entry| !looks_like_auxiliary_video(&playlist_entry_search_text(entry)))
        .collect::<Vec<_>>();
    let video_pool = if playable_videos.is_empty() {
        videos
    } else {
        playable_videos
    };

    let media = video_pool
        .into_iter()
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
        .filter(|entry| {
            entry.file_stem.eq_ignore_ascii_case(&media.file_stem)
                || entry.file_stem.contains(&media.file_stem)
                || media.file_stem.contains(&entry.file_stem)
        })
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

    let mut selected_file_indices = vec![media.file_index]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    for entry in entries
        .iter()
        .filter(|entry| entry.kind == PlaylistKind::Subtitle)
    {
        if subtitle_urls.iter().any(|url| url == &entry.url) {
            if let Some(index) = entry.file_index {
                if !selected_file_indices.contains(&index) {
                    selected_file_indices.push(index);
                }
            }
        }
    }

    Some(ResolvedStreamTarget {
        media_url: media.url,
        subtitle_urls,
        selected_file_indices,
        selected_file_name: media.file_name,
    })
}

fn prioritize_stream_target(torrent_id: &str, target: &ResolvedStreamTarget) {
    if target.selected_file_indices.is_empty() {
        return;
    }
    let path = format!("/torrents/{}/update_only_files", percent_encode(torrent_id));
    let body = serde_json::json!({ "only_files": target.selected_file_indices });
    match rqbit_post_json(&path, &body) {
        Ok(_) => log_info(format!(
            "Prioritized selected media file '{}' with {} companion file(s)",
            target.selected_file_name,
            target.selected_file_indices.len().saturating_sub(1)
        )),
        Err(error) => log_info(format!(
            "Selected-file prioritization was unavailable; continuing safely: {}",
            error
        )),
    }
}

fn playlist_target(
    torrent_id: &str,
    request: &PlaybackRequest,
) -> Result<Option<ResolvedStreamTarget>, String> {
    let playlist_path = format!("/torrents/{}/playlist", percent_encode(torrent_id));
    let playlist_url = format!("{}{}", RQBIT_URL, &playlist_path);
    let payload = rqbit_get(&playlist_path)?;
    let entries = parse_playlist_entries(&playlist_url, &payload);
    Ok(select_stream_target(&entries, request))
}

fn loading_palette_rgb(_value: &str) -> ([u8; 3], [u8; 3], [u8; 3]) {
    ([255, 38, 48], [142, 18, 32], [8, 6, 9])
}

fn write_loading_bmp(path: &Path, seed: &str) -> Result<(), String> {
    let width = 1280usize;
    let height = 720usize;
    let (accent, secondary, base_tint) = loading_palette_rgb(seed);
    let mut pixels = vec![0u8; width * height * 3];

    for y in 0..height {
        for x in 0..width {
            let fx = x as f64 / width as f64;
            let fy = y as f64 / height as f64;
            let left_glow = (1.0
                - (((fx - 0.26).powi(2) + ((fy - 0.45) * 1.35).powi(2)).sqrt() / 0.55))
                .clamp(0.0, 1.0);
            let right_glow = (1.0
                - (((fx - 0.82).powi(2) + ((fy - 0.24) * 1.2).powi(2)).sqrt() / 0.48))
                .clamp(0.0, 1.0);
            let vignette =
                (((fx - 0.5).powi(2) + ((fy - 0.5) * 1.45).powi(2)).sqrt() / 0.72).clamp(0.0, 1.0);
            let index = (y * width + x) * 3;
            for channel in 0..3 {
                let value = 5.0
                    + base_tint[channel] as f64 * 0.36
                    + accent[channel] as f64 * left_glow * 0.30
                    + secondary[channel] as f64 * right_glow * 0.24
                    - vignette * 12.0;
                pixels[index + channel] = value.clamp(0.0, 255.0) as u8;
            }
        }
    }

    let mut blend_pixel = |x: usize, y: usize, color: [u8; 3], alpha: f64| {
        if x >= width || y >= height {
            return;
        }
        let alpha = alpha.clamp(0.0, 1.0);
        let index = (y * width + x) * 3;
        for channel in 0..3 {
            let current = pixels[index + channel] as f64;
            pixels[index + channel] =
                (current * (1.0 - alpha) + color[channel] as f64 * alpha).clamp(0.0, 255.0) as u8;
        }
    };

    for y in 0..height {
        for x in 0..width {
            let fx = x as f64 / width as f64;
            let fy = y as f64 / height as f64;
            let center_glow = (1.0
                - (((fx - 0.50).powi(2) + ((fy - 0.45) * 1.25).powi(2)).sqrt() / 0.42))
                .clamp(0.0, 1.0);
            if center_glow > 0.0 {
                blend_pixel(x, y, secondary, center_glow * 0.08);
            }
        }
    }

    let row_size = (width * 3 + 3) & !3;
    let image_size = row_size * height;
    let file_size = 14 + 40 + image_size;
    let mut output = Vec::with_capacity(file_size);
    output.extend_from_slice(b"BM");
    output.extend_from_slice(&(file_size as u32).to_le_bytes());
    output.extend_from_slice(&[0, 0, 0, 0]);
    output.extend_from_slice(&(54u32).to_le_bytes());
    output.extend_from_slice(&(40u32).to_le_bytes());
    output.extend_from_slice(&(width as i32).to_le_bytes());
    output.extend_from_slice(&(height as i32).to_le_bytes());
    output.extend_from_slice(&(1u16).to_le_bytes());
    output.extend_from_slice(&(24u16).to_le_bytes());
    output.extend_from_slice(&(0u32).to_le_bytes());
    output.extend_from_slice(&(image_size as u32).to_le_bytes());
    output.extend_from_slice(&(2835i32).to_le_bytes());
    output.extend_from_slice(&(2835i32).to_le_bytes());
    output.extend_from_slice(&(0u32).to_le_bytes());
    output.extend_from_slice(&(0u32).to_le_bytes());

    let padding = vec![0u8; row_size - width * 3];
    for y in (0..height).rev() {
        for x in 0..width {
            let index = (y * width + x) * 3;
            output.push(pixels[index + 2]);
            output.push(pixels[index + 1]);
            output.push(pixels[index]);
        }
        output.extend_from_slice(&padding);
    }

    fs::write(path, output).map_err(|error| format!("Could not write loading frame: {}", error))
}

fn loading_frame(
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
) -> Result<PathBuf, String> {
    let path = cache_dir.join("streamnyaa-loading.bmp");
    write_loading_bmp(
        &path,
        &format!(
            "{}|{}|{}|{}|{}",
            request.anime_title,
            request.episode,
            title,
            request.poster.as_deref().unwrap_or(""),
            request.banner.as_deref().unwrap_or("")
        ),
    )?;
    Ok(path)
}

fn loading_frame_for_player(
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
    cover_loading_image: Option<&PathBuf>,
) -> Result<PathBuf, String> {
    if let Some(path) = cover_loading_image {
        match fs::metadata(path) {
            Ok(metadata) if metadata.is_file() && metadata.len() > 0 => {
                log_info(format!(
                    "MPV initial loading image uses cover placeholder: {} ({} bytes)",
                    path.to_string_lossy(),
                    metadata.len()
                ));
                return Ok(path.clone());
            }
            Ok(_) => {
                log_info(format!(
                    "Cover loading image was not usable; falling back to generic loading BMP: {}",
                    path.to_string_lossy()
                ));
            }
            Err(error) => {
                log_info(format!(
                    "Cover loading image missing; falling back to generic loading BMP: {} ({})",
                    path.to_string_lossy(),
                    error
                ));
            }
        }
    }

    let fallback = loading_frame(cache_dir, request, title)?;
    log_info(format!(
        "MPV initial loading image uses fallback BMP: {}",
        fallback.to_string_lossy()
    ));
    Ok(fallback)
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

fn send_mpv_with_retry(ipc: &str, command: &str, attempts: usize, delay_ms: u64) -> bool {
    for attempt in 0..attempts.max(1) {
        if send_mpv(ipc, command) {
            return true;
        }
        if attempt + 1 < attempts {
            thread::sleep(Duration::from_millis(delay_ms));
        }
    }
    false
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
        if send_mpv(
            ipc,
            r#"{"command":["get_property","idle-active"],"request_id":1}"#,
        ) {
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
    response.get("data").and_then(|value| {
        value
            .as_f64()
            .or_else(|| value.as_u64().map(|item| item as f64))
    })
}

fn get_player_property_bool(ipc: &str, property: &str) -> Option<bool> {
    let command = format!(
        r#"{{"command":["get_property",{}],"request_id":42}}"#,
        json_string(property)
    );
    let response = send_mpv_request(ipc, &command)?;
    response.get("data").and_then(|value| value.as_bool())
}

fn get_player_property_string(ipc: &str, property: &str) -> Option<String> {
    let command = format!(
        r#"{{"command":["get_property",{}],"request_id":43}}"#,
        json_string(property)
    );
    let response = send_mpv_request(ipc, &command)?;
    response
        .get("data")
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

fn clamp_player_volume(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 130.0)
    } else {
        70.0
    }
}

fn clamp_player_speed(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.25, 3.0)
    } else {
        1.0
    }
}

fn clamp_player_seek_delta(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(-600.0, 600.0)
    } else {
        0.0
    }
}

fn clamp_player_seek_absolute(value: f64) -> f64 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

fn player_control_status(ipc: &str, message: &str) -> PlayerControlStatus {
    PlayerControlStatus {
        ok: true,
        message: message.to_string(),
        paused: get_player_property_bool(ipc, "pause"),
        volume: get_player_property_f64(ipc, "volume"),
        current_seconds: get_player_property_f64(ipc, "time-pos"),
        duration_seconds: get_player_property_f64(ipc, "duration"),
    }
}

fn active_player_ipc() -> Result<String, String> {
    let mut guard = manager()
        .lock()
        .map_err(|_| "Playback manager is unavailable.".to_string())?;
    let ipc = guard
        .player_ipc
        .clone()
        .ok_or_else(|| "No active StreamNyaa player is running.".to_string())?;
    if let Some(child) = guard.player.as_mut() {
        if child.try_wait().ok().flatten().is_some() {
            guard.player = None;
            guard.player_ipc = None;
            return Err("The StreamNyaa player is not running.".to_string());
        }
    }
    Ok(ipc)
}

fn control_player(request: PlayerControlRequest) -> Result<PlayerControlStatus, String> {
    let ipc = active_player_ipc()?;
    if !player_ipc_ready(&ipc, 1, 0) {
        return Err("The StreamNyaa player is not ready for controls yet.".to_string());
    }

    let action = request.action.trim().to_ascii_lowercase();
    let command = match action.as_str() {
        "toggle_pause" => r#"{"command":["cycle","pause"],"request_id":61}"#.to_string(),
        "play" => r#"{"command":["set_property","pause",false],"request_id":62}"#.to_string(),
        "pause" => r#"{"command":["set_property","pause",true],"request_id":63}"#.to_string(),
        "seek_relative" => {
            let seconds = clamp_player_seek_delta(request.value.unwrap_or(0.0));
            format!(
                r#"{{"command":["seek",{},"relative"],"request_id":64}}"#,
                seconds
            )
        }
        "seek_absolute" => {
            let seconds = clamp_player_seek_absolute(request.value.unwrap_or(0.0));
            format!(
                r#"{{"command":["seek",{},"absolute+exact"],"request_id":65}}"#,
                seconds
            )
        }
        "volume_relative" => {
            let current = get_player_property_f64(&ipc, "volume").unwrap_or(70.0);
            let next = clamp_player_volume(current + request.value.unwrap_or(0.0));
            format!(
                r#"{{"command":["set_property","volume",{}],"request_id":66}}"#,
                next
            )
        }
        "volume" => {
            let next = clamp_player_volume(request.value.unwrap_or(70.0));
            format!(
                r#"{{"command":["set_property","volume",{}],"request_id":67}}"#,
                next
            )
        }
        "mute" => r#"{"command":["cycle","mute"],"request_id":68}"#.to_string(),
        "fullscreen" => r#"{"command":["cycle","fullscreen"],"request_id":69}"#.to_string(),
        "speed" => {
            let next = clamp_player_speed(request.value.unwrap_or(1.0));
            format!(
                r#"{{"command":["set_property","speed",{}],"request_id":70}}"#,
                next
            )
        }
        "subtitle" => r#"{"command":["cycle","sub"],"request_id":71}"#.to_string(),
        "audio" => r#"{"command":["cycle","audio"],"request_id":72}"#.to_string(),
        "auto_next_episode" => {
            let enabled = request.value.unwrap_or(0.0) >= 0.5;
            format!(
                r#"{{"command":["script-message","streamnyaa-set-auto-next","{}"],"request_id":73}}"#,
                if enabled { "true" } else { "false" }
            )
        }
        "player_preference" => {
            let key = request
                .key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Missing player preference key.".to_string())?;
            let value = request.text.clone().unwrap_or_else(|| {
                request
                    .value
                    .map(|item| item.to_string())
                    .unwrap_or_default()
            });
            persist_player_preference(key, &value);
            format!(
                r#"{{"command":["script-message","streamnyaa-set-player-preference",{},{}],"request_id":75}}"#,
                json_string(key),
                json_string(&value)
            )
        }
        "show_status" => {
            r#"{"command":["show-text","StreamNyaa player ready",1200],"request_id":74}"#
                .to_string()
        }
        other => return Err(format!("Unsupported player control: {}", other)),
    };

    if !send_mpv(&ipc, &command) {
        return Err("The StreamNyaa player did not accept the control command.".to_string());
    }

    Ok(player_control_status(&ipc, "Player control applied."))
}

fn show_player_text(ipc: &str, text: &str) {
    show_player_text_with_title(ipc, None, text);
}

fn should_suppress_player_loading_text(text: &str) -> bool {
    let status = text.to_ascii_lowercase();
    [
        "preparing torrent session",
        "preparing ",
        "loading",
        "opening player",
        "starting torrent engine",
        "fetching torrent metadata",
        "fetching metadata",
        "looking for the episode file",
        "matching the correct episode file",
        "connecting to the local stream engine",
        "connecting peers",
        "responsive peers",
        "buffering",
        "opening the player while",
        "preparing the player handoff",
        "starting playback",
        "opening stream",
        "opening the stream",
        "switching episode",
        "switching source",
        "retrying the player handoff",
    ]
    .iter()
    .any(|marker| status.contains(marker))
}

fn format_stream_bytes(bytes: u64) -> String {
    const KIB: f64 = 1024.0;
    const MIB: f64 = 1024.0 * 1024.0;
    const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
    let value = bytes as f64;
    if value >= GIB {
        format!("{:.1} GiB", value / GIB)
    } else if value >= MIB {
        format!("{:.1} MiB", value / MIB)
    } else if value >= KIB {
        format!("{:.0} KiB", value / KIB)
    } else {
        format!("{} B", bytes)
    }
}

fn format_stream_rate(bytes_per_second: u64) -> String {
    if bytes_per_second == 0 {
        "--".to_string()
    } else {
        format!("{}/s", format_stream_bytes(bytes_per_second))
    }
}

fn set_player_user_data(ipc: &str, key: &str, value: &str) {
    let property = format!("user-data/streamnyaa/{}", key);
    let command = format!(
        r#"{{"command":["set_property",{},{}],"request_id":86}}"#,
        json_string(&property),
        json_string(value)
    );
    let _ = send_mpv(ipc, &command);
}

fn update_player_stream_metrics(
    ipc: &str,
    state: &str,
    peers: u64,
    downloaded_bytes: u64,
    total_bytes: u64,
    progress: Option<f64>,
    download_rate: Option<u64>,
) {
    let buffer_percent = progress
        .or_else(|| {
            if total_bytes > 0 {
                Some((downloaded_bytes as f64 / total_bytes as f64 * 100.0).clamp(0.0, 100.0))
            } else {
                None
            }
        })
        .unwrap_or(0.0)
        .clamp(0.0, 100.0);

    set_player_user_data(ipc, "state", state);
    set_player_user_data(ipc, "peers", &peers.to_string());
    set_player_user_data(
        ipc,
        "download",
        &format_stream_rate(download_rate.unwrap_or(0)),
    );
    set_player_user_data(ipc, "upload", "--");
    set_player_user_data(
        ipc,
        "downloaded",
        &if total_bytes > 0 {
            format!(
                "{} / {}",
                format_stream_bytes(downloaded_bytes),
                format_stream_bytes(total_bytes)
            )
        } else {
            format_stream_bytes(downloaded_bytes)
        },
    );
    set_player_user_data(ipc, "buffer", &format!("{:.0}%", buffer_percent));
}

fn show_player_text_with_title(ipc: &str, title: Option<&str>, text: &str) {
    let _ = title;
    if should_suppress_player_loading_text(text) {
        return;
    }
    let command = format!(
        r#"{{"command":["show-text",{},"2400"],"request_id":2}}"#,
        json_string(text)
    );
    let _ = send_mpv(ipc, &command);
}

fn load_player_file(ipc: &str, url: &str) -> bool {
    let command = format!(
        r#"{{"command":["loadfile",{},"replace"],"request_id":3}}"#,
        json_string(url)
    );
    send_mpv_with_retry(ipc, &command, 8, 180)
}

fn maybe_replace_generic_loading_frame(ipc: &str, loading_image_path: &Path) {
    let Some(current_path) = get_player_property_string(ipc, "path") else {
        log_info("Late cover loading image skipped because MPV path could not be read");
        return;
    };
    let normalized = current_path.replace('\\', "/").to_ascii_lowercase();
    if !normalized.ends_with("/streamnyaa-loading.bmp")
        && !normalized.ends_with("\\streamnyaa-loading.bmp")
        && !normalized.ends_with("streamnyaa-loading.bmp")
    {
        log_info(format!(
            "Late cover loading image skipped because MPV is no longer on the generic placeholder: {}",
            current_path
        ));
        return;
    }
    match fs::metadata(loading_image_path) {
        Ok(metadata) if metadata.is_file() && metadata.len() > 0 => {
            let player_path = path_for_player_option(loading_image_path);
            if load_player_file(ipc, &player_path) {
                log_info(format!(
                    "Late cover loading image replaced generic MPV placeholder: {} ({} bytes)",
                    loading_image_path.to_string_lossy(),
                    metadata.len()
                ));
            } else {
                log_info("Late cover loading image could not be loaded into MPV");
            }
        }
        Ok(_) => {
            log_info(format!(
                "Late cover loading image skipped because file is empty or invalid: {}",
                loading_image_path.to_string_lossy()
            ));
        }
        Err(error) => {
            log_info(format!(
                "Late cover loading image skipped because file is missing: {} ({})",
                loading_image_path.to_string_lossy(),
                error
            ));
        }
    }
}

fn set_player_title(ipc: &str, title: &str) {
    let command = format!(
        r#"{{"command":["set_property","force-media-title",{}],"request_id":31}}"#,
        json_string(title)
    );
    let _ = send_mpv(ipc, &command);
}

fn send_player_script_message(ipc: &str, message: &str) {
    let command = format!(
        r#"{{"command":["script-message",{}],"request_id":87}}"#,
        json_string(message)
    );
    let _ = send_mpv(ipc, &command);
}

fn send_player_script_message_arg(ipc: &str, message: &str, arg: &str) {
    let command = format!(
        r#"{{"command":["script-message",{},{}],"request_id":87}}"#,
        json_string(message),
        json_string(arg)
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

fn send_player_subtitle_import(ipc: &str, path: &Path) -> bool {
    let command = serde_json::json!({
        "command": [
            "script-message",
            "streamnyaa-import-subtitle-path",
            path.to_string_lossy().to_string()
        ],
        "request_id": 88
    })
    .to_string();
    send_mpv_with_retry(ipc, &command, 4, 120)
}

fn player_ipc_is_active(ipc: &str) -> bool {
    manager()
        .lock()
        .ok()
        .and_then(|guard| guard.player_ipc.clone())
        .map(|active_ipc| active_ipc == ipc)
        .unwrap_or(false)
}

fn import_subtitle_for_ipc_guarded(ipc: &str) -> Result<Option<PathBuf>, String> {
    if SUBTITLE_IMPORT_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        show_player_text(ipc, "Subtitle picker is already open...");
        return Ok(None);
    }
    let result = import_subtitle_for_ipc(ipc);
    SUBTITLE_IMPORT_IN_PROGRESS.store(false, Ordering::SeqCst);
    result
}

fn spawn_subtitle_import_task(ipc: String) {
    if !player_ipc_is_active(&ipc) {
        return;
    }
    thread::spawn(move || match import_subtitle_for_ipc_guarded(&ipc) {
        Ok(Some(path)) => {
            log_info(format!(
                "Imported external subtitle into player: {}",
                path.to_string_lossy()
            ));
        }
        Ok(None) => {
            log_info("External subtitle import cancelled");
        }
        Err(error) => {
            remember_error(format!("Subtitle import failed: {}", error));
            show_player_text(&ipc, &error);
        }
    });
}

fn spawn_subtitle_import_request_watcher(ipc: String, request_file: PathBuf) {
    thread::spawn(move || {
        let mut last_token = fs::read_to_string(&request_file).unwrap_or_default();
        loop {
            thread::sleep(Duration::from_millis(250));
            if !player_ipc_is_active(&ipc) {
                break;
            }
            let token = fs::read_to_string(&request_file).unwrap_or_default();
            if token.trim().is_empty() || token == last_token {
                continue;
            }
            last_token = token;
            log_info("MPV requested external subtitle import through request file");
            spawn_subtitle_import_task(ipc.clone());
        }
    });
}

fn spawn_next_episode_request_watcher(ipc: String, request_file: PathBuf) {
    thread::spawn(move || {
        let mut last_token = fs::read_to_string(&request_file).unwrap_or_default();
        loop {
            thread::sleep(Duration::from_millis(180));
            if !player_ipc_is_active(&ipc) {
                break;
            }
            let token = fs::read_to_string(&request_file).unwrap_or_default();
            if token.trim().is_empty() || token == last_token {
                continue;
            }
            last_token = token.clone();
            let reason = token
                .split('|')
                .next()
                .map(str::trim)
                .filter(|value| *value == "ended")
                .unwrap_or("manual");
            log_info(format!(
                "MPV requested next episode through request file reason={}",
                reason
            ));
            emit_player_next_episode_request(reason);
        }
    });
}

fn spawn_player_setting_request_watcher(ipc: String, request_file: PathBuf) {
    thread::spawn(move || {
        let mut last_token = fs::read_to_string(&request_file).unwrap_or_default();
        loop {
            thread::sleep(Duration::from_millis(180));
            if !player_ipc_is_active(&ipc) {
                break;
            }
            let token = fs::read_to_string(&request_file).unwrap_or_default();
            if token.trim().is_empty() || token == last_token {
                continue;
            }
            last_token = token.clone();
            let mut parts = token.trim().splitn(3, '|');
            let key = parts.next().unwrap_or_default().trim();
            let value = parts.next().unwrap_or_default().trim();
            if key.is_empty() {
                continue;
            }
            log_info(format!(
                "MPV persisted player setting through request file key={} value={}",
                key, value
            ));
            emit_player_setting_changed(key, value);
        }
    });
}

fn emit_player_next_episode_request(reason: &str) {
    let reason = if reason.trim() == "ended" {
        "ended"
    } else {
        "manual"
    };
    let now = now_millis();
    if let Ok(mut last) = LAST_NEXT_EPISODE_EVENT
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        if last
            .as_ref()
            .map(|(previous_reason, previous_at)| {
                previous_reason == reason && now.saturating_sub(*previous_at) < 750
            })
            .unwrap_or(false)
        {
            log_info(format!(
                "Duplicate next-episode bridge event ignored reason={}",
                reason
            ));
            return;
        }
        *last = Some((reason.to_string(), now));
    }
    let payload = PlayerNextEpisodePayload {
        reason: reason.to_string(),
    };
    if let Some(app) = APP_HANDLE.get() {
        if let Err(error) = app.emit("streamnyaa-player-next-episode", payload) {
            log_info(format!("Could not emit next-episode request: {}", error));
        }
    } else {
        log_info("Could not emit next-episode request: app handle is unavailable");
    }
}

fn emit_player_auto_next_changed(enabled: bool) {
    let payload = PlayerAutoNextPayload { enabled };
    if let Some(app) = APP_HANDLE.get() {
        if let Err(error) = app.emit("streamnyaa-player-auto-next-changed", payload) {
            log_info(format!("Could not emit auto-next change: {}", error));
        }
    } else {
        log_info("Could not emit auto-next change: app handle is unavailable");
    }
}

fn emit_player_setting_changed(key: &str, value: &str) {
    let payload = PlayerSettingChangedPayload {
        key: key.trim().to_string(),
        value: value.to_string(),
    };
    if payload.key.is_empty() {
        return;
    }
    persist_player_preference(&payload.key, &payload.value);
    if let Some(app) = APP_HANDLE.get() {
        if let Err(error) = app.emit("streamnyaa-player-setting-changed", payload) {
            log_info(format!("Could not emit player setting change: {}", error));
        }
    } else {
        log_info("Could not emit player setting change: app handle is unavailable");
    }
}

fn emit_player_ready() {
    let payload = PlayerReadyPayload {
        ready: true,
        at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default(),
    };
    if let Some(app) = APP_HANDLE.get() {
        if let Err(error) = app.emit("streamnyaa-player-ready", payload) {
            log_info(format!("Could not emit player ready event: {}", error));
        }
    } else {
        log_info("Could not emit player ready event: app handle is unavailable");
    }
}

fn emit_player_recovery_request(action: &str, media_key: &str, position_seconds: f64) {
    let payload = PlayerRecoveryRequestPayload {
        action: action.trim().to_string(),
        media_key: media_key.to_string(),
        position_seconds: position_seconds.max(0.0),
    };
    if let Some(app) = APP_HANDLE.get() {
        if let Err(error) = app.emit("streamnyaa-player-recovery-request", payload) {
            log_info(format!("Could not emit player recovery request: {}", error));
        }
    } else {
        log_info("Could not emit player recovery request: app handle is unavailable");
    }
}

fn handle_player_client_message(ipc: &str, value: serde_json::Value) {
    let event = value.get("event").and_then(|item| item.as_str());
    if event != Some("client-message") {
        return;
    }
    let args = value.get("args").and_then(|item| item.as_array());
    let Some(args) = args else {
        return;
    };
    let message = args.first().and_then(|item| item.as_str());
    if let Some(message) = message {
        if message.starts_with("streamnyaa-") {
            log_info(format!(
                "MPV Lua client-message received: {} args={}",
                message,
                serde_json::to_string(args).unwrap_or_else(|_| "[]".to_string())
            ));
        }
    }
    if message == Some("streamnyaa-lua-ready") {
        log_info("[StreamNyaa Rust] MPV Lua ready; emitting streamnyaa-player-ready");
        emit_player_ready();
        return;
    }
    if message == Some("streamnyaa-player-recovery-request") {
        if !player_ipc_is_active(ipc) {
            return;
        }
        let action = args
            .get(1)
            .and_then(|item| item.as_str())
            .unwrap_or("retry");
        let media_key = args
            .get(2)
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let position_seconds = args
            .get(3)
            .and_then(|item| item.as_str())
            .and_then(|value| value.parse::<f64>().ok())
            .unwrap_or_default();
        log_info(format!(
            "[StreamNyaa Rust] Received player recovery request action={} position={:.2}",
            action, position_seconds
        ));
        emit_player_recovery_request(action, media_key, position_seconds);
        return;
    }
    if message == Some("streamnyaa-next-episode-request") {
        if !player_ipc_is_active(ipc) {
            return;
        }
        let raw_reason = args
            .get(1)
            .and_then(|item| item.as_str())
            .unwrap_or("manual");
        let reason = if raw_reason == "ended" {
            "ended"
        } else {
            "manual"
        };
        log_info(format!(
            "[StreamNyaa Rust] Received MPV next episode request reason={}",
            reason
        ));
        emit_player_next_episode_request(reason);
        log_info(format!(
            "[StreamNyaa Rust] Emitting streamnyaa-player-next-episode reason={}",
            reason
        ));
        return;
    }
    if message == Some("streamnyaa-auto-next-changed") {
        if !player_ipc_is_active(ipc) {
            return;
        }
        let enabled = args
            .get(1)
            .and_then(|item| item.as_str())
            .map(|value| {
                matches!(
                    value.trim().to_ascii_lowercase().as_str(),
                    "true" | "1" | "yes" | "on"
                )
            })
            .unwrap_or(false);
        log_info(format!("MPV changed auto-next preference: {}", enabled));
        emit_player_auto_next_changed(enabled);
        return;
    }
    if message == Some("streamnyaa-player-setting-changed") {
        if !player_ipc_is_active(ipc) {
            return;
        }
        let key = args
            .get(1)
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let value = args
            .get(2)
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        log_info(format!(
            "[StreamNyaa Rust] Received player setting changed key={} value={}",
            key, value
        ));
        emit_player_setting_changed(key, value);
        return;
    }
    if message != Some("streamnyaa-import-subtitle-request") {
        return;
    }

    if !player_ipc_is_active(ipc) {
        return;
    }

    log_info("MPV requested external subtitle import");
    spawn_subtitle_import_task(ipc.to_string());
}

#[cfg(windows)]
fn spawn_player_ipc_event_listener(ipc: String) {
    thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let mut stream = match std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&ipc)
        {
            Ok(stream) => stream,
            Err(error) => {
                log_info(format!(
                    "Could not attach player IPC event listener: {}",
                    error
                ));
                return;
            }
        };
        let _ = stream
            .write_all(b"{\"command\":[\"enable_event\",\"client-message\"],\"request_id\":90}\n");
        let _ = stream.write_all(
            b"{\"command\":[\"observe_property\",91,\"idle-active\"],\"request_id\":91}\n",
        );
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                        handle_player_client_message(&ipc, value);
                    }
                }
                Err(_) => break,
            }
        }
    });
}

#[cfg(not(windows))]
fn spawn_player_ipc_event_listener(ipc: String) {
    thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        use std::os::unix::net::UnixStream;
        let mut stream = match UnixStream::connect(&ipc) {
            Ok(stream) => stream,
            Err(error) => {
                log_info(format!(
                    "Could not attach player IPC event listener: {}",
                    error
                ));
                return;
            }
        };
        let _ = stream
            .write_all(b"{\"command\":[\"enable_event\",\"client-message\"],\"request_id\":90}\n");
        let _ = stream.write_all(
            b"{\"command\":[\"observe_property\",91,\"idle-active\"],\"request_id\":91}\n",
        );
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                        handle_player_client_message(&ipc, value);
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn validate_external_subtitle_path(path: PathBuf) -> Result<PathBuf, String> {
    if !path.exists() || !path.is_file() {
        return Err("Selected subtitle file does not exist.".to_string());
    }
    let path_text = path.to_string_lossy();
    let extension = extension_from_name(path_text.as_ref());
    if !is_subtitle_extension(&extension) {
        return Err("Selected file is not a supported subtitle format.".to_string());
    }
    Ok(path)
}

#[cfg(windows)]
fn open_subtitle_file_picker() -> Result<Option<PathBuf>, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$owner = New-Object System.Windows.Forms.Form
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.Show()
$owner.Activate()
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Import subtitle file'
$dialog.Filter = 'Subtitle files (*.srt;*.ass;*.ssa;*.vtt;*.sub;*.idx)|*.srt;*.ass;*.ssa;*.vtt;*.sub;*.idx|All files (*.*)|*.*'
$dialog.Multiselect = $false
$dialog.CheckFileExists = $true
$dialog.CheckPathExists = $true
$result = $dialog.ShowDialog($owner)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
$owner.Close()
"#;
    let output = prepared_command("powershell")
        .arg("-NoProfile")
        .arg("-STA")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(script)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Could not open subtitle picker: {}", error))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            "Subtitle picker did not open.".to_string()
        } else {
            format!("Subtitle picker failed: {}", error)
        });
    }
    let selected = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches('\u{feff}')
        .trim()
        .to_string();
    if selected.is_empty() {
        Ok(None)
    } else {
        validate_external_subtitle_path(PathBuf::from(selected)).map(Some)
    }
}

#[cfg(not(windows))]
fn open_subtitle_file_picker() -> Result<Option<PathBuf>, String> {
    Err("Subtitle file picker is currently implemented for Windows desktop builds.".to_string())
}

fn import_subtitle_for_ipc(ipc: &str) -> Result<Option<PathBuf>, String> {
    show_player_text(ipc, "Choose a subtitle file...");
    let Some(path) = open_subtitle_file_picker()? else {
        return Ok(None);
    };
    if !send_player_subtitle_import(ipc, &path) {
        return Err("The StreamNyaa player did not accept the subtitle file.".to_string());
    }
    Ok(Some(path))
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

fn notify_player_source_switch(title: &str) {
    let player_ipc = manager()
        .lock()
        .ok()
        .and_then(|guard| guard.player_ipc.clone());
    if let Some(ipc) = player_ipc {
        show_player_text_with_title(&ipc, Some(title), "Switching source...");
        stop_player_stream_only(&ipc);
    }
}

fn cancel_previous_loading_source(settings: Option<DesktopSettings>, title: &str) {
    notify_player_source_switch(title);
    stop_active_session(true);
    let status = runtime_status(settings);
    stop_rqbit_server(status.torrent_engine_path.as_deref());
}

fn launch_or_reuse_player(
    player_path: &str,
    cache_dir: &Path,
    request: &PlaybackRequest,
    title: &str,
) -> Result<String, String> {
    let started_at = Instant::now();
    let mut metadata_launch = prepare_player_metadata_for_launch(cache_dir, request, title);
    let metadata_file = metadata_launch.path.clone();
    let subtitle_request_file = match prepare_player_subtitle_import_request(cache_dir) {
        Ok(path) => Some(path),
        Err(error) => {
            log_info(format!("Subtitle import bridge fallback: {}", error));
            None
        }
    };
    let next_episode_request_file = match prepare_player_next_episode_request(cache_dir) {
        Ok(path) => Some(path),
        Err(error) => {
            log_info(format!("Next-episode bridge fallback: {}", error));
            None
        }
    };
    let player_setting_request_file = match prepare_player_setting_request(cache_dir) {
        Ok(path) => Some(path),
        Err(error) => {
            log_info(format!("Player-setting bridge fallback: {}", error));
            None
        }
    };

    let stale_player = {
        let mut guard = manager()
            .lock()
            .map_err(|_| "Playback manager is unavailable.".to_string())?;

        let existing_ipc = guard.player_ipc.clone();
        if let (Some(child), Some(ipc)) = (guard.player.as_mut(), existing_ipc) {
            if child.try_wait().ok().flatten().is_none() && player_ipc_ready(&ipc, 2, 60) {
                if let Ok(loading) = loading_frame_for_player(
                    cache_dir,
                    request,
                    title,
                    metadata_launch.loading_image_path.as_ref(),
                ) {
                    let _ = load_player_file(&ipc, &path_for_player_option(&loading));
                }
                set_player_title(&ipc, title);
                if let Some(metadata_file) = metadata_file.as_ref() {
                    send_player_script_message_arg(
                        &ipc,
                        "streamnyaa-reload-meta",
                        &path_for_player_option(metadata_file),
                    );
                } else {
                    send_player_script_message(&ipc, "streamnyaa-reload-meta");
                }
                send_player_script_message(&ipc, "streamnyaa-playback-ready");
                log_info("MPV playback-ready message sent while reusing player");
                show_player_text_with_title(&ipc, Some(title), "Switching episode...");
                if let Some(pending_cover) = metadata_launch.pending_cover.take() {
                    spawn_player_cover_metadata_update(ipc.clone(), pending_cover);
                }
                log_info(format!(
                    "Playback perf: reused MPV in {} ms{}",
                    started_at.elapsed().as_millis(),
                    if metadata_launch.cover_ready {
                        " with preloaded cover"
                    } else {
                        ""
                    }
                ));
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
    let loading = loading_frame_for_player(
        cache_dir,
        request,
        title,
        metadata_launch.loading_image_path.as_ref(),
    )?;
    let player_skin = bundled_player_skin_script();
    if let Some(player_skin_path) = player_skin.as_ref() {
        log_info(format!(
            "MPV Lua skin path: {}",
            player_skin_path.to_string_lossy()
        ));
    } else {
        log_info("MPV Lua skin path was not found; player will open without StreamNyaa Lua UI");
    }
    let player_log = logs_root().join("mpv-player.log");
    if let Some(log_dir) = player_log.parent() {
        let _ = fs::create_dir_all(log_dir);
    }
    let mut command = prepared_command(player_path);
    command
        .arg("--no-config")
        .arg("--force-window=yes")
        .arg("--idle=yes")
        .arg("--keep-open=yes")
        .arg("--image-display-duration=inf")
        .arg("--osc=no")
        .arg("--osd-bar=no")
        .arg("--osd-level=1")
        .arg("--osd-duration=1400")
        .arg("--osd-align-x=center")
        .arg("--osd-align-y=bottom")
        .arg("--osd-margin-y=86")
        .arg("--cursor-autohide=900")
        .arg("--no-window-dragging")
        .arg("--input-default-bindings=yes")
        .arg("--background-color=#050508")
        .arg("--hwdec=auto-safe")
        .arg("--vo=gpu-next,gpu")
        .arg("--cache=yes")
        .arg("--cache-on-disk=no")
        .arg("--cache-pause=yes")
        .arg("--cache-pause-initial=yes")
        .arg("--cache-secs=18")
        .arg("--demuxer-max-bytes=64MiB")
        .arg("--demuxer-readahead-secs=45")
        .arg("--save-position-on-quit=no")
        .arg("--sub-auto=fuzzy")
        .arg("--sub-scale-by-window=yes")
        .arg("--sub-use-margins=yes")
        .arg("--osd-font=Segoe UI Semibold")
        .arg("--osd-font-size=24")
        .arg("--osd-color=#FFFFFFFF")
        .arg("--osd-border-color=#09090D")
        .arg("--osd-border-size=2.2")
        .arg("--osd-shadow-offset=0")
        .arg("--sub-font=Segoe UI Semibold")
        .arg(format!(
            "--log-file={}",
            path_for_player_option(&player_log)
        ))
        .arg(format!("--input-ipc-server={}", ipc))
        .arg(format!("--force-media-title={}", title))
        .arg(format!("--title=StreamNyaa - {}", title));

    add_persisted_subtitle_preferences(&mut command);

    let mut script_opts: Vec<String> = Vec::new();
    if let Some(metadata_file) = metadata_file.as_ref() {
        script_opts.push(format!(
            "streamnyaa_player-meta_file={}",
            path_for_player_option(metadata_file)
        ));
    }
    if let Some(subtitle_request_file) = subtitle_request_file.as_ref() {
        script_opts.push(format!(
            "streamnyaa_player-subtitle_request_file={}",
            path_for_player_option(subtitle_request_file)
        ));
    }
    if let Some(next_episode_request_file) = next_episode_request_file.as_ref() {
        script_opts.push(format!(
            "streamnyaa_player-next_episode_request_file={}",
            path_for_player_option(next_episode_request_file)
        ));
    }
    if let Some(player_setting_request_file) = player_setting_request_file.as_ref() {
        script_opts.push(format!(
            "streamnyaa_player-settings_request_file={}",
            path_for_player_option(player_setting_request_file)
        ));
    }
    script_opts.push(format!(
        "streamnyaa_player-preferences_file={}",
        path_for_player_option(&player_preferences_path())
    ));
    if !script_opts.is_empty() {
        command.arg(format!("--script-opts={}", script_opts.join(",")));
    }

    if let Some(player_skin) = player_skin {
        command.arg(format!("--script={}", player_skin.to_string_lossy()));
    }

    let child = command
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
        spawn_player_ipc_event_listener(ipc.clone());
        if let Some(metadata_file) = metadata_file.as_ref() {
            send_player_script_message_arg(
                &ipc,
                "streamnyaa-reload-meta",
                &path_for_player_option(metadata_file),
            );
            log_info("MPV metadata reload message sent after IPC listener attach");
        } else {
            send_player_script_message(&ipc, "streamnyaa-reload-meta");
            log_info(
                "MPV metadata reload message sent without metadata file after IPC listener attach",
            );
        }
        if let Some(subtitle_request_file) = subtitle_request_file {
            spawn_subtitle_import_request_watcher(ipc.clone(), subtitle_request_file);
        }
        if let Some(next_episode_request_file) = next_episode_request_file {
            spawn_next_episode_request_watcher(ipc.clone(), next_episode_request_file);
        }
        if let Some(player_setting_request_file) = player_setting_request_file {
            spawn_player_setting_request_watcher(ipc.clone(), player_setting_request_file);
        }
        send_player_script_message(&ipc, "streamnyaa-playback-ready");
        log_info("MPV playback-ready message sent after IPC listener attach");
        show_player_text_with_title(&ipc, Some(title), "Preparing torrent session...");
        if let Some(pending_cover) = metadata_launch.pending_cover.take() {
            spawn_player_cover_metadata_update(ipc.clone(), pending_cover);
        }
        log_info(format!(
            "Playback perf: opened MPV in {} ms{}",
            started_at.elapsed().as_millis(),
            if metadata_launch.cover_ready {
                " with preloaded cover"
            } else {
                ""
            }
        ));
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
    show_player_text_with_title(&ipc, Some(title), "Retrying the player handoff...");
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
    let _ = rqbit_delete(&format!("{}?with_files=false", path)).or_else(|_| rqbit_delete(&path));
    thread::sleep(Duration::from_millis(250));
    stop_rqbit_server(Some(&active.engine_path));
    thread::sleep(Duration::from_millis(250));
    if delete_files {
        safe_delete_dir(&active.session_dir);
    }
}

fn take_active_session() -> Option<ActiveSession> {
    let mut guard = manager().lock().ok()?;
    guard.buffer_sample = None;
    guard.active.take()
}

fn stop_active_session(delete_files: bool) {
    if let Some(active) = take_active_session() {
        cleanup_session(active, delete_files);
    }
}

fn spawn_player_watchdog() {
    thread::spawn(|| {
        const PLAYER_WATCHDOG_INTERVAL: Duration = Duration::from_millis(1200);
        const STORAGE_GUARD_INTERVAL: Duration = Duration::from_secs(5);

        enum WatchdogAction {
            PlayerExited(ActiveSession),
            GuardTrip {
                active: ActiveSession,
                ipc: Option<String>,
                reason: String,
            },
        }

        enum WatchdogWork {
            Action(WatchdogAction),
            StorageCheck {
                active: ActiveSession,
                ipc: Option<String>,
            },
            None,
        }

        let mut last_storage_guard_check = Instant::now() - STORAGE_GUARD_INTERVAL;

        loop {
            let work = {
                let mut guard = match manager().lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        thread::sleep(PLAYER_WATCHDOG_INTERVAL);
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
                    guard
                        .active
                        .take()
                        .map(WatchdogAction::PlayerExited)
                        .map(WatchdogWork::Action)
                        .unwrap_or(WatchdogWork::None)
                } else if last_storage_guard_check.elapsed() >= STORAGE_GUARD_INTERVAL {
                    last_storage_guard_check = Instant::now();
                    guard
                        .active
                        .clone()
                        .map(|active| WatchdogWork::StorageCheck {
                            active,
                            ipc: guard.player_ipc.clone(),
                        })
                        .unwrap_or(WatchdogWork::None)
                } else {
                    WatchdogWork::None
                }
            };

            let next_action = match work {
                WatchdogWork::Action(action) => Some(action),
                WatchdogWork::StorageCheck { active, ipc } => {
                    // Directory traversal can be expensive for large torrents. Keep it outside
                    // the player-manager lock so source switches and MPV commands stay responsive.
                    let session_bytes = dir_size(&active.session_dir);
                    let free_bytes = available_disk_bytes(&active.session_dir);
                    let over_session_limit = session_bytes > active.cache_limit_bytes;
                    let low_disk = free_bytes
                        .map(|value| value < MIN_PLAYBACK_FREE_BYTES)
                        .unwrap_or(false);
                    if over_session_limit || low_disk {
                        let mut guard = match manager().lock() {
                            Ok(guard) => guard,
                            Err(_) => {
                                thread::sleep(PLAYER_WATCHDOG_INTERVAL);
                                continue;
                            }
                        };
                        let still_current = guard.active.as_ref().map(|current| {
                            current.torrent_id == active.torrent_id
                                && current.session_dir == active.session_dir
                        }) == Some(true);
                        if still_current {
                            let active = guard.active.take().expect("active session exists");
                            let reason = if over_session_limit {
                                "The active stream was stopped because its temporary files exceeded the desktop storage guard.".to_string()
                            } else {
                                "The active stream was stopped because the device is too low on free space for safe playback.".to_string()
                            };
                            Some(WatchdogAction::GuardTrip {
                                active,
                                ipc,
                                reason,
                            })
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }
                WatchdogWork::None => None,
            };

            if let Some(action) = next_action {
                match action {
                    WatchdogAction::PlayerExited(active) => {
                        let cache_dir = active
                            .session_dir
                            .parent()
                            .map(Path::to_path_buf)
                            .unwrap_or_else(cache_root);
                        cleanup_session(active, false);
                        cleanup_transient_sessions(&cache_dir, None);
                        prune_cache(&cache_dir, None);
                        log_info("Closed playback session and retained reusable cached media");
                    }
                    WatchdogAction::GuardTrip {
                        active,
                        ipc,
                        reason,
                    } => {
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

            thread::sleep(PLAYER_WATCHDOG_INTERVAL);
        }
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

fn stream_session_cache_limit(
    source_size: Option<u64>,
    free_bytes: Option<u64>,
) -> Result<u64, String> {
    let requested = source_size
        .map(|size| size.saturating_add(512 * 1024 * 1024))
        .unwrap_or(PER_SESSION_CACHE_MAX_BYTES)
        .max(PER_SESSION_CACHE_MAX_BYTES)
        .min(MAX_SESSION_CACHE_BYTES);

    let Some(free_bytes) = free_bytes else {
        return Ok(requested);
    };
    let available_for_stream = free_bytes.saturating_sub(MIN_PLAYBACK_FREE_BYTES);
    if available_for_stream < MIN_INITIAL_PLAYBACK_BUFFER_BYTES.saturating_mul(3) {
        return Err(
            "Your device does not have enough safe temporary space to start local streaming."
                .to_string(),
        );
    }

    Ok(requested.min(available_for_stream))
}

fn looks_like_batch_source(title: &str) -> bool {
    let lower = title.to_ascii_lowercase();
    [
        " batch",
        "complete season",
        "season pack",
        " collection",
        "[batch]",
        " complete",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn torrent_stats(torrent_id: &str) -> Result<serde_json::Value, String> {
    let payload = rqbit_get(&format!(
        "/torrents/{}/stats/v1",
        percent_encode(torrent_id)
    ))
    .or_else(|_| rqbit_get(&format!("/torrents/{}", percent_encode(torrent_id))))?;
    serde_json::from_str(&payload)
        .map_err(|error| format!("Could not parse stream status: {}", error))
}

fn session_guard_error(
    cache_dir: &Path,
    session_dir: &Path,
    cache_limit_bytes: u64,
) -> Option<String> {
    let session_bytes = dir_size(session_dir);
    if session_bytes > cache_limit_bytes {
        return Some(format!(
            "This source used the safe temporary playback limit ({} MB). StreamNyaa stopped it before it could fill the drive.",
            cache_limit_bytes / 1024 / 1024
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
    cache_limit_bytes: u64,
    playback_generation: u64,
) -> Result<ResolvedStreamTarget, String> {
    let started_at = now_millis();
    let mut saw_peer = false;
    let mut selected_target: Option<ResolvedStreamTarget> = None;
    let mut selected_target_at: Option<u128> = None;
    let mut previous_downloaded_bytes = 0u64;
    let mut previous_sample_at = started_at;

    while now_millis().saturating_sub(started_at) <= STREAM_READY_TIMEOUT_MS {
        if !playback_generation_current(playback_generation) {
            if let Some(ipc) = player_ipc {
                show_player_text_with_title(ipc, Some(&request.anime_title), "Switching source...");
            }
            return Err(playback_superseded_error());
        }

        if let Some(error) = session_guard_error(cache_dir, session_dir, cache_limit_bytes) {
            if let Some(ipc) = player_ipc {
                show_player_text_with_title(
                    ipc,
                    Some(&request.anime_title),
                    "Stopping stream to protect local storage...",
                );
            }
            return Err(error);
        }

        let json = torrent_stats(torrent_id)?;
        let downloaded_bytes = find_number(
            &json,
            &["downloaded_bytes", "bytes_completed", "downloaded"],
        )
        .unwrap_or(0.0) as u64;
        let total_bytes = find_number(
            &json,
            &["total_bytes", "bytes_total", "size_bytes", "total_size"],
        )
        .unwrap_or(0.0) as u64;
        let peers = find_number(&json, &["peers", "num_peers", "live_peers", "peer_count"])
            .unwrap_or(0.0) as u64;
        let now = now_millis();
        let elapsed_ms = now.saturating_sub(previous_sample_at);
        let download_rate = if elapsed_ms >= 250 && downloaded_bytes >= previous_downloaded_bytes {
            Some(
                downloaded_bytes
                    .saturating_sub(previous_downloaded_bytes)
                    .saturating_mul(1000)
                    / elapsed_ms as u64,
            )
        } else {
            None
        };
        if elapsed_ms >= 450 {
            previous_downloaded_bytes = downloaded_bytes;
            previous_sample_at = now;
        }

        saw_peer |= peers > 0;

        if selected_target.is_none() {
            if let Ok(target) = playlist_target(torrent_id, request) {
                if let Some(target) = target {
                    selected_target_at = Some(now_millis());
                    selected_target = Some(target);
                }
            }
        }

        let target_buffer = if total_bytes > 0 {
            INITIAL_PLAYBACK_BUFFER_BYTES
                .min((total_bytes / 6).max(MIN_INITIAL_PLAYBACK_BUFFER_BYTES))
        } else {
            INITIAL_PLAYBACK_BUFFER_BYTES
        };

        if let Some(target) = selected_target.clone() {
            let target_age = selected_target_at
                .map(|value| now_millis().saturating_sub(value))
                .unwrap_or(0);
            let ready_for_player = downloaded_bytes >= target_buffer
                || (saw_peer && downloaded_bytes >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES)
                || (saw_peer
                    && downloaded_bytes > 0
                    && target_age >= STREAM_TARGET_HANDOFF_MS.saturating_mul(3))
                || target_age >= STREAM_TARGET_HANDOFF_MS.saturating_mul(4);
            if ready_for_player {
                if let Some(ipc) = player_ipc {
                    let progress = if total_bytes > 0 {
                        Some(
                            (downloaded_bytes as f64 / total_bytes as f64 * 100.0)
                                .clamp(0.0, 100.0),
                        )
                    } else {
                        None
                    };
                    update_player_stream_metrics(
                        ipc,
                        "Ready",
                        peers,
                        downloaded_bytes,
                        total_bytes,
                        progress,
                        download_rate,
                    );
                    if downloaded_bytes >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES || saw_peer {
                        show_player_text_with_title(
                            ipc,
                            Some(&request.anime_title),
                            "Starting playback...",
                        );
                    } else {
                        show_player_text_with_title(
                            ipc,
                            Some(&request.anime_title),
                            "Opening the player while the first buffer fills...",
                        );
                    }
                }
                return Ok(target);
            }
        }

        let status_text = if selected_target.is_none() && peers == 0 {
            "Preparing torrent session. Reading metadata and waiting for the first peers..."
                .to_string()
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
            format!(
                "Preparing the player handoff... {} MB cached",
                downloaded_bytes / 1024 / 1024
            )
        };
        if let Some(ipc) = player_ipc {
            let status_label = match (selected_target.is_some(), peers > 0) {
                (false, false) => "Metadata",
                (false, true) => "Matching",
                (true, true) => "Buffering",
                (true, false) => "Preparing",
            };
            let progress = if total_bytes > 0 {
                Some((downloaded_bytes as f64 / total_bytes as f64 * 100.0).clamp(0.0, 100.0))
            } else {
                None
            };
            update_player_stream_metrics(
                ipc,
                status_label,
                peers,
                downloaded_bytes,
                total_bytes,
                progress,
                download_rate,
            );
            show_player_text_with_title(ipc, Some(&request.anime_title), &status_text);
        }
        thread::sleep(Duration::from_millis(450));
    }

    if let Some(target) = selected_target {
        if let Some(ipc) = player_ipc {
            show_player_text_with_title(
                ipc,
                Some(&request.anime_title),
                "Opening the player while the source keeps buffering...",
            );
        }
        return Ok(target);
    }

    if !saw_peer && previous_downloaded_bytes == 0 {
        return Err(
            "No peers responded within 20 seconds. StreamNyaa will try another verified release."
                .to_string(),
        );
    }
    if saw_peer && previous_downloaded_bytes == 0 {
        return Err(
            "Peers connected, but this release delivered no video data. StreamNyaa will try another source."
                .to_string(),
        );
    }
    Err("Torrent data arrived, but no matching playable episode file was exposed in time. Try another release.".to_string())
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
        message: "The active playback session was stopped and its temporary files were cleaned."
            .to_string(),
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

fn start_stream(
    request: PlaybackRequest,
    playback_generation: u64,
) -> Result<PlaybackStatus, String> {
    let command_started_at = Instant::now();
    let title = playback_title(&request);
    let _operation_guard = acquire_playback_operation_for_switch(
        playback_generation,
        request.settings.clone(),
        &title,
    )?;
    ensure_playback_generation_current(playback_generation)?;
    let source_inputs = playback_source_candidates(&request)?;

    let status = runtime_status(request.settings.clone());
    ensure_playback_generation_current(playback_generation)?;
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
    log_info(format!(
        "Playback perf: command accepted in {} ms",
        command_started_at.elapsed().as_millis()
    ));
    let free_bytes = available_disk_bytes(&cache_dir);
    if let Some(free) = free_bytes {
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
    let source_size = parse_size_bytes(request.size.as_deref());
    let session_cache_limit = match stream_session_cache_limit(source_size, free_bytes) {
        Ok(limit) => limit,
        Err(message) => {
            return Ok(PlaybackStatus {
                ok: false,
                state: "low_storage".to_string(),
                message,
                title,
                torrent_id: None,
                playlist_url: None,
                media_url: None,
            });
        }
    };

    let session_dir = session_dir(&cache_dir, &request);
    let engine_dir = session_dir.join("engine");
    let media_dir = session_dir.join("media");
    ensure_playback_generation_current(playback_generation)?;
    fs::create_dir_all(&session_dir)
        .map_err(|error| format!("Could not create stream session: {}", error))?;
    fs::create_dir_all(&engine_dir)
        .map_err(|error| format!("Could not prepare the session engine folder: {}", error))?;
    fs::create_dir_all(&media_dir)
        .map_err(|error| format!("Could not prepare the session media folder: {}", error))?;
    let _ = fs::write(session_dir.join(".last-access"), now_millis().to_string());
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
            show_player_text_with_title(ipc, Some(&title), "Stopping previous stream...");
            stop_player_stream_only(ipc);
        }

        ensure_playback_generation_current(playback_generation)?;
        let player_open_started = Instant::now();
        let player_ipc = launch_or_reuse_player(player_path, &cache_dir, &request, &title)?;
        show_player_text_with_title(&player_ipc, Some(&title), "Preparing torrent session...");
        log_info(format!(
            "Playback perf: player visible before engine prep in {} ms",
            player_open_started.elapsed().as_millis()
        ));

        let cleanup_started = Instant::now();
        stop_active_session(false);
        cleanup_transient_sessions(&cache_dir, Some(&session_dir));
        prune_cache(&cache_dir, Some(&session_dir));
        log_info(format!(
            "Playback perf: previous session cleanup finished in {} ms",
            cleanup_started.elapsed().as_millis()
        ));

        ensure_playback_generation_current(playback_generation)?;
        let engine_path = status
            .torrent_engine_path
            .as_deref()
            .ok_or_else(|| "Torrent engine path is missing.".to_string())?;
        let engine_started = Instant::now();
        start_rqbit(engine_path, &engine_dir)?;
        show_player_text_with_title(
            &player_ipc,
            Some(&title),
            "Connecting to the local stream engine...",
        );
        log_info(format!(
            "Playback perf: rqbit ready in {} ms",
            engine_started.elapsed().as_millis()
        ));

        let add_path = format!(
            "/torrents?output_folder={}",
            percent_encode(&media_dir.to_string_lossy())
        );
        let mut add_payload = None;
        let last_index = source_inputs.len().saturating_sub(1);
        let add_started = Instant::now();
        for (index, source_input) in source_inputs.iter().enumerate() {
            ensure_playback_generation_current(playback_generation)?;
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
        log_info(format!(
            "Playback perf: torrent accepted in {} ms",
            add_started.elapsed().as_millis()
        ));
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
        let playlist_url = format!(
            "{}/torrents/{}/playlist",
            RQBIT_URL,
            percent_encode(&torrent_id)
        );

        {
            let mut guard = manager()
                .lock()
                .map_err(|_| "Playback manager is unavailable.".to_string())?;
            guard.active = Some(ActiveSession {
                torrent_id: torrent_id.clone(),
                session_dir: session_dir.clone(),
                engine_path: engine_path.to_string(),
                media_url: String::new(),
                cache_limit_bytes: session_cache_limit,
            });
        }

        show_player_text_with_title(&player_ipc, Some(&title), "Preparing torrent session...");
        let target_started = Instant::now();
        let target = wait_for_stream_with_session_guard(
            &torrent_id,
            &request,
            Some(&player_ipc),
            &cache_dir,
            &session_dir,
            session_cache_limit,
            playback_generation,
        )?;
        prioritize_stream_target(&torrent_id, &target);
        log_info(format!(
            "Playback perf: stream target ready in {} ms",
            target_started.elapsed().as_millis()
        ));

        ensure_playback_generation_current(playback_generation)?;
        {
            let mut guard = manager()
                .lock()
                .map_err(|_| "Playback manager is unavailable.".to_string())?;
            if let Some(active) = guard.active.as_mut() {
                active.media_url = target.media_url.clone();
            }
        }

        show_player_text_with_title(
            &player_ipc,
            Some(&title),
            "Opening the stream in the current player...",
        );
        if !load_player_target(&player_ipc, &title, &target, request.resume_seconds) {
            let _ = relaunch_player_and_load_target(
                player_path,
                &cache_dir,
                &request,
                &title,
                &target,
            )?;
        }

        log_info(format!(
            "Playback handed off to player for torrent {}",
            torrent_id
        ));
        log_info(format!(
            "Playback perf: command completed in {} ms",
            command_started_at.elapsed().as_millis()
        ));

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
        if !error.contains("superseded by a newer source") {
            remember_error(format!("{}: {}", title, error));
        } else {
            log_info(format!("Cancelled stale playback generation for {}", title));
        }
        stop_active_session(false);
        prune_cache(&cache_dir, None);
    }

    stream_result
}

#[tauri::command]
async fn play_local_torrent(request: PlaybackRequest) -> Result<PlaybackStatus, String> {
    let playback_generation = next_playback_generation();
    let title = playback_title(&request);
    log_info(format!(
        "Playback generation {} requested for {}",
        playback_generation, title
    ));
    notify_player_source_switch(&title);
    tauri::async_runtime::spawn_blocking(move || start_stream(request, playback_generation))
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
        let playlist_url = format!(
            "{}/torrents/{}/playlist",
            RQBIT_URL,
            percent_encode(&torrent_id)
        );
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
        let payload = match rqbit_get(&format!(
            "/torrents/{}/stats/v1",
            percent_encode(&torrent_id)
        ))
        .or_else(|_| rqbit_get(&format!("/torrents/{}", percent_encode(&torrent_id))))
        {
            Ok(payload) => payload,
            Err(error) => {
                if !still_active {
                    return Ok(LocalPlaybackProgress {
                        ok: false,
                        torrent_id,
                        state: "stopped".to_string(),
                        message:
                            "The local playback session ended and its temporary files were cleaned."
                                .to_string(),
                        progress: Some(100.0),
                        torrent_progress_percent: Some(100.0),
                        buffer_percent: None,
                        buffered_seconds: None,
                        buffering: false,
                        buffer_advancing: false,
                        stall_seconds: 0,
                        recovery_stage: "idle".to_string(),
                        current_seconds: None,
                        duration_seconds: None,
                        paused: None,
                        volume: None,
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
        let downloaded_bytes = find_number(
            &json,
            &["downloaded_bytes", "bytes_completed", "downloaded"],
        )
        .map(|value| value as u64);
        let total_bytes = find_number(
            &json,
            &["total_bytes", "bytes_total", "size_bytes", "total_size"],
        )
        .map(|value| value as u64);
        let progress = find_number(&json, &["progress", "progress_percent"]).or_else(|| {
            match (downloaded_bytes, total_bytes) {
                (Some(downloaded), Some(total)) if total > 0 => {
                    Some((downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
                }
                _ => None,
            }
        });
        let peers = find_number(&json, &["peers", "num_peers", "live_peers", "peer_count"])
            .map(|value| value as u64);
        let download_speed = find_number(&json, &["download_speed", "download_rate", "down_rate"]);
        let current_seconds = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "time-pos"));
        let duration_seconds = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "duration"));
        let paused = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_bool(ipc, "pause"));
        let volume = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "volume"));
        let buffered_seconds = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "demuxer-cache-duration"))
            .filter(|value| value.is_finite() && *value >= 0.0);
        let paused_for_cache = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_bool(ipc, "paused-for-cache"))
            .unwrap_or(false);
        let cache_buffering = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_f64(ipc, "cache-buffering-state"))
            .map(|value| value > 0.0 && value < 100.0)
            .unwrap_or(false);
        let demuxer_underrun = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_bool(ipc, "demuxer-cache-state/underrun"))
            .unwrap_or(false);
        let buffering = paused_for_cache || cache_buffering || demuxer_underrun;
        let buffer_percent = buffered_seconds
            .map(|seconds| (seconds / PLAYER_BUFFER_TARGET_SECONDS * 100.0).clamp(0.0, 100.0));
        let recovery_stage = player_ipc
            .as_deref()
            .and_then(|ipc| get_player_property_string(ipc, "user-data/streamnyaa/recovery_stage"))
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                if buffering {
                    "buffering".to_string()
                } else {
                    "idle".to_string()
                }
            });
        let now = now_millis();
        let current_value = current_seconds.unwrap_or(0.0);
        let buffered_value = buffered_seconds.unwrap_or(0.0);
        let downloaded_value = downloaded_bytes.unwrap_or(0);
        let (buffer_advancing, stall_seconds) = manager()
            .lock()
            .map(|mut guard| {
                let previous = guard
                    .buffer_sample
                    .as_ref()
                    .filter(|sample| sample.torrent_id == torrent_id);
                let advanced = previous
                    .map(|sample| {
                        current_value > sample.current_seconds + 0.12
                            || buffered_value > sample.buffered_seconds + 0.20
                    })
                    .unwrap_or(true);
                let _download_advancing = previous
                    .map(|sample| downloaded_value > sample.downloaded_bytes)
                    .unwrap_or(downloaded_value > 0);
                let last_advance_at = if !buffering || paused.unwrap_or(false) || advanced {
                    now
                } else {
                    previous.map(|sample| sample.last_advance_at).unwrap_or(now)
                };
                guard.buffer_sample = Some(BufferTelemetrySample {
                    torrent_id: torrent_id.clone(),
                    buffered_seconds: buffered_value,
                    current_seconds: current_value,
                    downloaded_bytes: downloaded_value,
                    last_advance_at,
                });
                let stalled_for = if buffering && !paused.unwrap_or(false) {
                    now.saturating_sub(last_advance_at) / 1000
                } else {
                    0
                };
                (advanced, stalled_for as u64)
            })
            .unwrap_or((false, 0));
        let state = if buffering {
            "buffering"
        } else if current_seconds.is_some() && duration_seconds.unwrap_or(0.0) > 0.0 {
            "ready"
        } else if downloaded_bytes.unwrap_or(0) >= MIN_INITIAL_PLAYBACK_BUFFER_BYTES {
            "buffering"
        } else if peers.unwrap_or(0) > 0 {
            "connecting"
        } else {
            "fetching_metadata"
        };
        if let Some(ipc) = player_ipc.as_deref() {
            let label = match state {
                "ready" => "Ready",
                "buffering" => "Buffering",
                "connecting" => "Peers",
                _ => "Metadata",
            };
            update_player_stream_metrics(
                ipc,
                label,
                peers.unwrap_or(0),
                downloaded_bytes.unwrap_or(0),
                total_bytes.unwrap_or(0),
                progress,
                download_speed.map(|value| value.max(0.0) as u64),
            );
        }
        Ok(LocalPlaybackProgress {
            ok: true,
            torrent_id,
            state: state.to_string(),
            message: match state {
                "ready" => {
                    "Playback is active. The selected episode has enough buffer to keep going."
                        .to_string()
                }
                "buffering" => {
                    "The player is open. StreamNyaa is still filling the playback buffer."
                        .to_string()
                }
                "connecting" => {
                    "Peers are responding. StreamNyaa is building the first playback buffer."
                        .to_string()
                }
                _ => "Reading torrent metadata and waiting for the first peers.".to_string(),
            },
            progress,
            torrent_progress_percent: progress,
            buffer_percent,
            buffered_seconds,
            buffering,
            buffer_advancing,
            stall_seconds,
            recovery_stage,
            current_seconds,
            duration_seconds,
            paused,
            volume,
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

#[tauri::command]
async fn control_local_player(
    request: PlayerControlRequest,
) -> Result<PlayerControlStatus, String> {
    tauri::async_runtime::spawn_blocking(move || control_player(request))
        .await
        .map_err(|error| format!("Player control task could not finish: {}", error))?
}

#[tauri::command]
async fn import_subtitle_for_current_player() -> Result<PlayerControlStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ipc = active_player_ipc()?;
        if !player_ipc_ready(&ipc, 1, 0) {
            return Err("The StreamNyaa player is not ready for subtitle import yet.".to_string());
        }
        match import_subtitle_for_ipc_guarded(&ipc)? {
            Some(_) => Ok(player_control_status(&ipc, "Subtitle import requested.")),
            None => Ok(player_control_status(&ipc, "Subtitle import cancelled.")),
        }
    })
    .await
    .map_err(|error| format!("Subtitle import task could not finish: {}", error))?
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
        trim_memory_cache(
            &mut cache,
            SOURCE_API_CACHE_TTL_MS,
            SOURCE_API_CACHE_MAX_ENTRIES,
        );
        if let Some(entry) = cache.get(trimmed_url) {
            log_info(format!("Desktop source API cache hit: {}", trimmed_url));
            return Ok(SourceApiResponse {
                data: entry.data.clone(),
                fetched_at: entry.fetched_at,
            });
        }
    }
    let client = source_http_client();
    let data = match fetch_nyaa_direct_from_api_url(trimmed_url) {
        Ok(data) => data,
        Err(direct_error) => {
            log_info(format!(
                "Direct Nyaa source search unavailable, trying hosted relay: {}",
                direct_error
            ));
            send_json_with_retry(client.get(trimmed_url), "hosted source relay")?
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
        trim_memory_cache(
            &mut cache,
            SOURCE_API_CACHE_TTL_MS,
            SOURCE_API_CACHE_MAX_ENTRIES,
        );
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

fn env_value(names: &[&str]) -> Option<String> {
    names
        .iter()
        .find_map(|name| env::var(name).ok().map(|value| value.trim().to_string()))
        .filter(|value| !value.is_empty())
}

fn disabled_provider_value(provider: &str, reason: &str) -> serde_json::Value {
    serde_json::json!({
        "provider": provider,
        "disabled": true,
        "reason": reason,
    })
}

fn safe_metadata_path(path: Option<&str>, provider: &str) -> Result<String, String> {
    let clean_path = path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} desktop metadata request is missing a path.", provider))?;
    if !clean_path.starts_with('/')
        || clean_path.contains("://")
        || clean_path.contains("..")
        || clean_path.contains('\\')
    {
        return Err(format!("{} desktop metadata path is not valid.", provider));
    }
    Ok(clean_path.to_string())
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

    let client = metadata_http_client();

    let data = match provider.as_str() {
        "anilist" => {
            let body = request
                .body
                .ok_or_else(|| "AniList desktop metadata request is missing a body.".to_string())?;
            send_json_with_retry(
                client.post("https://graphql.anilist.co").json(&body),
                "AniList metadata",
            )?
        }
        "jikan" => {
            let path = safe_metadata_path(request.path.as_deref(), "Jikan")?;
            let url = format!("https://api.jikan.moe/v4{}", path);
            send_json_with_retry(client.get(&url), "Jikan metadata")?
        }
        "tmdb" => {
            let path = safe_metadata_path(request.path.as_deref(), "TMDB")?;
            let bearer_token = env_value(&["TMDB_BEARER_TOKEN", "TMDB_READ_ACCESS_TOKEN"]);
            let api_key = env_value(&["TMDB_API_KEY"]);
            if bearer_token.is_none() && api_key.is_none() {
                disabled_provider_value(
                    "tmdb",
                    "TMDB is not configured. Add TMDB_BEARER_TOKEN or TMDB_API_KEY to enable poster and backdrop enrichment.",
                )
            } else {
                let mut url = reqwest::Url::parse(&format!("https://api.themoviedb.org/3{}", path))
                    .map_err(|error| format!("Could not prepare TMDB metadata URL: {}", error))?;
                if bearer_token.is_none() {
                    if let Some(key) = api_key {
                        if !url.query_pairs().any(|(key_name, _)| key_name == "api_key") {
                            url.query_pairs_mut().append_pair("api_key", &key);
                        }
                    }
                }
                let mut request_builder = client.get(url).header("Accept", "application/json");
                if let Some(token) = bearer_token {
                    request_builder = request_builder.bearer_auth(token);
                }
                send_json_with_retry(request_builder, "TMDB metadata")?
            }
        }
        "animeschedule" => {
            let path = safe_metadata_path(request.path.as_deref(), "AnimeSchedule")?;
            let mut request_builder = client
                .get(format!("https://animeschedule.net/api/v3{}", path))
                .header("Accept", "application/json")
                .header("User-Agent", "StreamNyaa Desktop Metadata Cache/1.0");
            if let Some(token) = env_value(&["ANIMESCHEDULE_TOKEN", "ANIMESCHEDULE_API_TOKEN"]) {
                request_builder = request_builder.bearer_auth(token);
            }
            send_json_with_retry(request_builder, "AnimeSchedule metadata")?
        }
        "anidb" => {
            let path = safe_metadata_path(request.path.as_deref(), "AniDB")?;
            let probe_url = reqwest::Url::parse(&format!("https://streamnyaa.local{}", path))
                .map_err(|error| format!("Could not read AniDB metadata path: {}", error))?;
            let request_name = probe_url
                .path_segments()
                .and_then(|mut segments| segments.next())
                .unwrap_or("anime")
                .trim()
                .to_ascii_lowercase();
            let aid = probe_url
                .query_pairs()
                .find(|(key, _)| key == "aid")
                .and_then(|(_, value)| value.parse::<u64>().ok())
                .ok_or_else(|| {
                    "AniDB desktop metadata request needs an aid query value.".to_string()
                })?;
            if request_name != "anime" || aid == 0 {
                return Err(
                    "AniDB desktop metadata currently supports /anime?aid=... only.".to_string(),
                );
            }

            let client_name = env_value(&["ANIDB_CLIENT"]);
            let client_version = env_value(&["ANIDB_CLIENT_VERSION", "ANIDB_CLIENTVER"]);
            if client_name.is_none() || client_version.is_none() {
                disabled_provider_value(
                    "anidb",
                    "AniDB is not configured. Register an AniDB HTTP API client and set ANIDB_CLIENT plus ANIDB_CLIENT_VERSION.",
                )
            } else {
                let mut url = reqwest::Url::parse("https://api.anidb.net:9001/httpapi")
                    .map_err(|error| format!("Could not prepare AniDB metadata URL: {}", error))?;
                url.query_pairs_mut()
                    .append_pair("request", "anime")
                    .append_pair("client", &client_name.unwrap_or_default())
                    .append_pair("clientver", &client_version.unwrap_or_default())
                    .append_pair("protover", "1")
                    .append_pair("aid", &aid.to_string());
                let xml = client
                    .get(url)
                    .header("Accept", "application/xml,text/xml,*/*")
                    .header("User-Agent", "StreamNyaa Desktop Metadata Cache/1.0")
                    .send()
                    .and_then(|response| response.error_for_status())
                    .map_err(|error| format!("AniDB desktop metadata request failed: {}", error))?
                    .text()
                    .map_err(|error| format!("Could not read AniDB metadata: {}", error))?;
                serde_json::json!({
                    "provider": "anidb",
                    "aid": aid,
                    "raw_xml": xml,
                })
            }
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
    cleanup_transient_sessions(&cache_dir, None);
    prune_cache(&cache_dir, None);
    clear_memory_caches();
    log_info(format!(
        "Startup maintenance completed for {}",
        cache_dir.to_string_lossy()
    ));
}

fn shutdown_desktop_runtime(reason: &str) {
    if let Ok(_operation_guard) = playback_operation_lock().try_lock() {
        let status = runtime_status(None);
        close_player_if_needed();
        stop_active_session(false);
        stop_rqbit_server(status.torrent_engine_path.as_deref());
        let cache_dir = PathBuf::from(status.cache_dir);
        cleanup_transient_sessions(&cache_dir, None);
        prune_cache(&cache_dir, None);
        clear_memory_caches();
    } else {
        close_player_if_needed();
        let status = runtime_status(None);
        stop_rqbit_server(status.torrent_engine_path.as_deref());
    }
    log_info(format!("StreamNyaa desktop runtime suspended: {}", reason));
}

fn suspend_runtime_to_tray() {
    if TRAY_SUSPEND_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    thread::spawn(|| {
        shutdown_desktop_runtime("window moved to tray");
        TRAY_SUSPEND_IN_PROGRESS.store(false, Ordering::SeqCst);
    });
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit_desktop_app(app: tauri::AppHandle) {
    if APP_EXITING.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(move || {
        shutdown_desktop_runtime("explicit tray quit");
        log_info("StreamNyaa desktop app closing");
        app.exit(0);
    });
}

fn install_system_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(
        app,
        "streamnyaa-show",
        "Open StreamNyaa",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(
        app,
        "streamnyaa-quit",
        "Quit StreamNyaa",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let mut builder = TrayIconBuilder::with_id("streamnyaa-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("StreamNyaa")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "streamnyaa-show" => show_main_window(app),
            "streamnyaa-quit" => quit_desktop_app(app.clone()),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for argument in argv {
                if let Ok(url) = tauri::Url::parse(&argument) {
                    publish_desktop_oauth_callback(app, &url);
                }
            }
            show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            log_info("StreamNyaa desktop app starting");
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;
            let deep_link_app = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    publish_desktop_oauth_callback(&deep_link_app, &url);
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    publish_desktop_oauth_callback(app.handle(), &url);
                }
            }
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                let _ = window.set_icon(icon);
            }
            install_system_tray(app)?;
            spawn_player_watchdog();
            thread::spawn(startup_maintenance);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" || APP_EXITING.load(Ordering::SeqCst) {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                suspend_runtime_to_tray();
            }
        })
        .invoke_handler(tauri::generate_handler![
            begin_desktop_google_oauth,
            take_pending_desktop_oauth_callback,
            fetch_desktop_metadata_api,
            fetch_desktop_source_api,
            clear_playback_cache,
            get_desktop_diagnostics,
            get_desktop_runtime_status,
            control_local_player,
            import_subtitle_for_current_player,
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
    fn desktop_google_oauth_accepts_only_the_streamnyaa_callback() {
        let valid = tauri::Url::parse(
            "https://opteiijnvuwstpdjxwlk.supabase.co/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=streamnyaa%3A%2F%2Fauth%2Fcallback%3Faction%3Dlogin%26next%3D%252Fprofile",
        )
        .expect("valid OAuth URL");
        assert!(validate_google_oauth_authorize_url(&valid).is_ok());

        let foreign_callback = tauri::Url::parse(
            "https://opteiijnvuwstpdjxwlk.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fexample.com%2Flogin%3Fdesktop_oauth%3D1",
        )
        .expect("valid URL with foreign callback");
        assert!(validate_google_oauth_authorize_url(&foreign_callback).is_err());
    }

    #[test]
    fn desktop_oauth_callback_requires_a_valid_action_and_route() {
        let callback = tauri::Url::parse(
            "streamnyaa://auth/callback?action=recovery&next=%2Freset-password#access_token=test",
        )
        .expect("valid callback URL");
        let parsed = parse_streamnyaa_auth_callback(&callback).expect("accepted callback");
        assert_eq!(parsed.action, "recovery");
        assert_eq!(parsed.next, "/reset-password");

        let foreign_callback =
            tauri::Url::parse("streamnyaa://profile#access_token=test").expect("valid foreign URL");
        assert!(parse_streamnyaa_auth_callback(&foreign_callback).is_none());

        let unsafe_route = tauri::Url::parse(
            "streamnyaa://auth/callback?action=login&next=https%3A%2F%2Fevil.example",
        )
        .expect("callback with unsafe route");
        assert_eq!(
            parse_streamnyaa_auth_callback(&unsafe_route)
                .expect("valid callback with sanitized route")
                .next,
            "/profile"
        );
    }

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
    fn player_control_bounds_are_safe_for_ipc() {
        assert_eq!(clamp_player_volume(-10.0), 0.0);
        assert_eq!(clamp_player_volume(160.0), 130.0);
        assert_eq!(clamp_player_speed(0.1), 0.25);
        assert_eq!(clamp_player_speed(4.0), 3.0);
        assert_eq!(clamp_player_seek_delta(900.0), 600.0);
        assert_eq!(clamp_player_seek_delta(f64::NAN), 0.0);
        assert_eq!(clamp_player_seek_absolute(-8.0), 0.0);
    }

    #[test]
    fn command_overrides_require_the_expected_executable_name() {
        let root = env::temp_dir().join(format!("streamnyaa-command-test-{}", now_millis()));
        let _ = fs::create_dir_all(&root);
        let expected = root.join("mpv.exe");
        let unexpected = root.join("unexpected.exe");
        fs::write(&expected, b"test").expect("expected command fixture");
        fs::write(&unexpected, b"test").expect("unexpected command fixture");

        assert_eq!(
            validated_command_candidate(&expected.to_string_lossy(), &["mpv", "mpv.exe"]),
            Some(expected.to_string_lossy().to_string())
        );
        assert_eq!(
            validated_command_candidate(&unexpected.to_string_lossy(), &["mpv", "mpv.exe"]),
            None
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn loading_frame_writes_supported_bitmap() {
        let root = env::temp_dir().join(format!("streamnyaa-loading-test-{}", now_millis()));
        fs::create_dir_all(&root).expect("create loading test dir");
        let request = playback_request_for_episode("1");
        let path =
            loading_frame(&root, &request, "Example Anime - Episode 1").expect("loading frame");
        let bytes = fs::read(&path).expect("read loading frame");
        assert_eq!(&bytes[0..2], b"BM");
        assert!(bytes.len() > 54);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn loading_frame_prefers_cover_placeholder_when_ready() {
        let root = env::temp_dir().join(format!("streamnyaa-loading-cover-test-{}", now_millis()));
        fs::create_dir_all(&root).expect("create loading cover test dir");
        let request = playback_request_for_episode("1");
        let cover_path = root.join("player-meta").join("loading-cover.jpg");
        fs::create_dir_all(cover_path.parent().expect("cover parent")).expect("cover dir");
        fs::write(&cover_path, b"not-empty-placeholder").expect("write cover placeholder");

        let path = loading_frame_for_player(
            &root,
            &request,
            "Example Anime - Episode 1",
            Some(&cover_path),
        )
        .expect("loading frame selection");

        assert_eq!(path, cover_path);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn player_cover_preparation_writes_valid_bgra() {
        let root = env::temp_dir().join(format!("streamnyaa-cover-test-{}", now_millis()));
        fs::create_dir_all(&root).expect("create cover test dir");
        let source_path = root.join("cover.png");
        let image = image::RgbaImage::from_fn(640, 360, |x, y| {
            image::Rgba([(x % 255) as u8, (y % 255) as u8, ((x + y) % 255) as u8, 255])
        });
        image::DynamicImage::ImageRgba8(image)
            .save(&source_path)
            .expect("write test cover");
        let mut request = playback_request_for_episode("1");
        request.poster = Some(source_path.to_string_lossy().to_string());

        let cover = prepare_player_cover(&root, &request)
            .expect("prepare cover")
            .expect("cover result");

        let poster_len = fs::metadata(&cover.path).expect("poster metadata").len();
        let poster_expected = cover.width as u64 * cover.height as u64 * 4;
        assert_eq!(poster_len, poster_expected);
        let background_len = fs::metadata(&cover.background_path)
            .expect("background metadata")
            .len();
        let background_expected =
            cover.background_width as u64 * cover.background_height as u64 * 4;
        assert_eq!(background_len, background_expected);
        assert_eq!(cover.background_width, PLAYER_COVER_BACKGROUND_WIDTH);
        assert_eq!(cover.background_height, PLAYER_COVER_BACKGROUND_HEIGHT);
        let loading_image_len = fs::metadata(&cover.loading_image_path)
            .expect("loading image metadata")
            .len();
        assert!(loading_image_len > 1024);
        assert_eq!(cover.loading_image_width, PLAYER_COVER_BACKGROUND_WIDTH);
        assert_eq!(cover.loading_image_height, PLAYER_COVER_BACKGROUND_HEIGHT);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn bundled_player_skin_script_is_available() {
        let script = bundled_player_skin_script().expect("player skin script");
        assert!(script.ends_with("streamnyaa-player.lua"));
    }

    #[test]
    fn stream_session_limit_allows_large_episode_sources_when_space_exists() {
        let source_size = Some(7 * 1024 * 1024 * 1024);
        let free_space = Some(20 * 1024 * 1024 * 1024);
        let limit = stream_session_cache_limit(source_size, free_space).expect("session limit");
        assert!(limit > PER_SESSION_CACHE_MAX_BYTES);
        assert!(limit <= MAX_SESSION_CACHE_BYTES);
    }

    #[test]
    fn stream_session_limit_preserves_safe_free_space() {
        let source_size = Some(9 * 1024 * 1024 * 1024);
        let free_space = Some(5 * 1024 * 1024 * 1024);
        let limit = stream_session_cache_limit(source_size, free_space).expect("session limit");
        assert_eq!(limit, 3 * 1024 * 1024 * 1024);
    }

    #[test]
    fn playback_source_uses_valid_magnet() {
        let hash = "0123456789abcdef0123456789abcdef01234567";
        let request = PlaybackRequest {
            magnet: format!("magnet:?xt=urn:btih:{}", hash),
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
        assert!(candidates[0].starts_with(&format!("magnet:?xt=urn:btih:{}", hash)));
        assert!(candidates[0].contains("&tr="));
    }

    #[test]
    fn playback_source_ignores_torrent_url_for_rqbit_handoff() {
        let hash = "0123456789abcdef0123456789abcdef01234567";
        let request: PlaybackRequest = serde_json::from_value(serde_json::json!({
            "magnet": format!("magnet:?xt=urn:btih:{}", hash),
            "torrent_url": "https://nyaa.si/view/98765",
            "info_hash": null,
            "title": "Source",
            "anime_title": "Anime",
            "episode": "1",
            "size": null,
            "poster": null,
            "banner": null,
            "resume_seconds": null,
            "settings": null
        }))
        .expect("request");

        let candidates = playback_source_candidates(&request).expect("source input");
        assert_eq!(candidates.len(), 2);
        assert!(candidates[0].starts_with(&format!("magnet:?xt=urn:btih:{}", hash)));
        assert!(candidates[0].contains("&tr="));
        assert_eq!(candidates[1], format!("magnet:?xt=urn:btih:{}", hash));
    }

    #[test]
    fn playback_source_rejects_torrent_url_without_hash() {
        let request: PlaybackRequest = serde_json::from_value(serde_json::json!({
            "magnet": "",
            "torrent_url": "https://nyaa.si/view/98765",
            "info_hash": "",
            "title": "Source",
            "anime_title": "Anime",
            "episode": "1",
            "size": null,
            "poster": null,
            "banner": null,
            "resume_seconds": null,
            "settings": null
        }))
        .expect("request");

        assert!(playback_source_candidates(&request).is_err());
    }

    #[test]
    fn playback_source_rebuilds_valid_magnet_from_info_hash() {
        let request = PlaybackRequest {
            magnet: "magnet:?xt=urn:btih:".to_string(),
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
        assert!(candidates[0]
            .starts_with("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567"));
    }

    fn playback_request_for_episode(episode: &str) -> PlaybackRequest {
        PlaybackRequest {
            magnet: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567".to_string(),
            info_hash: Some("0123456789abcdef0123456789abcdef01234567".to_string()),
            title: "Example Anime S01E05 1080p".to_string(),
            anime_title: "Example Anime".to_string(),
            episode: episode.to_string(),
            size: None,
            poster: None,
            banner: None,
            resume_seconds: None,
            settings: None,
        }
    }

    fn playlist_entry(label: &str, file_name: &str, kind: PlaylistKind) -> PlaylistEntry {
        PlaylistEntry {
            url: format!("http://127.0.0.1:3030/torrents/1/{}", file_name),
            label: label.to_string(),
            file_name: file_name.to_string(),
            file_stem: stem_from_name(file_name),
            file_index: None,
            kind,
        }
    }

    #[test]
    fn source_cache_directory_is_stable_for_the_same_info_hash() {
        let request = playback_request_for_episode("5");
        let root = PathBuf::from("C:/cache");
        assert_eq!(session_dir(&root, &request), session_dir(&root, &request));
        assert!(session_dir(&root, &request)
            .to_string_lossy()
            .contains("source-0123456789abcdef"));
    }

    #[test]
    fn playlist_parser_exposes_selected_file_indices_for_batch_streaming() {
        let request = playback_request_for_episode("5");
        let playlist = "#EXTM3U\n#EXTINF:-1,Example Anime S01E04.mkv\n/torrents/3/stream/0\n#EXTINF:-1,Example Anime S01E05.mkv\n/torrents/3/stream/1\n#EXTINF:-1,Example Anime S01E05.ass\n/torrents/3/stream/2\n";
        let entries = parse_playlist_entries("http://127.0.0.1:3030/torrents/3/playlist", playlist);
        let target = select_stream_target(&entries, &request).expect("target");
        assert!(target.media_url.ends_with("/stream/1"));
        assert_eq!(target.selected_file_indices, vec![1, 2]);
    }

    #[test]
    fn episode_number_parser_detects_sxe_and_episode_tokens() {
        let numbers = episode_numbers_in_text("Example Anime S02E05 - Episode 06 preview");
        assert!(numbers.contains(&5));
        assert!(numbers.contains(&6));
    }

    #[test]
    fn source_query_parser_ignores_video_resolutions() {
        assert_eq!(parse_episode_from_query("Example Anime 1440p"), None);
        assert_eq!(parse_episode_from_query("Example Anime 2160p UHD"), None);
        assert_eq!(
            parse_episode_from_query("Example Anime Episode 12 1440p"),
            Some(12)
        );
    }

    #[test]
    fn playlist_target_prefers_requested_episode_over_wrong_episode() {
        let request = playback_request_for_episode("5");
        let entries = vec![
            playlist_entry(
                "Example Anime S01E04 1080p.mkv",
                "Example.Anime.S01E04.1080p.mkv",
                PlaylistKind::Video,
            ),
            playlist_entry(
                "Example Anime S01E05 720p.mkv",
                "Example.Anime.S01E05.720p.mkv",
                PlaylistKind::Video,
            ),
        ];

        let target = select_stream_target(&entries, &request).expect("target");
        assert!(target.media_url.contains("S01E05"));
    }

    #[test]
    fn playlist_target_avoids_auxiliary_video_when_episode_exists() {
        let request = playback_request_for_episode("5");
        let entries = vec![
            playlist_entry(
                "Example Anime S01E05 NCOP.mkv",
                "Example.Anime.S01E05.NCOP.mkv",
                PlaylistKind::Video,
            ),
            playlist_entry(
                "Example Anime S01E05 1080p.mkv",
                "Example.Anime.S01E05.1080p.mkv",
                PlaylistKind::Video,
            ),
        ];

        let target = select_stream_target(&entries, &request).expect("target");
        assert!(target.media_url.contains("1080p"));
        assert!(!target.media_url.contains("NCOP"));
    }

    #[test]
    fn playback_source_rejects_missing_hash_and_url() {
        let request = PlaybackRequest {
            magnet: "magnet:?xt=urn:btih:".to_string(),
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
    fn direct_nyaa_parser_keeps_batch_candidates_for_native_file_selection() {
        let xml = r#"
          <rss><channel><item>
            <title>[Group] Test Anime 01-12 Complete Season Batch [1080p]</title>
            <link>https://nyaa.si/view/124</link>
            <nyaa:seeders>18</nyaa:seeders>
            <nyaa:leechers>2</nyaa:leechers>
            <nyaa:downloads>400</nyaa:downloads>
            <nyaa:infoHash>ABC124</nyaa:infoHash>
            <nyaa:categoryId>1_2</nyaa:categoryId>
            <nyaa:category>Anime - English-translated</nyaa:category>
            <nyaa:size>14.2 GiB</nyaa:size>
          </item></channel></rss>
        "#;

        let items = parse_nyaa_rss_items(xml, "Test Anime 02", "1_2", 1, 1);
        assert_eq!(items.len(), 1);
        assert!(items[0]["title"]
            .as_str()
            .unwrap_or_default()
            .contains("01-12"));
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
