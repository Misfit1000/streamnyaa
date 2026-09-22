//! Durable, device-local release downloads. Playback never owns these files/processes.
use super::*;
static OFFLINE_GENERATION: AtomicU64 = AtomicU64::new(0);
static OFFLINE_SESSION: Mutex<Option<(String, String, PathBuf)>> = Mutex::new(None);
static OFFLINE_NEXT_EPOCH: AtomicU64 = AtomicU64::new(0);
static OFFLINE_NEXT_BUSY: AtomicBool = AtomicBool::new(false);

pub fn handle_next_request(reason: &str, request_id: &str) -> bool {
    let session = OFFLINE_SESSION.lock().ok().and_then(|value| value.clone());
    let Some((id, file, target)) = session else { return false; };
    let ipc = manager().lock().ok().and_then(|value| value.player_ipc.clone());
    let Some(ipc) = ipc else { return false; };
    if get_player_property_string(&ipc, "path").and_then(|value| PathBuf::from(value).canonicalize().ok()).as_ref() != Some(&target) { return false; }
    if reason == "ended" && get_player_property_string(&ipc, "user-data/streamnyaa/next-enabled").as_deref() != Some("true") { return true; }
    if reason == "cancel" { OFFLINE_NEXT_EPOCH.fetch_add(1, Ordering::SeqCst); return true; }
    if OFFLINE_NEXT_BUSY.swap(true, Ordering::SeqCst) { return true; }
    let generation = OFFLINE_NEXT_EPOCH.load(Ordering::SeqCst);
    let request_id = request_id.to_string();
    thread::spawn(move || {
        let result = get_offline_files(id.clone()).and_then(|files| {
            let current = files.iter().position(|value| value == &file).ok_or("Current offline file is missing")?;
            let next = files.get(current + 1).filter(|next| Path::new(next).parent() == Path::new(&file).parent()).ok_or("No next offline video in this folder.")?;
            if OFFLINE_NEXT_EPOCH.load(Ordering::SeqCst) != generation || get_player_property_string(&ipc, "path").and_then(|value| PathBuf::from(value).canonicalize().ok()).as_ref() != Some(&target) { return Ok(()); }
            play_offline_file(id, next.clone(), Some(false), None)
        });
        if let Err(error) = result { show_player_text(&ipc, &error); let _ = send_mpv(&ipc, &serde_json::json!({"command":["script-message","streamnyaa-next-episode-status",request_id,"unavailable"]}).to_string()); }
        OFFLINE_NEXT_BUSY.store(false, Ordering::SeqCst);
    });
    true
}

fn natural_file_key(path: &Path) -> String {
    let mut key = String::new(); let mut digits = String::new();
    for ch in path.to_string_lossy().to_lowercase().chars().chain(std::iter::once('\0')) {
        if ch.is_ascii_digit() { digits.push(ch); continue; }
        if !digits.is_empty() { key.push_str(&format!("{:0>20}", digits)); digits.clear(); }
        key.push(ch);
    }
    key
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineProgress { #[serde(default)] owner: Option<String>, seconds: f64, duration: f64, updated_at: u64, completed: bool, #[serde(default)] watched_coverage: Option<serde_json::Value> }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFile { index: usize, name: String, bytes: u64 }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineIdentity { anime_id: String, title: String, episode: u32, poster: Option<String> }
impl OfflineIdentity {
    fn valid(&self) -> bool { !self.anime_id.trim().is_empty() && self.anime_id.len() <= 200 && !self.title.trim().is_empty() && self.title.len() <= 500 && self.episode > 0 && self.episode <= 100000 && self.poster.as_ref().is_none_or(|value| value.len() <= 4096 && (value.starts_with("https://") || value.is_empty())) }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    id: String, title: String, magnet: String, state: String,
    downloaded: u64, total: u64, error: Option<String>,
    #[serde(default)] speed_bps: Option<u64>,
    #[serde(default)] choose_files: bool,
    #[serde(default)] files: Vec<DownloadFile>,
    #[serde(default)] selected_files: Option<Vec<usize>>,
    #[serde(default)] progress: std::collections::HashMap<String, OfflineProgress>,
    #[serde(default)] relocated_folder: Option<String>,
    #[serde(default)] storage_root: Option<String>,
    #[serde(default)] episode_links: HashMap<String, OfflineIdentity>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Queue { version: u32, limit_bps: u64, items: Vec<Download>, #[serde(default)] download_directory: Option<String> }
impl Default for Queue {
    fn default() -> Self { Self { version: 1, limit_bps: 0, items: Vec::new(), download_directory: None } }
}
fn root() -> PathBuf { player_preferences_path().with_file_name("offline") }
fn item_root(item: &Download) -> PathBuf { item.storage_root.as_ref().map(PathBuf::from).unwrap_or_else(root) }
fn location_lock() -> &'static Mutex<()> { static LOCK: Mutex<()> = Mutex::new(()); &LOCK }
fn pick_location() -> Result<Option<Queue>, String> {
    let Some(folder) = open_download_folder_picker()? else { return Ok(None); };
    let folder = folder.canonicalize().map_err(|_| "Selected folder is unavailable.")?;
    if !folder.is_dir() { return Err("Choose a folder for downloads.".into()); }
    // Probe only a uniquely named file owned by this operation.
    let probe = folder.join(format!(".streamnyaa-write-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()));
    let file = fs::OpenOptions::new().write(true).create_new(true).open(&probe).map_err(|_| "Cannot write to that folder. Choose a writable location.")?;
    drop(file);
    fs::remove_file(&probe).map_err(|_| "Cannot remove files in that folder. Choose another location.")?;
    change(|queue| { queue.download_directory = Some(folder.to_string_lossy().into_owned()); Ok(()) }).map(Some)
}
fn ensure_location() -> Result<String, String> {
    let _guard = location_lock().lock().map_err(|_| "Location picker unavailable")?;
    if let Some(directory) = get_download_queue()?.download_directory { return Ok(directory); }
    pick_location()?.and_then(|queue| queue.download_directory).ok_or_else(|| "Download cancelled; no folder was selected.".into())
}
#[tauri::command]
pub async fn choose_download_directory() -> Result<Option<Queue>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = location_lock().lock().map_err(|_| "Location picker unavailable")?;
        pick_location()
    }).await.map_err(|_| "Location picker stopped")?
}
#[cfg(windows)]
fn open_download_folder_picker() -> Result<Option<PathBuf>, String> {
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Choose where StreamNyaa saves downloads. You can change this later in Settings.'
$dialog.ShowNewFolderButton = $true
$owner = New-Object System.Windows.Forms.Form
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.Show()
try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath } }
finally { $dialog.Dispose(); $owner.Dispose() }
"#;
    let output = prepared_command("powershell").args(["-NoProfile", "-STA", "-Command", script]).stdin(Stdio::null()).output().map_err(|_| "Could not open download folder picker")?;
    if !output.status.success() { return Err("Could not open download folder picker".into()); }
    let value = String::from_utf8_lossy(&output.stdout).trim().trim_start_matches('\u{feff}').to_string();
    Ok((!value.is_empty()).then(|| PathBuf::from(value)))
}
#[cfg(not(windows))]
fn open_download_folder_picker() -> Result<Option<PathBuf>, String> { Err("Folder selection is supported on Windows.".into()) }
fn path() -> PathBuf { player_preferences_path().with_file_name("download-queue.json") }
fn queue() -> &'static Mutex<Result<Queue, String>> {
    static QUEUE: OnceLock<Mutex<Result<Queue, String>>> = OnceLock::new();
    QUEUE.get_or_init(|| Mutex::new(load()))
}
fn load() -> Result<Queue, String> {
    let bytes = match fs::read(path()) { Ok(b) => b, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Queue::default()), Err(_) => return Err("Could not read download queue.".into()) };
    decode(&bytes)
}
fn decode(bytes: &[u8]) -> Result<Queue, String> {
    if bytes.len() > 2_000_000 { return Err("Download queue is too large.".into()); }
    let mut value: Queue = serde_json::from_slice(bytes).map_err(|_| "Download queue is damaged; the original file has been retained.")?;
    let mut ids = std::collections::HashSet::new();
    if value.version != 1 || value.limit_bps > 1_000_000_000 || value.items.len() > 500 || value.items.iter().any(|item| !valid_id(&item.id)
        || !ids.insert(item.id.clone()) || item.title.is_empty() || item.title.len() > 500 || item.magnet.len() > 16_384 || item.files.len() > 5000 || item.progress.len() > 5000 || item.progress.iter().any(|(file, progress)| file.len() > 4096 || !progress.seconds.is_finite() || !progress.duration.is_finite() || progress.seconds < 0.0 || progress.duration < 0.0)
        || item.files.iter().any(|file| file.index > 100000 || file.name.len() > 4096)
        || item.episode_links.len() > 5000 || item.episode_links.iter().any(|(file, identity)| file.len() > 4096 || !identity.valid())
        || item.selected_files.as_ref().is_some_and(|indices| indices.is_empty() || indices.len() > 5000 || indices.iter().any(|index| !item.files.iter().any(|file| file.index == *index)))
        || magnet_info_hash(&item.magnet).is_none_or(|hash| !hash.eq_ignore_ascii_case(&item.id))
        || !matches!(item.state.as_str(), "queued" | "downloading" | "verifying" | "paused" | "failed" | "cancelled" | "completed")) {
        return Err("Unsupported download queue; original data retained.".into());
    }
    for item in &mut value.items {
        // Restart requires explicit resume, including after a power failure.
        if matches!(item.state.as_str(), "downloading" | "queued" | "verifying") { item.state = "paused".into(); }
    }
    Ok(value)
}
fn valid_id(id: &str) -> bool { id.len() == 40 && id.bytes().all(|b| b.is_ascii_hexdigit()) }
fn owned_folder_at(id: &str, base: &Path) -> Result<PathBuf, String> {
    if !valid_id(id) { return Err("Invalid download identity.".into()); }
    fs::create_dir_all(base).map_err(|_| "Could not create Offline Library")?;
    let directory = base.join(id);
    match fs::create_dir(&directory) {
        Ok(()) => fs::write(directory.join(".streamnyaa-owner"), id).map_err(|_| "Could not mark download ownership")?,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(_) => return Err("Could not create download folder.".into()),
    }
    let canonical = directory.canonicalize().map_err(|_| "Download folder unavailable")?;
    let canonical_root = base.canonicalize().map_err(|_| "Offline Library unavailable")?;
    if canonical.parent() != Some(canonical_root.as_path()) || fs::read_to_string(directory.join(".streamnyaa-owner")).ok().as_deref() != Some(id) {
        return Err("Download folder is not owned by this queue. Existing files have been retained.".into());
    }
    Ok(directory)
}
fn publish(value: &Queue) -> Result<(), String> {
    let target = path();
    fs::create_dir_all(target.parent().ok_or("Invalid download directory")?).map_err(|_| "Could not create download directory")?;
    let encoded = serde_json::to_vec(value).map_err(|_| "Invalid queue")?;
    if encoded.len() > 2_000_000 { return Err("Download state is full. Remove an old queue entry before adding more files.".into()); }
    let temporary = target.with_extension("json.tmp");
    let mut file = fs::File::create(&temporary).map_err(|_| "Could not save download queue")?;
    file.write_all(&encoded).map_err(|_| "Could not save download queue")?;
    file.sync_all().map_err(|_| "Could not flush download queue")?;
    fs::rename(temporary, target).map_err(|_| "Could not publish download queue")?;
    if let Some(app) = APP_HANDLE.get() { let _ = app.emit("streamnyaa-downloads-changed", serde_json::json!({ "version": 1, "transfers": value.items.iter().filter(|item| item.state=="downloading").map(|item|serde_json::json!({"id":item.id,"speedBps":item.speed_bps,"downloaded":item.downloaded,"total":item.total})).collect::<Vec<_>>() })); }
    Ok(())
}
fn change(f: impl FnOnce(&mut Queue) -> Result<(), String>) -> Result<Queue, String> {
    let mut guard = queue().lock().map_err(|_| "Download queue unavailable")?;
    let value = guard.as_mut().map_err(|e| e.clone())?;
    let mut next = value.clone(); f(&mut next)?; publish(&next)?; *value = next;
    Ok(value.clone())
}
#[tauri::command]
pub fn get_download_queue() -> Result<Queue, String> { queue().lock().map_err(|_| "Download queue unavailable")?.clone() }
#[tauri::command]
pub async fn enqueue_download(title: String, magnet: String) -> Result<Queue, String> {
    tauri::async_runtime::spawn_blocking(move || enqueue_release(title, magnet, false)).await.map_err(|_| "Download task stopped")?
}
pub fn enqueue_release(title: String, magnet: String, choose_files: bool) -> Result<Queue, String> {
    if title.trim().is_empty() || title.len() > 500 || magnet.len() > 16_384 { return Err("Invalid download source.".into()); }
    let id = magnet_info_hash(&magnet).filter(|id| valid_id(id)).ok_or("A verified torrent hash is required.")?.to_lowercase();
    let storage_root = ensure_location()?;
    change(|queue| {
        if queue.items.iter().any(|item| item.id == id) { return Err("This release is already in Downloads.".into()); }
        if queue.items.len() >= 500 { return Err("Remove an old download before adding another.".into()); }
        queue.items.push(Download { id, title, magnet, state: "queued".into(), downloaded: 0, total: 0, error: None, choose_files, files: Vec::new(), selected_files: None, progress: Default::default(), relocated_folder: None, storage_root: Some(storage_root), episode_links: HashMap::new(), speed_bps: None }); Ok(())
    })
}
#[tauri::command]
pub async fn enqueue_download_selection(title: String, magnet: String) -> Result<Queue, String> {
    tauri::async_runtime::spawn_blocking(move || enqueue_release(title, magnet, true)).await.map_err(|_| "Download task stopped")?
}
#[tauri::command]
pub fn select_download_files(id: String, indices: Vec<usize>) -> Result<Queue, String> {
    change(|queue| {
        let item = queue.items.iter_mut().find(|item| item.id == id).ok_or("Download no longer exists")?;
        if !matches!(item.state.as_str(), "paused" | "failed" | "cancelled" | "completed") { return Err("Pause the release before changing its file selection.".into()); }
        if indices.is_empty() || indices.len() > 5000 || indices.iter().any(|index| !item.files.iter().any(|file| file.index == *index)) { return Err("Choose files from the resolved release.".into()); }
        item.selected_files = Some(indices); item.state = "queued".into(); item.error = None; Ok(())
    })
}
#[tauri::command]
pub fn control_downloads(ids: Vec<String>, action: String) -> Result<Queue, String> {
    if ids.is_empty() || ids.len() > 500 || !matches!(action.as_str(), "pause" | "resume" | "cancel" | "retry") { return Err("Invalid download action.".into()); }
    let stop = !matches!(action.as_str(), "resume" | "retry") && get_download_queue()?.items.iter().any(|item| ids.contains(&item.id) && item.state == "downloading");
    let result = change(|queue| {
        for id in &ids { if !queue.items.iter().any(|item| &item.id == id) { return Err("Download no longer exists.".into()); } }
        for item in &mut queue.items {
            if !ids.contains(&item.id) || (item.state == "completed" && action != "retry") { continue; }
            if matches!(action.as_str(), "resume" | "retry") && item.choose_files && !item.files.is_empty() && item.selected_files.is_none() { return Err("Choose episodes/files before resuming this release.".into()); }
            item.state = match action.as_str() { "pause" => "paused", "resume" | "retry" => "queued", _ => "cancelled" }.into(); item.error = None;
        } Ok(())
    });
    if result.is_ok() && stop { shutdown(); }
    result
}
#[tauri::command]
pub fn remove_download(id: String) -> Result<Queue, String> {
    if !valid_id(&id) { return Err("Invalid download identity.".into()); }
    // A worker must have released its directory before files can be removed.
    if process_slot().lock().map_err(|_| "Downloads unavailable")?.is_some() { return Err("Pause downloads and wait for the engine to stop before removing files.".into()); }
    change(|queue| {
        let item = queue.items.iter().find(|item| item.id == id).ok_or("Download no longer exists")?;
        if matches!(item.state.as_str(), "queued" | "downloading") { return Err("Cancel or pause this download first.".into()); }
        if item.relocated_folder.is_some() { queue.items.retain(|item| item.id != id); return Ok(()); }
        let base = item_root(item);
        let folder = base.join(&id);
        if folder.exists() {
            owned_folder_at(&id, &base)?;
            let canonical_root = base.canonicalize().map_err(|_| "Offline folder is unavailable")?;
            let canonical_folder = folder.canonicalize().map_err(|_| "Offline folder is unavailable")?;
            if canonical_folder.parent() != Some(canonical_root.as_path()) || folder.symlink_metadata().map_err(|_| "Offline folder is unavailable")?.file_type().is_symlink() { return Err("Offline folder moved; remove it manually.".into()); }
            fs::remove_dir_all(&canonical_folder).map_err(|_| "Could not remove offline files. Close the video and retry.")?;
        }
        queue.items.retain(|item| item.id != id); Ok(())
    })
}
#[tauri::command]
pub fn forget_download(id: String) -> Result<Queue, String> {
    if !valid_id(&id) { return Err("Invalid download identity.".into()); }
    change(|queue| {
        let item=queue.items.iter().find(|item| item.id==id).ok_or("Download no longer exists")?;
        if matches!(item.state.as_str(),"queued"|"downloading"|"verifying") { return Err("Pause or cancel the transfer first.".into()); }
        queue.items.retain(|item| item.id!=id); Ok(())
    })
}
#[tauri::command]
pub fn open_download_destination(id: String) -> Result<(), String> {
    if !valid_id(&id) { return Err("Invalid download identity.".into()); }
    let queue=get_download_queue()?;
    let item=queue.items.iter().find(|item|item.id==id).ok_or("Download no longer exists")?;
    let folder=item.relocated_folder.as_ref().map(PathBuf::from).unwrap_or_else(||item_root(item).join(&id));
    let folder=folder.canonicalize().map_err(|_|"Download folder is missing. Locate it or retry the download.")?;
    if !folder.is_dir(){return Err("Download location is not a folder.".into());}
    Command::new("explorer.exe").arg(folder).spawn().map_err(|_|"Could not open download folder.")?;
    Ok(())
}
#[tauri::command]
pub fn set_download_limit(limit_bps: u64) -> Result<Queue, String> {
    if limit_bps > 1_000_000_000 { return Err("Invalid bandwidth limit.".into()); }
    change(|queue| { queue.limit_bps = limit_bps; Ok(()) })
}
fn media_files(directory: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new(); let mut pending = vec![directory.to_path_buf()];
    while let Some(folder) = pending.pop() {
        for entry in fs::read_dir(folder).map_err(|_| "Downloaded files are missing or unreadable.")? {
            let entry = entry.map_err(|_| "Could not read downloaded files.")?;
            let kind = entry.file_type().map_err(|_| "Could not read downloaded file.")?;
            if kind.is_symlink() { continue; }
            if kind.is_dir() { pending.push(entry.path()); }
            else if entry.path().extension().and_then(|s| s.to_str()).is_some_and(|s| ["mkv", "mp4", "webm", "avi", "m4v"].contains(&s.to_ascii_lowercase().as_str())) { result.push(entry.path()); }
            if result.len() + pending.len() > 5000 { return Err("Too many offline files.".into()); }
        }
    }
    result.sort_by_cached_key(|path| natural_file_key(path)); Ok(result)
}
#[tauri::command]
pub fn get_offline_files(id: String) -> Result<Vec<String>, String> {
    let snapshot = get_download_queue()?;
    if !snapshot.items.iter().any(|item| item.id == id && item.state == "completed") { return Err("This download is not complete.".into()); }
    let item = snapshot.items.iter().find(|item| item.id == id).ok_or("Release not found")?;
    let folder = item.relocated_folder.as_ref().map(PathBuf::from).unwrap_or_else(|| item_root(item).join(id));
    Ok(media_files(&folder)?.into_iter().filter(|file| item.selected_files.as_ref().is_none_or(|indices| item.files.iter().any(|entry| indices.contains(&entry.index) && file.ends_with(Path::new(&entry.name))))).filter_map(|file| file.strip_prefix(&folder).ok().map(|p| p.to_string_lossy().to_string())).collect())
}
#[tauri::command]
pub fn link_offline_episode(id: String, file: String, identity: Option<OfflineIdentity>) -> Result<Queue, String> {
    if identity.as_ref().is_some_and(|value| !value.valid()) { return Err("Choose a valid anime and episode number.".into()); }
    if !get_offline_files(id.clone())?.contains(&file) { return Err("Offline video is missing.".into()); }
    change(|queue| {
        let item = queue.items.iter_mut().find(|item| item.id == id).ok_or("Release no longer exists")?;
        if let Some(identity) = identity { item.episode_links.insert(file, identity); }
        else { item.episode_links.remove(&file); }
        Ok(())
    })
}
#[tauri::command]
pub fn relink_offline_folder(id: String, directory: String) -> Result<Queue, String> {
    if !valid_id(&id) || directory.len() > 4096 { return Err("Invalid offline directory.".into()); }
    let folder = PathBuf::from(directory).canonicalize().map_err(|_| "Folder not found.")?;
    if fs::read_to_string(folder.join(".streamnyaa-owner")).ok().as_deref() != Some(&id) { return Err("Choose the original release folder containing its StreamNyaa ownership marker.".into()); }
    if media_files(&folder)?.is_empty() { return Err("No supported videos in this folder.".into()); }
    change(|queue| { let item = queue.items.iter_mut().find(|item| item.id == id && item.state == "completed").ok_or("Only completed releases can be relocated.")?;
        item.relocated_folder = Some(folder.to_string_lossy().into_owned()); Ok(()) })
}
#[tauri::command]
pub fn play_offline_file(id: String, file: String, resume: Option<bool>, checkpoint_seconds: Option<f64>) -> Result<(), String> {
    let files = get_offline_files(id.clone())?;
    if !files.contains(&file) { return Err("Offline video is missing.".into()); }
    let snapshot = get_download_queue()?;
    let item = snapshot.items.iter().find(|item| item.id == id).ok_or("Release not found")?;
    let folder = item.relocated_folder.as_ref().map(PathBuf::from).unwrap_or_else(|| item_root(item).join(&id)).canonicalize().map_err(|_| "Offline folder is missing")?;
    let target = folder.join(&file).canonicalize().map_err(|_| "Offline video is missing")?;
    if !target.starts_with(&folder) { return Err("Invalid offline video path.".into()); }
    let checkpoint = if resume.unwrap_or(false) { checkpoint_seconds.filter(|value| value.is_finite() && *value >= 0.0).or_else(|| item.progress.get(&file).filter(|value| !value.completed).map(|value| value.seconds)).unwrap_or(0.0) } else { 0.0 };
    OFFLINE_NEXT_EPOCH.fetch_add(1, Ordering::SeqCst);
    let generation = OFFLINE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let _operation = playback_operation_lock().lock().map_err(|_| "Playback is busy")?;
    stop_active_session(false);
    let status = runtime_status(None);
    let player = status.player_path.ok_or("Bundled player is unavailable")?;
    let identity = item.episode_links.get(&file);
    let title = identity.map(|value| value.title.clone()).unwrap_or_else(|| item.title.clone());
    let request = PlaybackRequest { progress_context: None, magnet: String::new(), info_hash: Some(id.clone()), title: title.clone(), anime_title: title, episode: identity.map(|value| value.episode.to_string()).unwrap_or_default(), size: None, poster: identity.and_then(|value| value.poster.clone()), banner: None, banner_candidates: None, resume_seconds: Some(checkpoint), settings: None };
    let ipc = launch_or_reuse_player(&player, &root().join("player-meta"), &request, &file)?;
    let context=playback_progress::Context {
        owner: playback_progress::current_owner(), anime_id: identity.map(|v|v.anime_id.to_string()).unwrap_or_default(),
        title:request.anime_title.clone(),episode:request.episode.clone(),source_key:format!("offline:{}:{}",id,file),poster:request.poster.clone(),
        offline_id:Some(id.clone()),offline_file:Some(file.clone()),baseline:Default::default()
    };
    playback_progress::begin(&ipc,context);
    if !load_player_target(&ipc,&request.anime_title,&ResolvedStreamTarget {media_url:target.to_string_lossy().to_string(),subtitle_urls:vec![],selected_file_indices:vec![],selected_file_name:file.clone()},None) { return Err("Could not open offline video. Your checkpoint is retained.".into()); }
    if let Ok(mut session) = OFFLINE_SESSION.lock() { *session = Some((id.clone(), file.clone(), target.clone())); }
    thread::spawn(move || {
        let mut loaded = false;
        for _ in 0..80 {
            if OFFLINE_GENERATION.load(Ordering::SeqCst) != generation { return; }
            if get_player_property_string(&ipc, "path").and_then(|path| PathBuf::from(path).canonicalize().ok()).as_ref() == Some(&target)
                && get_player_property_f64(&ipc, "duration").is_some_and(|duration| duration > 0.0) { loaded = true; break; }
            thread::sleep(Duration::from_millis(250));
        }
        if !loaded { return; }
        let duration = get_player_property_f64(&ipc, "duration").unwrap_or(0.0);
        if checkpoint > 0.0 && checkpoint < duration { seek_player_resume(&ipc, checkpoint); }

    });
    Ok(())
}

fn api(client: &reqwest::blocking::Client, base: &str, path: &str, body: Option<&str>) -> Result<serde_json::Value, String> {
    let request = match body { Some(body) => client.post(format!("{base}{path}")).body(body.to_string()), None => client.get(format!("{base}{path}")) };
    request.send().and_then(|r| r.error_for_status()).and_then(|r| r.json()).map_err(|_| "Download engine did not respond. Pause and retry; existing pieces are retained.".into())
}
fn process_slot() -> &'static Mutex<Option<std::sync::Arc<Mutex<Child>>>> {
    static PROCESS: OnceLock<Mutex<Option<std::sync::Arc<Mutex<Child>>>>> = OnceLock::new();
    PROCESS.get_or_init(|| Mutex::new(None))
}
pub fn shutdown() {
    if let Ok(slot) = process_slot().lock() { if let Some(child) = slot.as_ref() {
        if let Ok(mut child) = child.lock() { let _ = child.kill(); let _ = child.wait(); }
    } }
}
struct Engine(std::sync::Arc<Mutex<Child>>);
impl Drop for Engine { fn drop(&mut self) { shutdown(); if let Ok(mut slot) = process_slot().lock() { *slot = None; } } }
#[cfg(windows)]
fn contain_process(child: &Child) -> Result<std::os::windows::io::OwnedHandle, String> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::JobObjects::*;
    // The OS closes this handle on application failure and terminates its owned
    // download child. An orphan cannot continue downloading after a hard crash.
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() { return Err("Could not establish download process ownership.".into()); }
        let job = OwnedHandle::from_raw_handle(handle);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(handle, JobObjectExtendedLimitInformation, &limits as *const _ as *const _, std::mem::size_of_val(&limits) as u32) == 0
            || AssignProcessToJobObject(handle, child.as_raw_handle()) == 0 {
            return Err("Could not establish download process ownership.".into());
        }
        Ok(job)
    }
}
fn run(item: &Download, limit: u64) -> Result<(), String> {
    if item.relocated_folder.is_some() { return Err("Relocated files are read-only to the queue. Remove this entry and queue the release again to download a fresh copy.".into()); }
    if APP_EXITING.load(Ordering::SeqCst) || !get_download_queue()?.items.iter().any(|job| job.id == item.id && job.state == "downloading") { return Ok(()); }
    let folder = owned_folder_at(&item.id, &item_root(item))?;
    if available_disk_bytes(&folder).is_some_and(|bytes| bytes < 512 * 1024 * 1024) { return Err("Not enough free storage. Free space and resume.".into()); }
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|_| "No local download port available")?;
    let address = listener.local_addr().map_err(|_| "No local download port available")?;
    let base = format!("http://{address}");
    let engine = runtime_status(None).torrent_engine_path.ok_or("Bundled torrent engine is unavailable")?;
    let mut command = prepared_command(&engine);
    command.args(["--http-api-listen-addr", &address.to_string(), "--disable-dht-persistence", "--disable-upnp-port-forward"]);
    if limit > 0 { command.args(["--ratelimit-download", &limit.to_string()]); }
    command.args(["server", "start", "--disable-persistence"]).arg(&folder).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    drop(listener);
    let mut spawned = command.spawn().map_err(|_| "Could not start download engine")?;
    #[cfg(windows)]
    let _job = match contain_process(&spawned) { Ok(job) => job, Err(error) => { let _ = spawned.kill(); let _ = spawned.wait(); return Err(error); } };
    let child = std::sync::Arc::new(Mutex::new(spawned));
    *process_slot().lock().map_err(|_| "Download process manager unavailable")? = Some(child.clone());
    let process = Engine(child);
    if APP_EXITING.load(Ordering::SeqCst) { return Ok(()); }
    let client = reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(2)).timeout(Duration::from_secs(60)).build().map_err(|_| "Could not start download client")?;
    for _ in 0..40 {
        if process.0.lock().map_err(|_| "Download process manager unavailable")?.try_wait().map_err(|_| "Download engine exited")?.is_some() { return Err("Download engine exited before becoming ready.".into()); }
        if client.get(&base).timeout(Duration::from_millis(300)).send().is_ok() { break; }
        thread::sleep(Duration::from_millis(150));
    }
    if item.choose_files && item.selected_files.is_none() {
        let metadata = api(&client, &base, "/torrents?list_only=true", Some(&item.magnet))?;
        let details = metadata.get("details").ok_or("Release metadata is unavailable")?;
        if !details.get("info_hash").and_then(|value| value.as_str()).is_some_and(|hash| hash.eq_ignore_ascii_case(&item.id)) { return Err("Release metadata identity mismatch.".into()); }
        let entries = details.get("files").and_then(|value| value.as_array()).ok_or("Release file list unavailable")?;
        if entries.is_empty() || entries.len() > 5000 { return Err("Release file list is empty or too large.".into()); }
        let files = entries.iter().enumerate().map(|(index, value)| {
            let name = value.get("name").and_then(|v| v.as_str()).ok_or("Invalid release file name")?;
            if name.len() > 4096 { return Err("Release file name is too long"); }
            Ok(DownloadFile { index, name: name.into(), bytes: value.get("length").and_then(|v| v.as_u64()).unwrap_or(0) })
        }).collect::<Result<Vec<_>, &str>>()?;
        change(|queue| { if let Some(job) = queue.items.iter_mut().find(|job| job.id == item.id && job.state == "downloading") { job.files = files; job.state = "paused".into(); job.error = None; } Ok(()) })?;
        return Ok(());
    }
    let selection = item.selected_files.as_ref().map(|indices| format!("&only_files={}", indices.iter().map(|index| index.to_string()).collect::<Vec<_>>().join(","))).unwrap_or_default();
    let added = api(&client, &base, &format!("/torrents?overwrite=true&output_folder={}{}", percent_encode(&folder.to_string_lossy()), selection), Some(&item.magnet))?;
    let torrent = added.get("id").and_then(|id| id.as_u64()).ok_or("Download engine returned no torrent identity")?;
    loop {
        let current = get_download_queue()?;
        if APP_EXITING.load(Ordering::SeqCst) || current.limit_bps != limit || !current.items.iter().any(|job| job.id == item.id && job.state == "downloading") { return Ok(()); }
        if available_disk_bytes(&folder).is_some_and(|bytes| bytes < 256 * 1024 * 1024) { return Err("Download paused to protect free storage. Free space and resume.".into()); }
        let stats = api(&client, &base, &format!("/torrents/{torrent}/stats/v1"), None)?;
        if stats.get("state").and_then(|value| value.as_str()) == Some("error") {
            return Err("The torrent engine could not continue this download. Check storage and retry; existing pieces are retained.".into());
        }
        let downloaded = torrent_downloaded_bytes(&stats).unwrap_or(0);
        let total = stats.get("total_bytes").and_then(|v| v.as_u64()).unwrap_or(0);
        let finished = stats.get("finished").and_then(|v| v.as_bool()) == Some(true);
        if finished && media_files(&folder)?.is_empty() { return Err("Release contains no supported offline video.".into()); }
        change(|queue| { if let Some(job) = queue.items.iter_mut().find(|job| job.id == item.id && job.state == "downloading") {
            job.downloaded = downloaded; job.total = total; job.speed_bps = torrent_download_speed_bytes(&stats);
            if finished { job.state = "completed".into(); }
        } Ok(()) })?;
        if finished { return Ok(()); }
        thread::sleep(Duration::from_secs(2));
    }
}
pub fn start() {
    thread::spawn(|| loop {
        if APP_EXITING.load(Ordering::SeqCst) { break; }
        if let Ok(snapshot) = get_download_queue() {
            if let Some(item) = snapshot.items.iter().find(|item| item.state == "queued") {
                let id = item.id.clone();
                if change(|q| { if let Some(job) = q.items.iter_mut().find(|job| job.id == id && job.state == "queued") { job.state = "downloading".into(); } Ok(()) }).is_ok() {
                    let outcome = run(item, snapshot.limit_bps);
                    let _ = change(|q| { if let Some(job) = q.items.iter_mut().find(|job| job.id == id && job.state == "downloading") {
                        match outcome { Ok(()) => job.state = "queued".into(), Err(error) => { job.state = "failed".into(); job.error = Some(error); } }
                    } Ok(()) });
                }
            }
        }
        thread::sleep(Duration::from_secs(1));
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_hashes_can_address_download_folders() {
        assert!(valid_id(&"a".repeat(40)));
        for id in ["", "../offline", "C:\\", ".", "player-meta"] { assert!(!valid_id(id)); }
    }
    #[test] fn restart_pauses_work_and_preserves_completed_and_failed_downloads() {
        for state in ["queued", "downloading", "verifying", "paused", "completed", "failed", "cancelled"] {
            let id = "a".repeat(40);
            let value = Queue { items: vec![Download { id: id.clone(), title: "Fixture".into(), magnet: format!("magnet:?xt=urn:btih:{id}"), state: state.into(), downloaded: 4, total: 8, error: None, choose_files: false, files: Vec::new(), selected_files: None, progress: Default::default(), relocated_folder: None, storage_root: None, episode_links: HashMap::new(), speed_bps: None }], ..Queue::default() };
            let loaded = decode(&serde_json::to_vec(&value).unwrap()).unwrap();
            assert_eq!(loaded.items[0].state, if matches!(state, "queued" | "downloading" | "verifying") { "paused" } else { state });
            assert_eq!(loaded.items[0].downloaded, 4);
        }
    }
    #[test] fn damaged_or_future_queue_is_never_silently_reset() {
        assert!(decode(b"not json").is_err());
        assert!(decode(br#"{"version":2,"limitBps":0,"items":[]}"#).is_err());
        assert!(decode(br#"{"version":1,"limitBps":1000000001,"items":[]}"#).is_err());
    }
    #[test]
    #[ignore = "Run through tests/desktop/download-queue.mjs with an isolated local tracker and seeder"]
    fn local_torrent_pause_resume_and_completion() {
        let magnet = env::var("STREAMNYAA_DOWNLOAD_FIXTURE_MAGNET").expect("fixture runner required");
        assert_eq!(env::var("STREAMNYAA_DOWNLOAD_FIXTURE").as_deref(), Ok("1"));
        change(|q| { q.download_directory = Some(root().to_string_lossy().into_owned()); Ok(()) }).unwrap();
        let snapshot = enqueue_release("Local fixture".into(), magnet, false).unwrap();
        let id = snapshot.items[0].id.clone();
        set_download_limit(128 * 1024).unwrap();
        change(|q| { q.items[0].state = "downloading".into(); Ok(()) }).unwrap();
        let item = get_download_queue().unwrap().items[0].clone();
        let first = thread::spawn(move || run(&item, 128 * 1024));
        let deadline = Instant::now() + Duration::from_secs(40);
        loop {
            let current = get_download_queue().unwrap();
            if current.items[0].downloaded > 0 { break; }
            assert!(!first.is_finished(), "download stopped before receiving fixture data");
            if Instant::now() >= deadline { shutdown(); panic!("fixture did not transfer data"); }
            thread::sleep(Duration::from_millis(100));
        }
        control_downloads(vec![id.clone()], "pause".into()).unwrap();
        let _ = first.join().unwrap();
        let paused = get_download_queue().unwrap();
        assert_eq!(paused.items[0].state, "paused");
        assert!(paused.items[0].downloaded > 0);
        assert!(root().join(&id).exists());
        set_download_limit(0).unwrap();
        control_downloads(vec![id.clone()], "resume".into()).unwrap();
        change(|q| { q.items[0].state = "downloading".into(); Ok(()) }).unwrap();
        let item = get_download_queue().unwrap().items[0].clone();
        let second = thread::spawn(move || run(&item, 0));
        let deadline = Instant::now() + Duration::from_secs(40);
        while !second.is_finished() {
            if Instant::now() >= deadline { shutdown(); panic!("fixture did not complete"); }
            thread::sleep(Duration::from_millis(100));
        }
        second.join().unwrap().unwrap();
        assert_eq!(get_download_queue().unwrap().items[0].state, "completed");
        assert_eq!(get_offline_files(id.clone()).unwrap(), vec!["fixture.mkv"]);
        let bytes = fs::read(root().join(&id).join("fixture.mkv")).unwrap();
        assert_eq!(bytes.len(), 4 * 1024 * 1024);
        assert!(bytes.iter().enumerate().all(|(i, byte)| *byte == (i % 251) as u8));
        assert_eq!(load().unwrap().items[0].state, "completed");
    }
}

pub fn save_native_progress(id:&str,file:&str,record:&playback_progress::Record) {
    let progress=OfflineProgress {owner:Some(record.context.owner.clone()),seconds:record.coverage.furthest,duration:record.coverage.duration,updated_at:record.updated_at/1000,completed:record.completed,watched_coverage:serde_json::to_value(&record.coverage).ok()};
    let _=change(|queue|{if let Some(item)=queue.items.iter_mut().find(|i|i.id==id){item.progress.insert(file.into(),progress);}Ok(())});
}
