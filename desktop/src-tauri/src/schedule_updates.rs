//! Public schedule metadata and global change alerts; never starts torrents or stores credentials.
use super::*;
use chrono::{Datelike, Utc};
use serde_json::{json, Value};
use tauri_plugin_notification::{NotificationExt, PermissionState};
const DAY: u64 = 86_400_000;
static STORE: OnceLock<Mutex<State>> = OnceLock::new();
static BUSY: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub personal: bool,
    pub global: bool,
    pub personal_ids: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub id: String,
    pub key: String,
    pub anime_id: String,
    pub anilist_id: Option<String>,
    pub mal_id: Option<String>,
    pub title: String,
    pub episode: u32,
    pub release_track: String,
    pub kind: String,
    pub previous_airing_at: u64,
    pub airing_at: u64,
    pub detected_at: u64,
    #[serde(default)]
    pub notified_at: Option<u64>,
    #[serde(default)]
    pub seeded: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct State {
    version: u32,
    pub tracks: Vec<Value>,
    pub changes: Vec<Change>,
    preferences: Preferences,
    fetched_at: u64,
    last_attempt_at: u64,
    feed: Vec<Value>,
    cursor: usize,
    seeded: bool,
    mappings: HashMap<String, (u64, Value)>,
    pub error: Option<String>,
    #[serde(skip)]
    persistence_error: Option<String>,
    #[serde(skip)]
    save_attempts: u32,
    #[serde(skip)]
    retry_save_at: u64,
}
impl Default for State {
    fn default() -> Self {
        Self {
            version: 1,
            tracks: vec![],
            changes: vec![],
            preferences: Preferences::default(),
            fetched_at: 0,
            last_attempt_at: 0,
            feed: vec![],
            cursor: 0,
            seeded: false,
            mappings: HashMap::new(),
            error: None,
            persistence_error: None,
            save_attempts: 0,
            retry_save_at: 0,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    version: u32,
    tracks: Vec<Value>,
    changes: Vec<Change>,
    error: Option<String>,
    #[serde(default)]
    persistence_error: Option<String>,
}
fn view(state: &State) -> View {
    View {
        version: state.version,
        tracks: state.tracks.clone(),
        changes: state.changes.clone(),
        error: state.error.clone(),
        persistence_error: state.persistence_error.clone(),
    }
}
fn path() -> PathBuf {
    player_preferences_path().with_file_name("schedule-alerts-v1.json")
}
fn now() -> u64 {
    now_millis().min(u64::MAX as u128) as u64
}
fn store() -> &'static Mutex<State> {
    STORE.get_or_init(|| Mutex::new(load_from(&path())))
}
fn valid_change(c: &Change) -> bool {
    c.episode > 0
        && c.episode <= 100000
        && c.title.len() <= 500
        && c.detected_at <= now().saturating_add(60_000)
        && valid_id(&c.anime_id)
        && c.key == format!("{}:episode-{}:{}", c.anime_id, c.episode, c.release_track)
        && c.id == format!("{}:{}:{}", c.key, c.kind, c.airing_at)
        && matches!(c.release_track.as_str(), "original" | "sub" | "dub")
        && matches!(
            c.kind.as_str(),
            "delayed" | "postponed" | "cancelled" | "on break" | "rescheduled"
        )
}
fn load_from(path: &std::path::Path) -> State {
    let read = |file: &std::path::Path, legacy: bool| -> Option<State> {
        if !fs::metadata(file).is_ok_and(|m| m.is_file() && m.len() <= 4_000_000) {
            return None;
        }
        let mut s: State = serde_json::from_slice(&fs::read(file).ok()?).ok()?;
        if !(s.version == 1 || legacy && s.version == 0)
            || s.tracks.len() > 5000
            || s.changes.len() > 1200
            || s.feed.len() > 3000
            || s.cursor > s.feed.len()
            || s.mappings.len() > 3000
            || s.preferences.personal_ids.len() > 20000
            || !s.preferences.personal_ids.iter().all(|id| valid_id(id))
            || !s.tracks.iter().all(valid_track)
            || !s.changes.iter().all(valid_change)
        {
            return None;
        }
        s.version = 1;
        Some(s)
    };
    if let Some(s) = read(path, false) {
        return s;
    }
    if let Some(mut s) = read(&path.with_extension("tmp"), true) {
        s.persistence_error = Some("Recovered Calendar updates are waiting to be saved.".into());
        return s;
    }
    State::default()
}
fn save_to(path: &std::path::Path, state: &State) -> Result<(), String> {
    use std::io::Write;
    let temp = path.with_extension("tmp");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "Schedule storage is unavailable.")?;
    }
    let bytes = serde_json::to_vec(state).map_err(|_| "Schedule data could not be encoded.")?;
    if bytes.len() > 4_000_000 {
        return Err("Schedule cache is full.".into());
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(|_| "Schedule data could not be saved. Check free space and folder access.")?;
    file.write_all(&bytes)
        .map_err(|_| "Schedule data could not be saved. Check free space.")?;
    file.sync_all()
        .map_err(|_| "Schedule data could not be flushed.")?;
    drop(file);
    fs::rename(temp, path).map_err(|_| "Schedule data could not be replaced.".into())
}
fn persist_to(path: &std::path::Path, state: &mut State, at: u64) {
    state.version = 1;
    match save_to(path, state) {
        Ok(()) => {
            state.persistence_error = None;
            state.save_attempts = 0;
            state.retry_save_at = 0;
        }
        Err(error) => {
            state.persistence_error = Some(error);
            let delay = [30_000, 60_000, 120_000, 300_000][state.save_attempts.min(3) as usize];
            state.save_attempts = state.save_attempts.saturating_add(1);
            state.retry_save_at = at.saturating_add(delay);
        }
    }
}
fn persist(state: &mut State) {
    if state.persistence_error.is_some() && now() < state.retry_save_at {
        return;
    }
    persist_to(&path(), state, now());
}
fn retry_pending_save() {
    if let Ok(mut state) = store().lock() {
        if state.persistence_error.is_some() && now() >= state.retry_save_at {
            persist(&mut state);
            publish(&state);
        }
    }
}
fn publish(state: &State) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("streamnyaa-schedule-alerts", view(state));
    }
}
pub fn timestamp(value: &Value) -> u64 {
    value
        .as_str()
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis())
        .filter(|v| *v > 0)
        .map(|v| v as u64)
        .unwrap_or(0)
}
fn ids(value: &Value) -> (Option<u32>, Option<u32>) {
    fn visit(value: &Value, anilist: &mut Option<u32>, mal: &mut Option<u32>) {
        match value {
            Value::String(text) => {
                // AnimeSchedule's website values commonly omit the scheme.
                // Parse only the resulting host/path; never match IDs by text similarity.
                let text = text.trim();
                let qualified = if text.starts_with("//") {
                    format!("https:{text}")
                } else if !text.contains("://") {
                    format!("https://{text}")
                } else {
                    text.to_string()
                };
                if let Ok(url) = reqwest::Url::parse(&qualified) {
                    if !matches!(url.scheme(), "http" | "https") {
                        return;
                    }
                    let parts: Vec<_> = url.path_segments().into_iter().flatten().collect();
                    if parts.first() == Some(&"anime") {
                        if let Some(id) = parts
                            .get(1)
                            .and_then(|s| s.parse::<u32>().ok())
                            .filter(|id| *id > 0)
                        {
                            match url.host_str().unwrap_or("").trim_start_matches("www.") {
                                "anilist.co" => *anilist = Some(id),
                                "myanimelist.net" => *mal = Some(id),
                                _ => {}
                            }
                        }
                    }
                }
            }
            Value::Object(map) => {
                for child in map.values() {
                    visit(child, anilist, mal);
                }
            }
            Value::Array(list) => {
                for child in list {
                    visit(child, anilist, mal);
                }
            }
            _ => {}
        }
    }
    let (mut anilist, mut mal) = (None, None);
    visit(&value["websites"], &mut anilist, &mut mal);
    (anilist, mal)
}
fn kind(row: &Value) -> Option<&'static str> {
    let airing_status = row["airingStatus"].as_str().unwrap_or("").trim();
    // `status` describes the series, not this release track. For example an
    // original broadcast can be delayed while the dub episode is already aired.
    // A partial response without track status must not turn a series-wide delay
    // into an episode delay. Already-normalized persisted tracks retain their status.
    let text = format!(
        "{} {}",
        airing_status,
        row["delayedText"].as_str().unwrap_or("")
    )
    .to_lowercase();
    if text.contains("cancel") {
        Some("cancelled")
    } else if text.contains("postpon") {
        Some("postponed")
    } else if text.contains("break") || text.contains("hiatus") {
        Some("on break")
    } else if text.contains("delay") {
        Some("delayed")
    } else if text.contains("reschedul") {
        Some("rescheduled")
    } else {
        None
    }
}
pub fn normalize(row: &Value, detail: &Value, fetched: u64) -> Option<Value> {
    let (anilist, mal) = ids(detail);
    let anime_id = anilist
        .map(|id| format!("anilist:{id}"))
        .or_else(|| mal.map(|id| format!("mal:{id}")))?;
    let track = match row["airType"].as_str()? {
        "raw" => "original",
        "sub" => "sub",
        "dub" => "dub",
        _ => return None,
    };
    let episode = row["episodeNumber"]
        .as_u64()
        .or_else(|| row["episodeNumber"].as_str().and_then(|s| s.parse().ok()))
        .filter(|v| *v > 0 && *v <= 100000)?;
    let status = kind(row);
    if status.is_none() && !matches!(row["airingStatus"].as_str(), Some("aired" | "unaired")) {
        // Missing track evidence cannot create a schedule or resolve a saved delay.
        return None;
    }
    let revised = if status.is_some() {
        let delayed = timestamp(&row["delayedUntil"]);
        if delayed == 0 && status == Some("rescheduled") {
            timestamp(&row["episodeDate"])
        } else {
            delayed
        }
    } else {
        timestamp(&row["episodeDate"])
    };
    let explicit_previous = timestamp(&row["delayedFrom"]);
    let previous = if explicit_previous > 0 {
        explicit_previous
    } else if status.is_some() {
        timestamp(&row["episodeDate"])
    } else {
        0
    };
    Some(
        json!({"id":anilist,"anilist_id":anilist,"mal_id":mal,"canonicalId":anime_id,
        "title":row["english"].as_str().or(row["romaji"].as_str()).or(row["title"].as_str()).unwrap_or("Anime"),
        "airingEpisode":episode,"airingAt":revised/1000,"previousAiringAt":previous,
        "releaseTrack":track,"scheduleStatus":status.unwrap_or("scheduled"),"scheduleReason":row["delayedText"].as_str().unwrap_or(""),
        "scheduleFetchedAt":fetched,"scheduleProvider":"animeschedule",
        "scheduleId":format!("{anime_id}:episode-{episode}:{track}"),"sourceRoute":row["route"]}),
    )
}
fn reconcile(state: &mut State, mut row: Value, now: u64) {
    let key = row["scheduleId"].as_str().unwrap_or("").to_string();
    let prior = state
        .tracks
        .iter()
        .find(|v| v["scheduleId"].as_str() == Some(&key))
        .cloned();
    let old_at = prior
        .as_ref()
        .and_then(|v| v["airingAt"].as_u64())
        .unwrap_or(0)
        * 1000;
    let at = row["airingAt"].as_u64().unwrap_or(0) * 1000;
    if row["scheduleStatus"] == "scheduled"
        && at > 0
        && prior.as_ref().is_some_and(|v| {
            (old_at > 0 && old_at.abs_diff(at) >= 60_000)
                || matches!(
                    v["scheduleStatus"].as_str(),
                    Some("delayed" | "postponed" | "on break" | "rescheduled")
                )
        })
    {
        row["scheduleStatus"] = json!("rescheduled");
    }
    if row["previousAiringAt"].as_u64().unwrap_or(0) == 0 {
        let retained = prior
            .as_ref()
            .and_then(|v| v["previousAiringAt"].as_u64())
            .unwrap_or(0);
        row["previousAiringAt"] = json!(if old_at > 0 && old_at != at {
            old_at
        } else {
            retained
        });
    }
    let status = row["scheduleStatus"].as_str().unwrap_or("scheduled");
    if matches!(
        status,
        "delayed" | "postponed" | "on break" | "cancelled" | "rescheduled"
    ) {
        let at = row["airingAt"].as_u64().unwrap_or(0) * 1000;
        let id = format!("{key}:{status}:{at}");
        if !state.changes.iter().any(|c| c.id == id) {
            state.changes.push(Change {
                id,
                key: key.clone(),
                anime_id: row["canonicalId"].as_str().unwrap_or("").into(),
                anilist_id: row["anilist_id"].as_u64().map(|id| id.to_string()),
                mal_id: row["mal_id"].as_u64().map(|id| id.to_string()),
                title: row["title"].as_str().unwrap_or("Anime").into(),
                episode: row["airingEpisode"].as_u64().unwrap_or(0) as u32,
                release_track: row["releaseTrack"].as_str().unwrap_or("original").into(),
                kind: status.into(),
                previous_airing_at: row["previousAiringAt"].as_u64().unwrap_or(0),
                airing_at: at,
                detected_at: now,
                notified_at: None,
                seeded: !state.seeded,
            });
        }
    }
    state
        .tracks
        .retain(|v| v["scheduleId"].as_str() != Some(&key));
    state.tracks.push(row);
    state.tracks.retain(|v| {
        v["scheduleFetchedAt"].as_u64().unwrap_or(0)
            >= now.saturating_sub(if v["scheduleStatus"].as_str() == Some("scheduled") {
                14 * DAY
            } else {
                60 * DAY
            })
    });
    if state.tracks.len() > 5000 {
        state.tracks.drain(..state.tracks.len() - 5000);
    }
    state
        .changes
        .retain(|c| c.detected_at >= now.saturating_sub(60 * DAY));
    if state.changes.len() > 1200 {
        state.changes.drain(..state.changes.len() - 1200);
    }
}
fn valid_id(id: &str) -> bool {
    id.split_once(':').is_some_and(|(provider, number)| {
        matches!(provider, "anilist" | "mal") && number.parse::<u32>().is_ok_and(|id| id > 0)
    })
}
fn valid_track(track: &Value) -> bool {
    let id = track["canonicalId"].as_str().unwrap_or("");
    let episode = track["airingEpisode"].as_u64().unwrap_or(0);
    let release = track["releaseTrack"].as_str().unwrap_or("");
    valid_id(id)
        && (1..=100000).contains(&episode)
        && matches!(release, "original" | "sub" | "dub")
        && track["scheduleProvider"] == "animeschedule"
        && track["scheduleId"] == format!("{id}:episode-{episode}:{release}")
        && matches!(
            track["scheduleStatus"].as_str(),
            Some("scheduled" | "rescheduled" | "delayed" | "postponed" | "on break" | "cancelled")
        )
        && track["scheduleFetchedAt"]
            .as_u64()
            .is_some_and(|at| at <= now().saturating_add(60_000))
}
#[tauri::command]
pub fn get_desktop_schedule_alerts() -> View {
    store()
        .lock()
        .map(|s| view(&s))
        .unwrap_or_else(|_| view(&State::default()))
}
#[tauri::command]
pub fn configure_desktop_schedule_alerts(
    preferences: Preferences,
    imported: Option<View>,
) -> Result<View, String> {
    if preferences.personal_ids.len() > 20000
        || preferences.personal_ids.iter().any(|id| !valid_id(id))
    {
        return Err("Invalid personal schedule identities.".into());
    }
    let mut state = store().lock().map_err(|_| "Schedule storage is busy.")?;
    let mut next = state.clone();
    next.version = 1;
    next.preferences = preferences;
    if let Some(imported) =
        imported.filter(|s| s.version == 1 && s.changes.len() <= 1200 && s.tracks.len() <= 5000)
    {
        for change in imported.changes.into_iter().filter(|c| {
            c.episode > 0
                && c.episode <= 100000
                && c.title.len() <= 500
                && c.detected_at <= now().saturating_add(60_000)
                && valid_id(&c.anime_id)
                && c.key == format!("{}:episode-{}:{}", c.anime_id, c.episode, c.release_track)
                && c.id == format!("{}:{}:{}", c.key, c.kind, c.airing_at)
                && matches!(c.release_track.as_str(), "original" | "sub" | "dub")
                && matches!(
                    c.kind.as_str(),
                    "delayed" | "postponed" | "cancelled" | "on break" | "rescheduled"
                )
        }) {
            if let Some(prior) = next.changes.iter_mut().find(|c| c.id == change.id) {
                prior.notified_at = prior.notified_at.max(change.notified_at);
            } else {
                next.changes.push(change);
            }
        }
        for track in imported.tracks.into_iter().filter(valid_track) {
            if !next
                .tracks
                .iter()
                .any(|r| r["scheduleId"] == track["scheduleId"])
            {
                next.tracks.push(track);
            }
        }
    }
    persist(&mut next);
    *state = next;
    publish(&state);
    Ok(view(&state))
}
pub fn blocked(anime_id: &str, episode: u32) -> bool {
    store().lock().is_ok_and(|s| {
        s.tracks.iter().any(|r| {
            (r["canonicalId"].as_str() == Some(anime_id)
                || anime_id == format!("mal:{}", r["mal_id"].as_u64().unwrap_or(0)))
                && r["airingEpisode"].as_u64() == Some(episode as u64)
                && r["releaseTrack"] == "original"
                && matches!(
                    r["scheduleStatus"].as_str(),
                    Some("delayed" | "postponed" | "on break" | "cancelled")
                )
        })
    })
}
async fn fetch(path: &str, ttl: u64, deadline: u64) -> Result<(Value, u64, bool), String> {
    let response = crate::reminder_scheduler::execute_bounded(
        data_requests::Job::Metadata(MetadataApiRequest {
            provider: "animeschedule".into(),
            path: Some(path.into()),
            body: None,
            ttl_seconds: Some(ttl),
        }),
        "schedule-track",
        deadline,
    )
    .await
    .map_err(|e| e.message)?;
    let payload = response.data;
    if payload["disabled"].as_bool() == Some(true) {
        return Err("Delay information is not configured on the metadata server.".into());
    }
    let fetched = payload["streamnyaa"]["fetchedAt"]
        .as_u64()
        .unwrap_or(response.fetched_at.min(u64::MAX as u128) as u64);
    let stale = payload["streamnyaa"]["stale"].as_bool().unwrap_or(false)
        || response.cache_status == "stale";
    Ok((
        payload.get("data").cloned().unwrap_or(payload),
        fetched,
        stale,
    ))
}
pub async fn tick() {
    retry_pending_save();
    if get_desktop_playback_busy() || BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            BUSY.store(false, Ordering::SeqCst);
        }
    }
    let _reset = Reset;
    let mut next = match store().lock() {
        Ok(s) => s.clone(),
        Err(_) => return,
    };
    let now = now();
    if now.saturating_sub(next.last_attempt_at) < 15 * 60_000 && next.cursor >= next.feed.len() {
        return;
    }
    if now.saturating_sub(next.last_attempt_at) >= 15 * 60_000 {
        next.last_attempt_at = now;
        let dates = [Utc::now(), Utc::now() + chrono::Duration::days(7)];
        let mut feed = Vec::new();
        let mut original = now;
        let mut complete = true;
        next.error = None;
        for date in dates {
            if get_desktop_playback_busy() || !crate::reminder_scheduler::running() {
                complete = false;
                break;
            }
            let week = date.iso_week();
            match fetch(
                &format!(
                    "/timetables/all?year={}&week={}&tz=UTC",
                    week.year(),
                    week.week()
                ),
                900,
                30_000,
            )
            .await
            {
                Ok((value, fetched, false)) if value.is_array() => {
                    feed.extend(value.as_array().unwrap().iter().take(1500).cloned());
                    original = original.min(fetched);
                }
                Ok(_) => {
                    complete = false;
                    next.error=Some("Showing last reported schedule changes; fresh release-track data could not be verified.".into());
                }
                Err(error) => {
                    complete = false;
                    next.error = Some(error);
                    break;
                }
            }
        }
        if !feed.is_empty() || complete {
            next.feed = feed;
            next.cursor = 0;
            next.fetched_at = original;
        }
    }
    let started = Instant::now();
    let mut requests = 0;
    while next.cursor < next.feed.len()
        && requests < 12
        && started.elapsed() < Duration::from_secs(30)
        && !get_desktop_playback_busy()
        && crate::reminder_scheduler::running()
    {
        let row = next.feed[next.cursor].clone();
        let Some(route) = row["route"].as_str().filter(|s| {
            !s.is_empty()
                && s.len() < 250
                && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        }) else {
            next.cursor += 1;
            continue;
        };
        let cached = next
            .mappings
            .get(route)
            .filter(|(at, _)| now.saturating_sub(*at) < DAY)
            .cloned();
        let detail = if let Some((_, detail)) = cached {
            detail
        } else {
            requests += 1;
            match fetch(
                &format!("/anime/{route}"),
                86400,
                (30_000u64)
                    .saturating_sub(started.elapsed().as_millis() as u64)
                    .max(1),
            )
            .await
            {
                Ok((detail, at, false)) => {
                    next.mappings.insert(route.into(), (at, detail.clone()));
                    detail
                }
                _ => {
                    next.error=Some("Some release-track identities could not be verified. They will be retried.".into());
                    next.cursor += 1;
                    continue;
                }
            }
        };
        if let Some(track) = normalize(&row, &detail, next.fetched_at) {
            reconcile(&mut next, track, now);
        }
        next.cursor += 1;
    }
    if next.cursor == next.feed.len() && !next.feed.is_empty() {
        next.seeded = true;
    }
    next.mappings
        .retain(|_, (at, _)| now.saturating_sub(*at) < 7 * DAY);
    if let Ok(mut state) = store().lock() {
        // Settings may have changed during I/O.
        next.preferences = state.preferences.clone();
        for change in &mut next.changes {
            if let Some(old) = state.changes.iter().find(|old| old.id == change.id) {
                change.notified_at = old.notified_at;
            }
        }
        next.version = 1;
        // Preserve a live working cursor even when disk persistence is unavailable.
        persist(&mut next);
        *state = next;
        publish(&state);
    }
}
fn eligible(change: &Change, preferences: &Preferences, now: u64) -> bool {
    !change.seeded
        && change.notified_at.is_none()
        && change.detected_at <= now
        && now - change.detected_at <= DAY
        && if preferences.personal_ids.contains(&change.anime_id) {
            preferences.personal
        } else {
            preferences.global
        }
}
pub fn deliver(granted: bool) {
    if !granted {
        return;
    }
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    if !matches!(
        app.notification().permission_state(),
        Ok(PermissionState::Granted)
    ) {
        return;
    }
    let Ok(mut state) = store().lock() else {
        return;
    };
    // Keep Bell updates available, but do not attempt Windows delivery before
    // its schedule has reached durable storage.
    if state.persistence_error.is_some() {
        return;
    }
    let now = now();
    let due: Vec<usize> = state
        .changes
        .iter()
        .enumerate()
        .filter(|(_, c)| {
            eligible(c, &state.preferences, now)
                && state.tracks.iter().any(|track| {
                    track["scheduleId"] == c.key
                        && track["scheduleStatus"] == c.kind
                        && track["airingAt"].as_u64().unwrap_or(0) * 1000 == c.airing_at
                })
        })
        .map(|(i, _)| i)
        .collect();
    if due.is_empty() {
        return;
    }
    let (title, body) = if due.len() == 1 {
        let c = &state.changes[due[0]];
        (
            format!("{} · {}", c.title, c.kind),
            format!(
                "Episode {} · {}. Open Calendar for the revised schedule.",
                c.episode, c.release_track
            ),
        )
    } else {
        ("Anime schedule changes".into(),format!("{} confirmed updates. Open StreamNyaa’s Bell for the affected episodes and release tracks.",due.len()))
    };
    if app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .is_ok()
    {
        let mut next = state.clone();
        for index in due {
            next.changes[index].notified_at = Some(now);
        }
        persist(&mut next);
        *state = next;
        publish(&state);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Opt-in live production gateway and Windows durable-cache probe"]
    async fn live_gateway_identity_cache_and_frontend_view() {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(25))
            .build()
            .unwrap();
        async fn request(client: &reqwest::Client, path: &str) -> Value {
            let mut url =
                reqwest::Url::parse("https://www.streamnyaa.xyz/api/stream-sources").unwrap();
            url.query_pairs_mut()
                .append_pair("provider", "animeschedule")
                .append_pair("ttl", "900")
                .append_pair("path", path);
            let response = client
                .get(url)
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap();
            let value: Value = response.json().await.unwrap();
            assert_ne!(value["streamnyaa"]["stale"], true);
            value.get("data").cloned().unwrap_or(value)
        }
        let rows = request(&client, "/timetables/all?year=2026&week=42&tz=UTC").await;
        let row = rows
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["route"] == "beyblade-x" && row["airType"] == "dub")
            .expect("Reported Beyblade dub release must be present");
        let detail = request(&client, "/anime/beyblade-x").await;
        let track = normalize(row, &detail, now()).unwrap();
        assert_eq!(track["canonicalId"], "anilist:165159");
        assert_eq!(track["releaseTrack"], "dub");
        assert_eq!(track["scheduleStatus"], "on break");
        let mut state = State::default();
        reconcile(&mut state, track.clone(), now());
        assert!(state.changes.iter().all(|change| change.seeded));
        let root = test_directory();
        let path = root.join("schedule-alerts-v1.json");
        persist_to(&path, &mut state, now());
        assert!(state.persistence_error.is_none());
        let reloaded = load_from(&path);
        let published = view(&reloaded);
        assert_eq!(published.version, 1);
        assert_eq!(published.tracks[0], track);
        assert_eq!(published.changes.len(), 1);
        println!(
            "Published schedule view: {}",
            serde_json::to_string(&published).unwrap()
        );
        println!("Live gateway -> canonical anilist:165159 -> durable Windows cache -> frontend view: {} tracks, episode {}, {}, initial alerts suppressed", published.tracks.len(), track["airingEpisode"], track["scheduleStatus"]);
        fs::remove_file(path).unwrap();
        fs::remove_dir(root).unwrap();
    }
    fn test_directory() -> PathBuf {
        let root = env::temp_dir().join(format!(
            "streamnyaa-schedule-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        root
    }
    #[test]
    fn windows_atomic_save_replaces_and_reopens_schema_one() {
        let root = test_directory();
        let file = root.join("state.json");
        let mut state = State::default();
        assert_eq!(view(&state).version, 1);
        state.feed = vec![json!({"route":"one"})];
        state.cursor = 1;
        persist_to(&file, &mut state, 1000);
        assert!(state.persistence_error.is_none());
        assert_eq!(load_from(&file).cursor, 1);
        state.seeded = true;
        persist_to(&file, &mut state, 2000);
        assert!(load_from(&file).seeded);
        assert!(!file.with_extension("tmp").exists());
        fs::remove_file(file).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn orphan_recovery_validates_schema_and_keeps_valid_primary() {
        let root = test_directory();
        let file = root.join("state.json");
        let temp = file.with_extension("tmp");
        let mut state = State::default();
        state.version = 0;
        state.feed = vec![json!({"route":"one"})];
        state.cursor = 1;
        fs::write(&temp, serde_json::to_vec(&state).unwrap()).unwrap();
        let mut recovered = load_from(&file);
        assert_eq!(recovered.version, 1);
        assert_eq!(recovered.cursor, 1);
        assert!(recovered.persistence_error.is_some());
        assert!(!recovered.seeded);
        persist_to(&file, &mut recovered, 1000);
        fs::write(&temp, serde_json::to_vec(&State::default()).unwrap()).unwrap();
        assert_eq!(load_from(&file).cursor, 1);
        fs::remove_file(&file).unwrap();
        state.version = 99;
        fs::write(&temp, serde_json::to_vec(&state).unwrap()).unwrap();
        assert_eq!(load_from(&file).cursor, 0);
        state.version = 0;
        state.tracks = vec![json!({"canonicalId":"mal:wrong"})];
        fs::write(&temp, serde_json::to_vec(&state).unwrap()).unwrap();
        assert!(load_from(&file).tracks.is_empty());
        fs::remove_file(temp).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn failed_save_retains_live_cursor_and_backs_off_without_network_reset() {
        let root = test_directory();
        let blocked = root.join("blocked");
        fs::write(&blocked, b"not a folder").unwrap();
        let file = blocked.join("state.json");
        let mut state = State::default();
        state.feed = vec![json!({"route":"one"})];
        state.cursor = 1;
        state.last_attempt_at = 100;
        persist_to(&file, &mut state, 1000);
        assert!(view(&state).persistence_error.is_some());
        assert_eq!(state.retry_save_at, 31000);
        assert_eq!(state.cursor, 1);
        assert_eq!(state.last_attempt_at, 100);
        persist_to(&file, &mut state, 31000);
        assert_eq!(state.retry_save_at, 91000);
        fs::remove_file(&blocked).unwrap();
        persist_to(&file, &mut state, 91000);
        assert!(state.persistence_error.is_none());
        assert_eq!(load_from(&file).cursor, 1);
        fs::remove_file(file).unwrap();
        fs::remove_dir(blocked).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn tba_and_track_identity_are_preserved() {
        let detail = json!({"websites":{"anilist":"https://anilist.co/anime/1","mal":"https://myanimelist.net/anime/2"}});
        let row = json!({"airType":"dub","route":"example","episodeNumber":101,"status":"Delayed","airingStatus":"delayed-air","delayedFrom":"2026-10-18T04:30:00Z","delayedUntil":"0001-01-01T00:00:00Z"});
        let track = normalize(&row, &detail, 1000).unwrap();
        assert_eq!(track["airingAt"], 0);
        assert_eq!(track["releaseTrack"], "dub");
        let mut state = State::default();
        reconcile(&mut state, track.clone(), 1000);
        reconcile(&mut state, track, 2000);
        assert_eq!(state.changes.len(), 1);
        assert_eq!(state.changes[0].detected_at, 1000);
        assert!(state.changes[0].seeded);
        let mut raw = row;
        raw["airType"] = json!("raw");
        assert_ne!(
            normalize(&raw, &detail, 1000).unwrap()["scheduleId"],
            state.tracks[0]["scheduleId"]
        );
    }
    #[test]
    fn global_alerts_need_no_bell_and_personal_off_does_not_leak_to_global() {
        let detail = json!({"websites":{"anilist":"https://anilist.co/anime/1"}});
        let row = json!({"airType":"dub","episodeNumber":101,"status":"Delayed","airingStatus":"delayed-air"});
        let mut state = State::default();
        state.seeded = true;
        reconcile(&mut state, normalize(&row, &detail, 1000).unwrap(), 1000);
        let preferences = Preferences {
            personal: false,
            global: true,
            personal_ids: vec![],
        };
        assert!(eligible(&state.changes[0], &preferences, 1001));
        let personal = Preferences {
            personal_ids: vec!["anilist:1".into()],
            ..preferences
        };
        assert!(!eligible(&state.changes[0], &personal, 1001));
        assert!(!eligible(&state.changes[0], &personal, 1000 + DAY + 1));
        state.changes[0].notified_at = Some(1001);
        let restored: State = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
        assert!(!eligible(
            &restored.changes[0],
            &Preferences {
                personal: true,
                global: true,
                personal_ids: vec![]
            },
            1002
        ));
    }
    #[test]
    fn missing_identity_and_absence_do_not_invent_delays() {
        assert!(normalize(&json!({"episodeNumber":1,"airType":"raw"}), &json!({}), 100).is_none());
        assert_eq!(kind(&json!({"status":"airing"})), None);
        assert_eq!(kind(&json!({"status":"Delayed"})), None);
        assert!(normalize(
            &json!({"status":"Delayed","episodeNumber":1,"airType":"dub","episodeDate":"2026-10-18T04:30:00Z"}),
            &json!({"websites":{"aniList":"anilist.co/anime/1"}}),
            100,
        ).is_none());
        assert_eq!(timestamp(&json!("0001-01-01T00:00:00Z")), 0);
    }
    #[test]
    fn live_website_formats_resolve_only_canonical_hosts() {
        let detail = json!({"websites":{
            "aniList":"anilist.co/anime/165159/BEYBLADE-X/",
            "mal":"myanimelist.net/anime/56566/Beyblade_X"
        }});
        assert_eq!(ids(&detail), (Some(165159), Some(56566)));
        assert_eq!(
            ids(&json!({"websites":{"aniList":"//www.anilist.co/anime/165159"}})),
            (Some(165159), None)
        );
        for value in [
            "anilist.co.evil.test/anime/1",
            "https://anilist.co@evil.test/anime/1",
            "https://evil.test/anilist.co/anime/1",
            "ftp://anilist.co/anime/1",
            "anilist.co/anime/0",
        ] {
            assert_eq!(ids(&json!({"websites":{"aniList":value}})), (None, None));
        }
    }
    #[test]
    fn series_delay_does_not_leak_into_aired_or_upcoming_dub() {
        let detail = json!({"websites":{"aniList":"anilist.co/anime/1"}});
        for airing_status in ["aired", "unaired"] {
            let row = json!({"airType":"dub","episodeNumber":6,"status":"Delayed",
                "airingStatus":airing_status,"delayedText":null,"episodeDate":"2026-10-13T16:00:00Z"});
            let track = normalize(&row, &detail, 1000).unwrap();
            assert_eq!(track["scheduleStatus"], "scheduled");
            assert_eq!(track["airingAt"], timestamp(&row["episodeDate"]) / 1000);
            let mut state = State::default();
            state.seeded = true;
            reconcile(&mut state, track, 1000);
            assert!(state.changes.is_empty());
        }
    }
    #[test]
    fn reported_beyblade_dub_break_keeps_track_and_unknown_revised_date() {
        let detail = json!({"websites":{"aniList":"anilist.co/anime/165159/BEYBLADE-X/",
            "mal":"myanimelist.net/anime/56566/Beyblade_X"}});
        let row = json!({"title":"Beyblade X","route":"beyblade-x","airType":"dub",
            "episodeNumber":101,"status":"Ongoing","airingStatus":"delayed-air",
            "delayedText":"Break","delayedFrom":"2026-03-14T00:00:00Z",
            "delayedUntil":"0001-01-01T00:00:00Z","episodeDate":"2026-10-17T22:45:00Z"});
        let track = normalize(&row, &detail, 1000).unwrap();
        assert_eq!(track["canonicalId"], "anilist:165159");
        assert_eq!(track["mal_id"], 56566);
        assert_eq!(track["scheduleId"], "anilist:165159:episode-101:dub");
        assert_eq!(track["scheduleStatus"], "on break");
        assert_eq!(track["airingAt"], 0);
        assert!(track["previousAiringAt"].as_u64().unwrap() > 0);
    }
    #[test]
    fn revised_times_have_their_own_revision_and_keep_the_original_slot() {
        let detail = json!({"websites":{"anilist":"https://anilist.co/anime/1"}});
        let mut row = json!({"airType":"dub","episodeNumber":1,"airingStatus":"unaired","episodeDate":"2026-10-18T04:30:00Z"});
        let mut state = State::default();
        reconcile(&mut state, normalize(&row, &detail, 1000).unwrap(), 1000);
        assert!(state.changes.is_empty());
        state.seeded = true;
        row["episodeDate"] = json!("2026-10-19T04:30:00Z");
        let normalized = normalize(&row, &detail, 2000).unwrap();
        reconcile(&mut state, normalized.clone(), 2000);
        reconcile(&mut state, normalized, 3000);
        assert_eq!(state.changes.len(), 1);
        assert_eq!(state.changes[0].kind, "rescheduled");
        assert_eq!(
            state.changes[0].previous_airing_at,
            timestamp(&json!("2026-10-18T04:30:00Z"))
        );
        assert_eq!(
            state.tracks[0]["previousAiringAt"],
            state.changes[0].previous_airing_at
        );
        assert!(!state.changes[0].seeded);
        assert!(eligible(
            &state.changes[0],
            &Preferences {
                global: true,
                ..Default::default()
            },
            3001
        ));
    }
    #[test]
    fn imports_reject_unqualified_identities_and_incoherent_track_keys() {
        for id in ["anilist:", "anilist:0", "mal:abc", "other:1", "anilist:1:2"] {
            assert!(!valid_id(id));
        }
        assert!(valid_id("anilist:1"));
        let detail = json!({"websites":{"anilist":"https://anilist.co/anime/1"}});
        let mut track = normalize(
            &json!({"airType":"dub","episodeNumber":1,"status":"Delayed","airingStatus":"delayed-air"}),
            &detail,
            1000,
        )
        .unwrap();
        assert!(valid_track(&track));
        track["scheduleId"] = json!("mal:1:episode-1:dub");
        assert!(!valid_track(&track));
    }
}
