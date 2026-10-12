//! Nonblocking snapshots received on the player's persistent event connection.
use super::*;
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub generation: u64,
    pub seek_generation: u64,
    pub sequence: u64,
    pub path: String,
    pub position: Option<f64>,
    pub duration: Option<f64>,
    pub paused: Option<bool>,
    pub volume: Option<f64>,
    pub buffered: Option<f64>,
    pub cache_percent: Option<f64>,
    pub buffering: bool,
    pub seeking: bool,
    pub started: bool,
    pub resume_target: Option<f64>,
    pub recovery: String,
    pub coverage: Option<serde_json::Value>,
}
static SNAPSHOTS: OnceLock<Mutex<HashMap<String, (u128, Snapshot)>>> = OnceLock::new();
fn snapshots() -> &'static Mutex<HashMap<String, (u128, Snapshot)>> { SNAPSHOTS.get_or_init(Default::default) }
pub fn accept(ipc: &str, raw: &str) {
    if raw.len() > 1_000_000 { return; }
    let Ok(value) = serde_json::from_str::<Snapshot>(raw) else { return; };
    let current = manager().lock().ok().is_some_and(|guard| guard.player_ipc.as_deref() == Some(ipc)
        && guard.active.as_ref().is_some_and(|active| active.playback_generation == value.generation && active.media_url == value.path));
    if !current { return; }
    if let Ok(mut values) = snapshots().lock() {
        if values.get(ipc).is_some_and(|(_, old)| old.generation == value.generation && (old.sequence >= value.sequence || old.seek_generation > value.seek_generation)) { return; }
        values.clear(); values.insert(ipc.into(), (now_millis(), value));
    }
}
pub fn read(ipc: &str, generation: u64) -> Option<Snapshot> {
    snapshots().lock().ok()?.get(ipc).filter(|(at, value)| now_millis().saturating_sub(*at) <= 2_000 && value.generation == generation).map(|(_, value)| value.clone())
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn expired_and_wrong_generation_snapshots_are_unknown() {
        snapshots().lock().unwrap().insert("fixture".into(), (now_millis(), Snapshot { generation: 42, ..Default::default() }));
        assert!(read("fixture", 41).is_none()); assert!(read("fixture", 42).is_some());
        snapshots().lock().unwrap().insert("fixture".into(), (now_millis() - 3_000, Snapshot { generation: 42, ..Default::default() }));
        assert!(read("fixture", 42).is_none());
    }
}
