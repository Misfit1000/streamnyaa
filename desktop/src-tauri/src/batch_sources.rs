//! Metadata-only inspection is isolated from active playback and Downloads.
use super::*;
use std::sync::Arc;

const VERSION: u32 = 1;
const MAX_BYTES: usize = 16 * 1024 * 1024;
// rqbit reports hexadecimal BTIHs even when the magnet used base32.
fn canonical_hash(value: &str) -> Option<String> {
    let normalized = normalize_info_hash(value)?;
    if normalized.len() == 40 {
        return Some(normalized);
    }
    let mut bytes = Vec::with_capacity(20);
    let (mut bits, mut buffer) = (0u32, 0u32);
    for character in normalized.bytes() {
        let value = match character {
            b'A'..=b'Z' => character - b'A',
            b'2'..=b'7' => character - b'2' + 26,
            _ => return None,
        };
        buffer = (buffer << 5) | u32::from(value);
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            bytes.push((buffer >> bits) as u8);
        }
    }
    (bytes.len() == 20).then(|| bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn release_hash(magnet: &str) -> Option<String> {
    canonical_hash(&magnet_info_hash(magnet)?)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct File {
    pub index: usize,
    pub name: String,
    pub bytes: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub info_hash: String,
    pub version: u32,
    pub files: Vec<File>,
    pub retrieved_at: u128,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub info_hash: String,
    pub manifest_id: String,
    pub file_index: usize,
    #[serde(default)]
    pub manual: bool,
    #[serde(default)]
    pub episode: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub magnet: String,
    pub title: String,
    pub identity: source_identity::SourceIdentity,
    pub episode: u32,
    #[serde(default)]
    pub allow_manual: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub state: String,
    pub info_hash: String,
    pub manifest_id: String,
    pub reason: String,
    pub files: Vec<File>,
    pub available_episodes: Vec<u32>,
    pub selection: Option<Selection>,
}

fn valid(m: &Manifest) -> bool {
    m.version == VERSION
        && normalize_info_hash(&m.info_hash).is_some()
        && !m.files.is_empty()
        && m.files.len() <= 5000
        && m.files.iter().enumerate().all(|(index, f)| {
            f.index == index
                && !f.name.is_empty()
                && f.name.len() <= 4096
                && !f.name.contains('\0')
                && !Path::new(&f.name).is_absolute()
                && !f
                    .name
                    .split(['/', '\\'])
                    .any(|p| p == ".." || p.contains(':'))
        })
}
pub fn manifest_id(m: &Manifest) -> String {
    let mut hash = DefaultHasher::new();
    m.info_hash.hash(&mut hash);
    VERSION.hash(&mut hash);
    for f in &m.files {
        f.index.hash(&mut hash);
        f.name.hash(&mut hash);
        f.bytes.hash(&mut hash);
    }
    format!("v{VERSION}-{:016x}", hash.finish())
}
fn video(file: &File) -> bool {
    matches!(
        file.name
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "mkv" | "mp4" | "webm" | "avi" | "m2ts" | "mov"
    )
}
fn extra(name: &str) -> bool {
    name.to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|w| {
            [
                "sample",
                "samples",
                "trailer",
                "trailers",
                "extras",
                "extra",
                "ncop",
                "nced",
                "creditless",
                "opening",
                "ending",
                "pv",
                "specials",
                "ova",
            ]
            .contains(&w)
                || w.strip_prefix("ncop")
                    .or_else(|| w.strip_prefix("nced"))
                    .is_some_and(|s| s.chars().all(|c| c.is_ascii_digit()))
        })
}
fn episode(file: &File) -> Option<u32> {
    let stem = file
        .name
        .rsplit(['/', '\\'])
        .next()?
        .rsplit_once('.')
        .map(|p| p.0)
        .unwrap_or(&file.name);
    if stem.chars().all(|c| c.is_ascii_digit()) {
        return stem.parse().ok().filter(|n| *n > 0 && *n < 10000);
    }
    source_identity::release_episode(stem).and_then(|n| u32::try_from(n).ok())
}
fn multi_episode(name: &str) -> bool {
    let chars: Vec<_> = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(name)
        .chars()
        .collect();
    for index in 0..chars.len() {
        if !chars[index].is_ascii_digit() {
            continue;
        }
        let mut end = index;
        while end < chars.len() && chars[end].is_ascii_digit() {
            end += 1;
        }
        while end < chars.len() && chars[end].is_whitespace() {
            end += 1;
        }
        if end < chars.len() && ['-', '–', '~', '+', '&'].contains(&chars[end]) {
            end += 1;
            while end < chars.len()
                && (chars[end].is_whitespace() || ['e', 'E'].contains(&chars[end]))
            {
                end += 1;
            }
            if end < chars.len() && chars[end].is_ascii_digit() {
                return true;
            }
        }
    }
    false
}
fn compatible(file: &File, r: &Request, pack_exact: bool) -> bool {
    if !video(file) || extra(&file.name) {
        return false;
    }
    if source_identity::season_marker(&file.name)
        .zip(r.identity.season_number)
        .is_some_and(|(a, b)| a != b)
        || source_identity::part_marker(&file.name)
            .zip(r.identity.part_number)
            .is_some_and(|(a, b)| a != b)
    {
        return false;
    }
    if r.identity.season_number.is_none()
        && source_identity::season_marker(&file.name).is_some_and(|s| s > 1)
    {
        return false;
    }
    if r.identity.part_number.is_none()
        && source_identity::part_marker(&file.name).is_some_and(|s| s > 1)
    {
        return false;
    }
    pack_exact || source_identity::exact_candidate(&file.name, &r.identity, r.episode)
}
pub fn resolve(m: &Manifest, r: &Request) -> Resolution {
    let id = manifest_id(m);
    let pack_exact =
        source_identity::batch_identity(&r.title, &r.identity) == source_identity::Evidence::Exact;
    let files: Vec<File> = m
        .files
        .iter()
        .filter(|f| compatible(f, r, pack_exact) || r.allow_manual && compatible(f, r, true))
        .cloned()
        .collect();
    let absolute_unknown = (r.identity.season_number.is_some_and(|s| s > 1) || r.identity.sequel)
        && !files.is_empty()
        && files
            .iter()
            .filter_map(episode)
            .min()
            .is_some_and(|e| e > 1)
        && files
            .iter()
            .all(|f| source_identity::season_marker(&f.name).is_none());
    let automatic = |file: &File| {
        episode(file).is_some_and(|ep| {
            source_identity::batch_file_auto_identity(&file.name, &r.identity, ep)
        })
    };
    let mut available: Vec<u32> = files
        .iter()
        .filter(|f| !r.allow_manual && !multi_episode(&f.name) && !absolute_unknown && automatic(f))
        .filter_map(episode)
        .collect();
    available.sort_unstable();
    available.dedup();
    let exact: Vec<_> = files
        .iter()
        .filter(|f| !multi_episode(&f.name) && automatic(f) && episode(f) == Some(r.episode))
        .cloned()
        .collect();
    let unknown: Vec<_> = files
        .iter()
        .filter(|f| {
            episode(f).is_none() || multi_episode(&f.name) || absolute_unknown || !automatic(f)
        })
        .cloned()
        .collect();
    let (state, reason, choices, selection) = if r.allow_manual && !files.is_empty() {
        ("choose-file", "Confirm the video for the requested anime and episode. Its identity could not be verified automatically.", files.clone(), None)
    } else if exact.len() == 1 && !absolute_unknown {
        (
            "matched",
            "Episode file verified",
            exact.clone(),
            Some(Selection {
                info_hash: m.info_hash.clone(),
                manifest_id: id.clone(),
                file_index: exact[0].index,
                manual: false, episode:Some(r.episode),
            }),
        )
    } else if exact.len() > 1 {
        (
            "choose-file",
            "Several files match this episode. Choose its encode.",
            exact,
            None,
        )
    } else if pack_exact && !unknown.is_empty() {
        (
            "choose-file",
            "File numbering is ambiguous. Choose the requested episode.",
            unknown,
            None,
        )
    } else {
        (
            "not-found",
            "This pack has no verified file for the requested installment and episode.",
            vec![],
            None,
        )
    };
    Resolution {
        state: state.into(),
        info_hash: m.info_hash.clone(),
        manifest_id: id,
        reason: reason.into(),
        files: choices,
        available_episodes: available,
        selection,
    }
}
fn cache_root() -> PathBuf {
    if cfg!(test) {
        return env::temp_dir().join(format!("streamnyaa-batch-fixture-{}", std::process::id()));
    }
    // Separate durable metadata from disposable playback sessions.
    env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::temp_dir())
        .join("StreamNyaa")
        .join("metadata")
        .join("batch-manifests-v1")
}
fn memory() -> &'static Mutex<Vec<(Manifest, usize)>> {
    static CACHE: OnceLock<Mutex<Vec<(Manifest, usize)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Vec::new()))
}
fn remember(m: &Manifest) {
    let Ok(bytes) = serde_json::to_vec(m).map(|v| v.len()) else {
        return;
    };
    if bytes > MAX_BYTES {
        return;
    }
    if let Ok(mut cache) = memory().lock() {
        cache.retain(|(old, _)| old.info_hash != m.info_hash);
        cache.push((m.clone(), bytes));
        while cache.len() > 256 || cache.iter().map(|(_, size)| size).sum::<usize>() > MAX_BYTES {
            cache.remove(0);
        }
    }
}
fn read_cache(hash: &str) -> Option<Manifest> {
    if let Ok(cache) = memory().lock() {
        if let Some((m, _)) = cache
            .iter()
            .find(|(m, _)| m.info_hash.eq_ignore_ascii_case(hash))
        {
            return Some(m.clone());
        }
    }
    let path = cache_root().join(format!("{hash}.json"));
    if path.metadata().ok()?.len() > MAX_BYTES as u64 {
        return None;
    }
    let m: Manifest = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    if valid(&m) && m.info_hash.eq_ignore_ascii_case(hash) {
        remember(&m);
        Some(m)
    } else {
        None
    }
}
fn save_cache(m: &Manifest) {
    if !valid(m) {
        return;
    }
    remember(m);
    let root = cache_root();
    if fs::create_dir_all(&root).is_err() {
        return;
    }
    let Ok(bytes) = serde_json::to_vec(m) else {
        return;
    };
    if bytes.len() > MAX_BYTES {
        return;
    }
    let path = root.join(format!("{}.json", m.info_hash));
    let temp = path.with_extension("tmp");
    if fs::write(&temp, bytes).is_ok() {
        let _ = fs::rename(&temp, &path);
    }
    let _ = fs::remove_file(temp);
    let mut entries: Vec<_> = fs::read_dir(&root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let md = e.metadata().ok()?;
            (e.path().extension().and_then(|s| s.to_str()) == Some("json")).then_some((
                e.path(),
                md.len(),
                md.modified().ok(),
            ))
        })
        .collect();
    entries.sort_by_key(|e| e.2);
    let mut bytes: u64 = entries.iter().map(|e| e.1).sum();
    let mut count = entries.len();
    for (path, size, _) in entries {
        if count <= 256 && bytes <= MAX_BYTES as u64 {
            break;
        }
        if fs::remove_file(path).is_ok() {
            count -= 1;
            bytes = bytes.saturating_sub(size);
        }
    }
}
fn jobs() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}
fn early_cancels() -> &'static Mutex<HashMap<String, Instant>> {
    static EARLY: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    EARLY.get_or_init(|| Mutex::new(HashMap::new()))
}
pub fn cancel(id: &str) {
    if id.is_empty() || id.len() > 100 {
        return;
    }
    if let Ok(jobs) = jobs().lock() {
        if let Some(flag) = jobs.get(id) {
            flag.store(true, Ordering::SeqCst);
            return;
        }
    }
    if let Ok(mut early) = early_cancels().lock() {
        early.retain(|_, at| at.elapsed() < Duration::from_secs(5));
        if early.len() < 32 {
            early.insert(id.into(), Instant::now());
        }
    }
}
fn inspection_lane() -> &'static Mutex<()> {
    static LANE: OnceLock<Mutex<()>> = OnceLock::new();
    LANE.get_or_init(|| Mutex::new(()))
}
struct Engine(Child);
impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn inspect(hash: &str, magnet: &str, flag: &AtomicBool) -> Result<Manifest, String> {
    let deadline = Instant::now() + Duration::from_secs(60);
    let check = || {
        if flag.load(Ordering::SeqCst) || APP_EXITING.load(Ordering::SeqCst) {
            Err("Batch inspection cancelled.".to_string())
        } else if Instant::now() >= deadline {
            Err("Batch metadata timed out. Retry this source.".to_string())
        } else {
            Ok(())
        }
    };
    let _lane = loop {
        check()?;
        match inspection_lane().try_lock() {
            Ok(g) => break g,
            Err(TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(50)),
            _ => return Err("Batch inspection is unavailable.".into()),
        }
    };
    // A preceding identical consumer may have populated the cache while queued.
    if let Some(m) = read_cache(hash) {
        return Ok(m);
    }
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|_| "No local metadata port available.")?;
    let address = listener
        .local_addr()
        .map_err(|_| "No local metadata port available.")?;
    let engine = runtime_status(None)
        .torrent_engine_path
        .ok_or("Bundled torrent engine is unavailable.")?;
    let folder = cache_root().join("inspection");
    fs::create_dir_all(&folder).map_err(|_| "Could not prepare batch metadata.")?;
    let mut command = prepared_command(&engine);
    if cfg!(test) {
        command.arg("--disable-dht");
    }
    command
        .args([
            "--http-api-listen-addr",
            &address.to_string(),
            "--disable-dht-persistence",
            "--disable-upnp-port-forward",
            "server",
            "start",
            "--disable-persistence",
        ])
        .arg(folder)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    drop(listener);
    let mut process = Engine(
        command
            .spawn()
            .map_err(|_| "Could not start metadata engine.")?,
    );
    #[cfg(windows)]
    let _job = download_queue::contain_process(&process.0)?;
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_millis(300))
        .timeout(Duration::from_secs(1))
        .build()
        .map_err(|_| "Could not inspect metadata.")?;
    let base = format!("http://{address}");
    loop {
        check()?;
        if process
            .0
            .try_wait()
            .map_err(|_| "Metadata engine exited.")?
            .is_some()
        {
            return Err("Metadata engine exited.".into());
        }
        if client.get(&base).send().is_ok() {
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
    // Poll completion of the bounded metadata-only request so cancellation can
    // terminate this owned helper without touching the playback/download engines.
    let (tx, rx) = mpsc::channel();
    let target = format!("{base}/torrents?list_only=true");
    let magnet = magnet.to_string();
    // The controlled fixture supplies a local peer instead of contacting DHT.
    #[cfg(test)]
    let target = env::var("STREAMNYAA_BATCH_FIXTURE_PEER")
        .ok()
        .and_then(|peer| peer.parse::<std::net::SocketAddr>().ok())
        .filter(|peer| peer.ip().is_loopback())
        .map(|peer| {
            format!(
                "{target}&initial_peers={}",
                percent_encode(&peer.to_string())
            )
        })
        .unwrap_or(target);
    thread::spawn(move || {
        let result = (|| {
            let mut response = client
                .post(target)
                .timeout(Duration::from_secs(55))
                .body(magnet)
                .send()
                .map_err(|_| "Batch metadata is unavailable.")?
                .error_for_status()
                .map_err(|_| "Batch metadata is unavailable.")?;
            let mut bytes = Vec::new();
            response
                .by_ref()
                .take(MAX_REMOTE_RESPONSE_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Batch metadata could not be read.")?;
            if bytes.len() > MAX_REMOTE_RESPONSE_BYTES as usize {
                return Err("Batch metadata is too large.");
            }
            serde_json::from_slice::<serde_json::Value>(&bytes)
                .map_err(|_| "Batch metadata is invalid.")
        })();
        let _ = tx.send(result);
    });
    let value = loop {
        check()?;
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(r) => break r?,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            _ => return Err("Batch metadata is unavailable.".into()),
        }
    };
    let details = value
        .get("details")
        .ok_or("Batch file list is unavailable.")?;
    let actual = details
        .get("info_hash")
        .and_then(|v| v.as_str())
        .and_then(canonical_hash)
        .ok_or("Batch identity is invalid.")?;
    if !actual.eq_ignore_ascii_case(hash) {
        return Err("Batch release identity mismatch.".into());
    }
    let entries = details
        .get("files")
        .and_then(|v| v.as_array())
        .ok_or("Batch file list is unavailable.")?;
    if entries.is_empty() || entries.len() > 5000 {
        return Err("Batch file list is empty or too large.".into());
    }
    let files = entries
        .iter()
        .enumerate()
        .map(|(index, v)| {
            Ok(File {
                index,
                name: v
                    .get("name")
                    .and_then(|s| s.as_str())
                    .ok_or("Invalid batch filename.")?
                    .into(),
                bytes: v.get("length").and_then(|n| n.as_u64()).unwrap_or(0),
            })
        })
        .collect::<Result<Vec<_>, &str>>()?;
    let m = Manifest {
        info_hash: actual,
        version: VERSION,
        files,
        retrieved_at: now_millis(),
    };
    if !valid(&m) {
        return Err("Batch file list is invalid.".into());
    }
    check()?;
    save_cache(&m);
    Ok(m)
}
pub fn run(r: Request, id: String) -> Result<Resolution, String> {
    if id.is_empty()
        || id.len() > 100
        || r.identity.anime_id.is_empty()
        || r.identity.anime_id.len() > 256
        || r.identity.aliases.len() > 80
        || r.identity.aliases.iter().any(|s| s.len() > 1000)
        || r.identity.installment_aliases.len() > 80
        || r.identity
            .installment_aliases
            .iter()
            .any(|s| s.len() > 1000)
        || r.magnet.len() > 32 * 1024
        || r.episode == 0
        || r.episode > 9999
        || r.title.len() > 4096
    {
        return Err("Invalid batch request.".into());
    }
    let hash = release_hash(&r.magnet).ok_or("Invalid batch release identity.")?;
    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut j = jobs()
            .lock()
            .map_err(|_| "Batch inspection is unavailable.")?;
        if let Ok(mut early) = early_cancels().lock() {
            if early
                .remove(&id)
                .is_some_and(|at| at.elapsed() < Duration::from_secs(5))
            {
                return Err("Batch inspection cancelled.".into());
            }
        }
        if j.len() >= 32 || j.contains_key(&id) {
            return Err("Batch inspection is already queued.".into());
        }
        j.insert(id.clone(), flag.clone());
    }
    let result = (|| {
        let m = match read_cache(&hash) {
            Some(m) => m,
            None => inspect(&hash, &r.magnet, &flag)?,
        };
        if flag.load(Ordering::SeqCst) {
            return Err("Batch inspection cancelled.".into());
        }
        Ok(resolve(&m, &r))
    })();
    if let Ok(mut jobs) = jobs().lock() {
        jobs.remove(&id);
    }
    result.or_else(|reason| {
        if flag.load(Ordering::SeqCst) || APP_EXITING.load(Ordering::SeqCst) {
            Err(reason)
        } else {
            Ok(Resolution {
                state: "unavailable".into(),
                info_hash: hash,
                manifest_id: String::new(),
                reason,
                files: vec![],
                available_episodes: vec![],
                selection: None,
            })
        }
    })
}
pub fn validate(r: &PlaybackRequest) -> Result<(), String> {
    let Some(selection) = &r.batch_selection else {
        return if source_identity::is_batch_release(&r.title) {
            Err("Use this batch source to verify its episode file first.".into())
        } else {
            Ok(())
        };
    };
    let identity = r
        .source_identity
        .clone()
        .ok_or("Batch installment identity is missing.")?;
    let hash = release_hash(&r.magnet).ok_or("Batch identity is invalid.")?;
    if r.info_hash
        .as_deref()
        .filter(|value| !value.is_empty())
        .is_some_and(|value| canonical_hash(value).as_deref() != Some(hash.as_str()))
    {
        return Err("Batch request has conflicting release identities.".into());
    }
    if canonical_hash(&selection.info_hash).as_deref() != Some(hash.as_str()) {
        return Err("Batch selection belongs to another release.".into());
    }
    let m = read_cache(&hash).ok_or("Batch file verification expired. Use the source again.")?;
    if manifest_id(&m) != selection.manifest_id {
        return Err("Batch file verification changed. Use the source again.")?;
    }
    let request = Request {
        magnet: r.magnet.clone(),
        title: r.title.clone(),
        identity,
        episode: r.episode.parse().map_err(|_| "Batch episode is invalid.")?,
        allow_manual: selection.manual && selection.episode==r.episode.parse::<u32>().ok(),
    };
    let resolved = resolve(&m, &request);
    if resolved
        .selection
        .as_ref()
        .is_some_and(|s| s.file_index == selection.file_index)
        || selection.manual
            && resolved.state == "choose-file"
            && resolved
                .files
                .iter()
                .any(|f| f.index == selection.file_index)
    {
        Ok(())
    } else {
        Err("The selected file is not eligible for this episode.".into())
    }
}
pub fn same_pack(a: &PlaybackRequest, b: &PlaybackRequest) -> bool {
    a.batch_selection.is_some()
        && b.batch_selection.is_some()
        && release_hash(&a.magnet)
            .zip(release_hash(&b.magnet))
            .is_some_and(|(a, b)| a == b)
        && a.source_identity
            .as_ref()
            .zip(b.source_identity.as_ref())
            .is_some_and(|(a, b)| a.anime_id == b.anime_id)
}
pub fn selected_filename(r: &PlaybackRequest) -> Option<String> {
    let selection = r.batch_selection.as_ref()?;
    let manifest = read_cache(&release_hash(&r.magnet)?)?;
    if manifest_id(&manifest) != selection.manifest_id {
        return None;
    }
    manifest.files.get(selection.file_index).map(|file| {
        file.name
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(&file.name)
            .to_string()
    })
}
pub fn selected_bytes(r: &PlaybackRequest) -> Option<u64> {
    let selection = r.batch_selection.as_ref()?;
    let manifest = read_cache(&release_hash(&r.magnet)?)?;
    (manifest_id(&manifest) == selection.manifest_id)
        .then(|| {
            manifest
                .files
                .get(selection.file_index)
                .map(|file| file.bytes)
        })
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(ep: u32) -> Request {
        Request {
            magnet: String::new(),
            title: "[Group] Example Anime S01 01-10 Batch [1080p]".into(),
            identity: source_identity::SourceIdentity {
                anime_id: "anilist:1".into(),
                aliases: vec!["Example Anime".into()],
                installment_aliases: vec![],
                format: "TV".into(),
                season_number: Some(1),
                part_number: None,
                sequel: false,
            },
            episode: ep, allow_manual: false,
        }
    }
    fn manifest(names: &[&str]) -> Manifest {
        Manifest {
            info_hash: "0123456789abcdef0123456789abcdef01234567".into(),
            version: VERSION,
            files: names
                .iter()
                .enumerate()
                .map(|(index, name)| File {
                    index,
                    name: (*name).into(),
                    bytes: 100,
                })
                .collect(),
            retrieved_at: 0,
        }
    }
    #[test]
    fn manual_review_does_not_disable_seeded_uncertain_releases_or_claim_verified_episodes() {
        let mut r=request(2); r.title="Unrecognized pack Batch".into(); r.allow_manual=true;
        let m=Manifest{info_hash:"a".repeat(40),version:VERSION,retrieved_at:now_millis(),files:vec![File{index:0,name:"Different Anime 02.mkv".into(),bytes:100},File{index:1,name:"sample.mkv".into(),bytes:10}]};
        let result=resolve(&m,&r);assert_eq!(result.state,"choose-file");assert_eq!(result.files.len(),1);assert_eq!(result.files[0].index,0);assert!(result.available_episodes.is_empty());assert!(result.selection.is_none());
    }
    #[test]
    fn pack_episode_selection() {
        let names: Vec<_> = (1..=10)
            .map(|e| format!("Example Anime S01E{e:02}.mkv"))
            .collect();
        let m = manifest(&names.iter().map(String::as_str).collect::<Vec<_>>());
        for ep in 1..=10 {
            let r = resolve(&m, &request(ep));
            assert_eq!(r.state, "matched");
            assert_eq!(r.selection.unwrap().file_index, ep as usize - 1);
            assert_eq!(r.available_episodes.len(), 10);
        }
        assert_eq!(resolve(&m, &request(11)).state, "not-found");
    }
    #[test]
    fn extras_conflicts_and_ambiguity() {
        let m = manifest(&[
            "S01E02.mkv",
            "S01E02 [720p].mkv",
            "Extras/S01E03.mkv",
            "S02E03.mkv",
            "S01E02.ass",
        ]);
        assert_eq!(resolve(&m, &request(2)).state, "choose-file");
        assert_eq!(resolve(&m, &request(3)).state, "not-found");
        assert_eq!(
            resolve(&manifest(&["02.mkv"]), &request(2)).state,
            "matched"
        );
        assert_eq!(
            resolve(&manifest(&["video.mkv"]), &request(2)).state,
            "choose-file"
        );
    }
    #[test]
    fn unrelated_named_video_cannot_automatically_match_by_number() {
        let r = resolve(&manifest(&["Different Anime S01E02.mkv"]), &request(2));
        assert_eq!(r.state, "choose-file");
        assert!(r.available_episodes.is_empty());
        assert!(r.selection.is_none());
    }
    #[test]
    fn manifest_validation_and_identity() {
        assert!(!valid(&manifest(&["../video.mkv"])));
        let mut r = request(2);
        r.identity.season_number = Some(2);
        r.identity.sequel = true;
        assert_eq!(resolve(&manifest(&["02.mkv"]), &r).state, "not-found");
        assert_ne!(
            manifest_id(&manifest(&["01.mkv"])),
            manifest_id(&manifest(&["02.mkv"]))
        );
    }
    #[test]
    fn base32_and_hex_share_manifest_identity() {
        assert_eq!(
            canonical_hash("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
            Some("00".repeat(20))
        );
        assert_eq!(
            canonical_hash("77777777777777777777777777777777"),
            Some("ff".repeat(20))
        );
        assert!(canonical_hash("invalid").is_none());
    }
    #[test]
    fn cached_manifest_survives_memory_restart_and_rejects_tampering() {
        let mut m = manifest(&[
            "S01E02.mkv",
            "S01E02 [720p].mkv",
            "S02E02.mkv",
            "S01E02.ass",
        ]);
        m.info_hash = "ac".repeat(20);
        save_cache(&m);
        memory()
            .lock()
            .unwrap()
            .retain(|(cached, _)| cached.info_hash != m.info_hash);
        let stored = read_cache(&m.info_hash).unwrap();
        assert_eq!(stored.files.len(), 4);
        let selection = Selection {
            info_hash: m.info_hash.clone(),
            manifest_id: manifest_id(&m),
            file_index: 1,
            manual: true, episode:None,
        };
        let mut r:PlaybackRequest=serde_json::from_value(serde_json::json!({"magnet":format!("magnet:?xt=urn:btih:{}",m.info_hash),"title":request(2).title,"anime_title":"Example Anime","episode":"2","source_identity":request(2).identity,"batch_selection":selection})).unwrap();
        assert!(validate(&r).is_ok());
        r.batch_selection.as_mut().unwrap().episode=Some(2);
        r.episode="3".into(); assert!(validate(&r).is_err()); r.episode="2".into();
        r.batch_selection.as_mut().unwrap().file_index = 2;
        assert!(validate(&r).is_err());
        r.batch_selection.as_mut().unwrap().file_index = 3;
        assert!(validate(&r).is_err());
        r.batch_selection.as_mut().unwrap().manifest_id = "stale".into();
        assert!(validate(&r).is_err());
        memory()
            .lock()
            .unwrap()
            .retain(|(cached, _)| cached.info_hash != m.info_hash);
        fs::write(
            cache_root().join(format!("{}.json", m.info_hash)),
            b"{broken",
        )
        .unwrap();
        assert!(read_cache(&m.info_hash).is_none());
    }
    #[test]
    fn cancellation_before_admission_never_starts_an_engine() {
        let mut r = request(2);
        r.magnet = format!("magnet:?xt=urn:btih:{}", "bb".repeat(20));
        cancel("cancelled-batch-fixture");
        assert_eq!(
            run(r, "cancelled-batch-fixture".into()).unwrap_err(),
            "Batch inspection cancelled."
        );
    }
    #[test]
    fn combined_video_and_absolute_numbering_require_selection() {
        for name in [
            "Example Anime - 01-02.mkv",
            "Example Anime - 01 – 02.mkv",
            "Example Anime - 01+02.mkv",
        ] {
            assert_eq!(
                resolve(&manifest(&[name]), &request(2)).state,
                "choose-file"
            );
        }
        let mut r = request(2);
        r.identity.season_number = Some(2);
        r.identity.sequel = true;
        r.title = "Example Anime Season 2 27-38 Batch".into();
        let result = resolve(&manifest(&["27.mkv", "28.mkv"]), &r);
        assert_eq!(result.state, "choose-file");
        assert!(result.available_episodes.is_empty());
    }
    #[test]
    fn selected_playlist_file_and_subtitles_must_match_manifest() {
        let mut m = manifest(&["S01E02.mkv", "S01E02.en.ass", "S01E03.ass"]);
        m.info_hash = "de".repeat(20);
        remember(&m);
        let resolved = resolve(&m, &request(2));
        let r:PlaybackRequest=serde_json::from_value(serde_json::json!({"magnet":format!("magnet:?xt=urn:btih:{}",m.info_hash),"title":request(2).title,"anime_title":"Example Anime","episode":"2","source_identity":request(2).identity,"batch_selection":resolved.selection})).unwrap();
        let mut entries = vec![];
        for file in &m.files {
            entries.push(PlaylistEntry {
                url: format!("http://127.0.0.1/stream/{}", file.index),
                label: file.name.clone(),
                file_name: file.name.clone(),
                file_stem: file.name.rsplit_once('.').unwrap().0.into(),
                file_index: Some(file.index),
                kind: if file.index == 0 {
                    PlaylistKind::Video
                } else {
                    PlaylistKind::Subtitle
                },
            });
        }
        let target = select_stream_target(&entries, &r).unwrap();
        assert_eq!(target.selected_file_indices, vec![0, 1]);
        entries[0].file_name = "unrelated.mkv".into();
        assert!(select_stream_target(&entries, &r).is_none());
    }
    #[test]
    #[ignore = "Requires tests/desktop/batch-files.mjs --native to provide the isolated metadata peer"]
    fn batch_metadata_native_acceptance() {
        let magnet = env::var("STREAMNYAA_BATCH_FIXTURE_MAGNET")
            .expect("Run the controlled local batch fixture");
        let r = Request {
            magnet: magnet.clone(),
            title: "Fixture Anime S01 01-10 Batch".into(),
            identity: source_identity::SourceIdentity {
                anime_id: "anilist:1".into(),
                aliases: vec!["Fixture Anime".into()],
                installment_aliases: vec![],
                format: "TV".into(),
                season_number: Some(1),
                part_number: None,
                sequel: false,
            },
            episode: 2, allow_manual: false,
        };
        let result = tauri::async_runtime::block_on(inspect_batch_release(
            r.clone(),
            "native-batch-fixture-2".into(),
        ))
        .expect("Native metadata command");
        assert_eq!(result.state, "matched");
        assert_eq!(result.available_episodes, (1..=10).collect::<Vec<_>>());
        assert_eq!(result.selection.as_ref().unwrap().file_index, 1);
        let playback:PlaybackRequest=serde_json::from_value(serde_json::json!({"magnet":magnet,"title":r.title,"anime_title":"Fixture Anime","episode":"2","source_identity":r.identity,"batch_selection":result.selection})).unwrap();
        validate(&playback).unwrap();
        let mut wrong = playback.clone();
        wrong.episode = "3".into();
        assert!(validate(&wrong).is_err());
        let started = Instant::now();
        let mut next = r;
        next.episode = 3;
        let cached = tauri::async_runtime::block_on(inspect_batch_release(
            next,
            "native-batch-fixture-3".into(),
        ))
        .unwrap();
        assert_eq!(cached.selection.unwrap().file_index, 2);
        println!("Native batch acceptance: files=10 selected=[1,2] cached_ms={} manifest={} stale_selection_rejected=true",started.elapsed().as_millis(),result.manifest_id);
    }
}
