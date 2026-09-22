//! Native-owned, versioned progress. Player events survive route changes and final file replacement.
use super::*;
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub owner: String,
    pub anime_id: String,
    pub title: String,
    pub episode: String,
    pub source_key: String,
    pub poster: Option<String>,
    pub offline_id: Option<String>,
    pub offline_file: Option<String>,
    #[serde(default)]
    pub baseline: Coverage,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    #[serde(default)]
    pub intervals: Vec<[f64; 2]>,
    #[serde(default)]
    pub furthest: f64,
    #[serde(default)]
    pub last_position: f64,
    #[serde(default)]
    pub duration: f64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub version: u32,
    pub session_id: String,
    pub generation: u64,
    pub sequence: u64,
    pub context: Context,
    pub coverage: Coverage,
    pub completed: bool,
    pub state: String,
    pub updated_at: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    session_id: String,
    sequence: u64,
    coverage: Coverage,
    state: String,
}
#[derive(Default)]
struct Store {
    loaded: bool,
    records: Vec<Record>,
    active: HashMap<String, Record>,
    saved_at: HashMap<String, u64>,
}
static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
static OWNER: Mutex<String> = Mutex::new(String::new());
pub fn current_owner() -> String {
    OWNER.lock().map(|v| v.clone()).unwrap_or_default()
}
#[tauri::command]
pub fn set_playback_progress_owner(owner: String) {
    if let Ok(mut value) = OWNER.lock() {
        *value = owner;
    }
}
static SERIAL: AtomicU64 = AtomicU64::new(0);
fn store() -> &'static Mutex<Store> {
    STORE.get_or_init(|| Mutex::new(Store::default()))
}
fn path() -> PathBuf {
    player_preferences_path().with_file_name("playback-progress-v1.json")
}
fn read_records(p: &Path) -> Vec<Record> {
    for candidate in [p.to_path_buf(), p.with_extension("bak")] {
        if fs::metadata(&candidate).is_ok_and(|m| m.len() <= 16_000_000) {
            if let Some(records) = fs::read(&candidate)
                .ok()
                .and_then(|b| serde_json::from_slice::<Vec<Record>>(&b).ok())
            {
                return records
                    .into_iter()
                    .filter(|r| {
                        r.version == 1
                            && r.context.anime_id.len() <= 200
                            && r.coverage.intervals.len() <= 20000
                    })
                    .take(1000)
                    .collect();
            }
        }
    }
    Vec::new()
}
fn load(s: &mut Store) {
    if !s.loaded {
        s.loaded = true;
        s.records = read_records(&path());
    }
}
fn sample_is_current(record: &Record, sample: &Sample) -> bool {
    record.session_id == sample.session_id && sample.sequence > record.sequence
}
pub fn merge(previous: &Coverage, incoming: &Coverage) -> Coverage {
    let duration = if incoming.duration.is_finite() && incoming.duration > 0.0 {
        incoming.duration
    } else {
        previous.duration
    };
    let compatible = previous.duration <= 0.0
        || duration <= 0.0
        || (previous.duration - duration).abs() <= 10.0_f64.max(duration * 0.02);
    let mut ranges: Vec<[f64; 2]> = incoming
        .intervals
        .iter()
        .chain(previous.intervals.iter().filter(|_| compatible))
        .copied()
        .filter(|r| r[0].is_finite() && r[1].is_finite() && r[0] >= 0.0 && r[1] > r[0])
        .map(|r| {
            [
                r[0],
                if duration > 0.0 {
                    r[1].min(duration)
                } else {
                    r[1]
                },
            ]
        })
        .filter(|r| r[1] > r[0])
        .take(20000)
        .collect();
    ranges.sort_by(|a, b| a[0].total_cmp(&b[0]));
    let mut intervals: Vec<[f64; 2]> = Vec::new();
    for r in ranges {
        if let Some(last) = intervals.last_mut() {
            if r[0] <= last[1] + 0.05 {
                last[1] = last[1].max(r[1]);
                continue;
            }
        }
        intervals.push(r);
    }
    let baseline = if compatible && previous.furthest.is_finite() {
        previous.furthest.max(0.0)
    } else {
        0.0
    };
    let furthest = intervals.iter().map(|r| r[1]).fold(baseline, f64::max);
    Coverage {
        intervals,
        furthest: if duration > 0.0 {
            furthest.min(duration)
        } else {
            furthest
        },
        duration,
        last_position: if incoming.last_position.is_finite() {
            incoming.last_position.max(0.0)
        } else {
            0.0
        },
    }
}
pub fn complete(c: &Coverage) -> bool {
    c.duration > 0.0 && c.intervals.iter().map(|r| r[1] - r[0]).sum::<f64>() / c.duration >= 0.92
}
fn persist_at(p: &Path, records: &[Record]) -> Result<(), String> {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = p.with_extension("tmp");
    let backup = p.with_extension("bak");
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    let mut count = records.len();
    let bytes = loop {
        let bytes = serde_json::to_vec(&records[..count]).map_err(|e| e.to_string())?;
        if bytes.len() <= 16_000_000 {
            break bytes;
        }
        if count <= 1 {
            return Err("Checkpoint exceeds storage limit".into());
        }
        count -= 1;
    };
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    if p.exists() {
        if backup.exists() {
            fs::remove_file(&backup).map_err(|e| e.to_string())?;
        }
        fs::rename(&p, &backup).map_err(|e| e.to_string())?;
    }
    fs::rename(temp, p).map_err(|e| e.to_string())
}
pub fn begin(ipc: &str, mut context: Context) {
    if context.anime_id.len() > 200
        || context.title.len() > 500
        || context.source_key.len() > 1000
        || context.baseline.intervals.len() > 20000
    {
        return;
    }
    flush(ipc);
    let generation = SERIAL.fetch_add(1, Ordering::SeqCst) + 1;
    let session_id = format!(
        "{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        generation
    );
    let mut s = store().lock().unwrap_or_else(|e| e.into_inner());
    load(&mut s);
    let previous = s.records.iter().find(|r| {
        r.context.owner == context.owner
            && r.context.anime_id == context.anime_id
            && r.context.episode == context.episode
            && r.context.source_key == context.source_key
    });
    let coverage = merge(
        &context.baseline,
        &previous.map(|r| r.coverage.clone()).unwrap_or_default(),
    );
    context.baseline = Coverage::default();
    s.active.clear();
    s.saved_at.clear();
    s.active.insert(
        ipc.into(),
        Record {
            version: 1,
            session_id: session_id.clone(),
            generation,
            sequence: 0,
            context,
            completed: complete(&coverage),
            coverage,
            state: "starting".into(),
            updated_at: 0,
        },
    );
    drop(s);
    send_player_script_message_arg(ipc, "streamnyaa-progress-session", &session_id);
}
pub fn accept(ipc: &str, raw: &str) {
    if raw.len() > 1_000_000 {
        return;
    }
    let Ok(sample) = serde_json::from_str::<Sample>(raw) else {
        return;
    };
    let mut s = store().lock().unwrap_or_else(|e| e.into_inner());
    load(&mut s);
    let Some(record) = s.active.get_mut(ipc) else {
        return;
    };
    if !sample_is_current(record, &sample) {
        return;
    }
    let was_completed = record.completed;
    record.sequence = sample.sequence;
    record.coverage = merge(&record.coverage, &sample.coverage);
    record.completed = complete(&record.coverage);
    record.state = match sample.state.as_str() {
        "eof" | "closed" | "paused" | "buffering" | "playing" => sample.state,
        _ => "starting".into(),
    };
    record.updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let record = record.clone();
    let should_publish = record.state != "playing"
        || record.completed != was_completed
        || record
            .updated_at
            .saturating_sub(*s.saved_at.get(ipc).unwrap_or(&0))
            >= 5000;
    if !should_publish {
        return;
    }
    s.saved_at.insert(ipc.into(), record.updated_at);
    s.records.retain(|r| {
        !(r.context.owner == record.context.owner
            && r.context.anime_id == record.context.anime_id
            && r.context.episode == record.context.episode
            && r.context.source_key == record.context.source_key)
    });
    s.records.insert(0, record.clone());
    s.records.truncate(1000);
    if persist_at(&path(), &s.records).is_err() {
        log_info("PROGRESS_CHECKPOINT_WRITE_FAILED");
    }
    drop(s);
    if let (Some(id), Some(file)) = (&record.context.offline_id, &record.context.offline_file) {
        download_queue::save_native_progress(id, file, &record);
    }
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("streamnyaa-playback-progress", &record);
    }
}
pub fn flush(ipc: &str) {
    if !store()
        .lock()
        .map(|s| s.active.contains_key(ipc))
        .unwrap_or(false)
    {
        return;
    }
    let before = get_player_property_string(ipc, "user-data/streamnyaa/progress-checkpoint");
    send_player_script_message(ipc, "streamnyaa-progress-flush");
    let deadline = Instant::now() + Duration::from_millis(250);
    loop {
        if let Some(raw) =
            get_player_property_string(ipc, "user-data/streamnyaa/progress-checkpoint")
        {
            if before.as_ref() != Some(&raw) {
                accept(ipc, &raw);
                break;
            }
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
}
#[tauri::command]
pub async fn flush_playback_checkpoint() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let ipc = manager().lock().ok().and_then(|g| g.player_ipc.clone());
        if let Some(ipc) = ipc {
            flush(&ipc);
        }
    })
    .await
    .map_err(|_| "Could not flush playback checkpoint".to_string())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    records: Vec<Record>,
    active_session_ids: Vec<String>,
}
#[tauri::command]
pub fn get_playback_checkpoints(owner: String) -> Snapshot {
    let mut s = store().lock().unwrap_or_else(|e| e.into_inner());
    load(&mut s);
    Snapshot {
        records: s
            .records
            .iter()
            .filter(|r| r.context.owner == owner)
            .cloned()
            .collect(),
        active_session_ids: s.active.values().map(|r| r.session_id.clone()).collect(),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unique_coverage_and_seek() {
        let a = Coverage {
            duration: 100.0,
            intervals: vec![[0.0, 50.0]],
            ..Default::default()
        };
        let b = Coverage {
            duration: 100.0,
            intervals: vec![[25.0, 60.0]],
            last_position: 99.0,
            ..Default::default()
        };
        let c = merge(&a, &b);
        assert_eq!(c.intervals, vec![[0.0, 60.0]]);
        assert_eq!(c.furthest, 60.0);
        assert!(!complete(&c));
    }
    #[test]
    fn completion_and_incompatible_cut() {
        let a = Coverage {
            duration: 100.0,
            intervals: vec![[0.0, 93.0]],
            ..Default::default()
        };
        assert!(complete(&merge(&Coverage::default(), &a)));
        let b = Coverage {
            duration: 200.0,
            ..Default::default()
        };
        assert!(!complete(&merge(&a, &b)));
    }
    #[test]
    fn legacy_baseline_is_not_coverage() {
        let a = Coverage {
            furthest: 90.0,
            ..Default::default()
        };
        let c = merge(
            &a,
            &Coverage {
                duration: 100.0,
                ..Default::default()
            },
        );
        assert_eq!(c.furthest, 90.0);
        assert!(!complete(&c));
    }
    fn fixture() -> Record {
        Record {
            version: 1,
            session_id: "current".into(),
            generation: 2,
            sequence: 4,
            context: Context::default(),
            coverage: Coverage::default(),
            completed: false,
            state: "paused".into(),
            updated_at: 0,
        }
    }
    #[test]
    fn rejects_stale_sessions_and_duplicate_events() {
        let r = fixture();
        for (id, sequence) in [("old", 99), ("current", 4), ("current", 3)] {
            assert!(!sample_is_current(
                &r,
                &Sample {
                    session_id: id.into(),
                    sequence,
                    coverage: Coverage::default(),
                    state: "playing".into()
                }
            ));
        }
        assert!(sample_is_current(
            &r,
            &Sample {
                session_id: "current".into(),
                sequence: 5,
                coverage: Coverage::default(),
                state: "eof".into()
            }
        ));
    }
    #[test]
    fn atomic_checkpoint_recovers_previous_valid_copy() {
        let dir = env::temp_dir().join(format!(
            "streamnyaa-checkpoint-test-{}-{}",
            std::process::id(),
            now_millis()
        ));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("records.json");
        let a = fixture();
        persist_at(&p, &[a]).unwrap();
        let mut b = fixture();
        b.sequence = 5;
        persist_at(&p, &[b]).unwrap();
        assert_eq!(read_records(&p)[0].sequence, 5);
        fs::write(&p, b"{partial").unwrap();
        assert_eq!(read_records(&p)[0].sequence, 4);
        for name in ["records.json", "records.bak"] {
            fs::remove_file(dir.join(name)).unwrap();
        }
        fs::remove_dir(dir).unwrap();
    }
}
