//! Durable release alerts. This worker stays alive in the tray and never downloads media.
use super::*;
use crate::source_identity::{self, SourceIdentity};
use tauri_plugin_notification::{NotificationExt, PermissionState};

const DAY: u64 = 86_400_000;
const MAX_SUBSCRIPTIONS: usize = 200;
const MAX_EPISODES: usize = 1200;
static STORE: OnceLock<Mutex<State>> = OnceLock::new();
static RUNNING: AtomicBool = AtomicBool::new(false);
static PERMISSION: AtomicBool = AtomicBool::new(false);
static ACTIVE_REQUEST: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub title: String,
    pub source_identity: SourceIdentity,
    pub anilist_id: Option<u32>,
    pub mal_id: Option<u32>,
    pub created_at: u64,
    #[serde(default)]
    pub one_shot_episode: Option<u32>,
    #[serde(default = "default_offset")]
    pub reminder_offset_minutes: u32,
}
fn default_offset() -> u32 {
    10
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub key: String,
    pub anime_id: String,
    pub episode: u32,
    pub airing_at: u64,
    pub previous_airing_at: Option<u64>,
    pub before_notified_at: Option<u64>,
    pub aired_notified_at: Option<u64>,
    pub available_notified_at: Option<u64>,
    pub reminder_offset_minutes: Option<u32>,
    #[serde(default)]
    pub blocked: bool,
    #[serde(default)]
    pub attempts: u32,
    #[serde(default)]
    pub next_check_at: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Availability {
    #[serde(default, flatten)]
    pub details: serde_json::Map<String, serde_json::Value>,
    pub key: String,
    pub anime_id: String,
    pub episode: Option<u32>,
    pub scope: String,
    pub status: String,
    pub checked_at: u64,
    pub expires_at: u64,
    pub complete: bool,
    pub evidence: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub version: u32,
    pub subscriptions: Vec<Subscription>,
    pub episodes: Vec<Episode>,
    pub availability: Vec<Availability>,
    #[serde(default)]
    last_schedule_check_at: u64,
}
impl Default for State {
    fn default() -> Self {
        Self {
            version: 2,
            subscriptions: vec![],
            episodes: vec![],
            availability: vec![],
            last_schedule_check_at: 0,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleItem {
    pub anime_id: String,
    pub episode: u32,
    pub airing_at: u64,
    #[serde(default)]
    pub blocked: bool,
    pub before_notified_at: Option<u64>,
    pub reminder_offset_minutes: Option<u32>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn path() -> PathBuf {
    player_preferences_path().with_file_name("release-reminders-v2.json")
}
fn canonical(id: &str) -> bool {
    id.split_once(':').is_some_and(|(provider, value)| {
        matches!(provider, "anilist" | "mal") && value.parse::<u32>().is_ok_and(|id| id > 0)
    })
}
fn valid_subscription(value: &Subscription) -> bool {
    canonical(&value.id)
        && value.source_identity.anime_id == value.id
        && !value.title.trim().is_empty()
        && value.id.split_once(':').is_some_and(|(provider, id)| {
            id.parse::<u32>().ok()
                == if provider == "anilist" {
                    value.anilist_id
                } else {
                    value.mal_id
                }
        })
        && value.title.len() <= 500
        && !value.source_identity.aliases.is_empty()
        && value.source_identity.aliases.len() <= 20
        && value
            .source_identity
            .aliases
            .iter()
            .all(|alias| !alias.trim().is_empty() && alias.len() <= 500)
        && value.source_identity.installment_aliases.len() <= 20
        && value
            .source_identity
            .installment_aliases
            .iter()
            .all(|alias| !alias.trim().is_empty() && alias.len() <= 500)
        && value.reminder_offset_minutes <= 1440
        && value
            .one_shot_episode
            .is_none_or(|episode| episode > 0 && episode <= 100000)
}
fn valid_availability(value: &Availability) -> bool {
    canonical(&value.anime_id)
        && matches!(value.scope.as_str(), "title" | "episode")
        && matches!(
            value.status.as_str(),
            "available" | "unavailable" | "unknown"
        )
        && value.key
            == format!(
                "{}:{}",
                value.anime_id,
                value
                    .episode
                    .map(|episode| format!("episode-{episode}"))
                    .unwrap_or("title".into())
            )
        && match value.scope.as_str() {
            "episode" => value
                .episode
                .is_some_and(|episode| episode > 0 && episode <= 100000),
            "title" => value.episode.is_none(),
            _ => false,
        }
        && value.expires_at > value.checked_at
        && value.expires_at <= value.checked_at.saturating_add(30 * DAY)
}
fn read_state() -> State {
    for candidate in [path(), path().with_extension("bak")] {
        if fs::metadata(&candidate).is_ok_and(|value| value.len() <= 4_000_000) {
            if let Some(mut value) = fs::read(candidate)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<State>(&bytes).ok())
            {
                if value.version == 2 {
                    value.subscriptions.retain(valid_subscription);
                    value.subscriptions.truncate(MAX_SUBSCRIPTIONS);
                    value.episodes.retain(|episode| {
                        canonical(&episode.anime_id)
                            && episode.episode > 0
                            && episode.episode <= 100000
                            && episode.airing_at > 0
                    });
                    value.episodes.truncate(MAX_EPISODES);
                    value.availability.retain(valid_availability);
                    value.availability.truncate(MAX_EPISODES);
                    return value;
                }
            }
        }
    }
    State::default()
}
fn store() -> &'static Mutex<State> {
    STORE.get_or_init(|| Mutex::new(read_state()))
}
fn persist(state: &State) -> Result<(), String> {
    let p = path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|_| "Could not create reminder storage.")?;
    }
    let bytes = serde_json::to_vec(state).map_err(|_| "Could not encode reminders.")?;
    let temp = p.with_extension("tmp");
    fs::write(&temp, bytes).map_err(|_| "Could not save reminders.")?;
    if let Ok(file) = fs::OpenOptions::new().write(true).open(&temp) {
        file.sync_all()
            .map_err(|_| "Could not flush reminder storage.")?;
    }
    if p.exists() {
        let backup = p.with_extension("bak");
        if backup.exists() {
            fs::remove_file(&backup).map_err(|_| "Could not rotate reminder storage.")?;
        }
        fs::rename(&p, backup).map_err(|_| "Could not preserve reminder storage.")?;
    }
    fs::rename(temp, p).map_err(|_| "Could not replace reminder storage.".into())
}
fn publish(state: &State) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("streamnyaa-reminders-changed", state);
    }
}

#[tauri::command]
pub fn get_desktop_reminder_state() -> State {
    store()
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_desktop_reminder_permission(granted: bool) {
    PERMISSION.store(granted, Ordering::SeqCst);
}

#[tauri::command]
pub fn sync_desktop_reminder_subscriptions(
    subscriptions: Vec<Subscription>,
    episodes: Option<Vec<Episode>>,
) -> Result<State, String> {
    if subscriptions.len() > MAX_SUBSCRIPTIONS
        || subscriptions.iter().any(|value| !valid_subscription(value))
    {
        return Err("Reminder identity could not be verified.".into());
    }
    let mut state = store().lock().map_err(|_| "Reminder storage is busy.")?;
    let mut next = state.clone();
    next.subscriptions = subscriptions;
    if let Some(episodes) = episodes {
        if episodes.len() > MAX_EPISODES {
            return Err("Too many saved reminder episodes.".into());
        }
        for imported in episodes {
            if !canonical(&imported.anime_id)
                || imported.episode == 0
                || imported.episode > 100000
                || imported.key != format!("{}:episode-{}", imported.anime_id, imported.episode)
                || imported.airing_at == 0
            {
                continue;
            }
            if !next
                .subscriptions
                .iter()
                .any(|sub| sub.id == imported.anime_id)
            {
                continue;
            }
            if let Some(prior) = next
                .episodes
                .iter_mut()
                .find(|value| value.key == imported.key)
            {
                prior.before_notified_at =
                    prior.before_notified_at.max(imported.before_notified_at);
                prior.aired_notified_at = prior.aired_notified_at.max(imported.aired_notified_at);
                prior.available_notified_at = prior
                    .available_notified_at
                    .max(imported.available_notified_at);
            } else {
                next.episodes.push(imported);
            }
        }
    }
    // Keep delivered records so re-enabling a bell never replays old notifications.
    next.episodes
        .retain(|episode| episode.airing_at >= now_ms().saturating_sub(30 * DAY));
    persist(&next)?;
    *state = next;
    publish(&state);
    Ok(state.clone())
}

fn reconcile(state: &mut State, item: ScheduleItem) {
    if !canonical(&item.anime_id)
        || item.episode == 0
        || item.episode > 100000
        || item.airing_at == 0
    {
        return;
    }
    if !state.subscriptions.iter().any(|sub| {
        sub.id == item.anime_id
            && sub
                .one_shot_episode
                .is_none_or(|episode| episode == item.episode)
    }) {
        return;
    }
    let key = format!("{}:episode-{}", item.anime_id, item.episode);
    if let Some(prior) = state.episodes.iter_mut().find(|episode| episode.key == key) {
        if prior.airing_at != item.airing_at {
            prior.previous_airing_at = Some(prior.airing_at);
            prior.airing_at = item.airing_at;
            prior.next_check_at = item.airing_at;
        }
        prior.blocked = item.blocked;
        if prior.before_notified_at.is_none() {
            prior.before_notified_at = item.before_notified_at;
        }
        if item.reminder_offset_minutes.is_some() {
            prior.reminder_offset_minutes =
                item.reminder_offset_minutes.map(|value| value.min(1440));
        }
    } else {
        state.episodes.push(Episode {
            key,
            anime_id: item.anime_id,
            episode: item.episode,
            airing_at: item.airing_at,
            previous_airing_at: None,
            before_notified_at: item.before_notified_at,
            aired_notified_at: None,
            available_notified_at: None,
            reminder_offset_minutes: item.reminder_offset_minutes.map(|value| value.min(1440)),
            blocked: item.blocked,
            attempts: 0,
            next_check_at: item.airing_at,
        });
    }
    state
        .episodes
        .sort_by_key(|episode| std::cmp::Reverse(episode.airing_at));
    state.episodes.truncate(MAX_EPISODES);
}

#[tauri::command]
pub fn reconcile_desktop_reminder_schedule(items: Vec<ScheduleItem>) -> Result<(), String> {
    if items.len() > MAX_EPISODES {
        return Err("Too many airing reminders.".into());
    }
    let mut state = store().lock().map_err(|_| "Reminder storage is busy.")?;
    let mut next = state.clone();
    for item in items {
        reconcile(&mut next, item);
    }
    persist(&next)?;
    *state = next;
    publish(&state);
    Ok(())
}

#[tauri::command]
pub fn record_desktop_source_availability(record: Availability) -> Result<(), String> {
    if !valid_availability(&record) || record.checked_at > now_ms() + 60_000 {
        return Err("Invalid source evidence.".into());
    }
    let mut state = store().lock().map_err(|_| "Reminder storage is busy.")?;
    put_availability(&mut state, record.clone());
    persist(&state)?;
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("streamnyaa-source-availability", &record);
    }
    Ok(())
}
fn put_availability(state: &mut State, record: Availability) {
    if let Some(prior) = state
        .availability
        .iter_mut()
        .find(|value| value.key == record.key)
    {
        if record.status == "unknown" && prior.status != "unknown" && prior.expires_at > now_ms() {
            return;
        }
        if record.status == "available" && prior.status == "available" && prior.expires_at > now_ms()
            && prior.details.get("sourceHash").and_then(|value| value.as_str()).is_some_and(|hash| !hash.is_empty())
            && record.details.get("sourceHash").and_then(|value| value.as_str()).is_none_or(|hash| hash.is_empty()) {
            return;
        }
        if record.checked_at >= prior.checked_at {
            *prior = record;
        }
    } else {
        state.availability.push(record);
    }
    state
        .availability
        .sort_by_key(|value| std::cmp::Reverse(value.checked_at));
    state.availability.truncate(MAX_EPISODES);
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Before,
    Aired,
    Available,
}
fn due_kind(episode: &Episode, sub: &Subscription, state: &State, now: u64) -> Option<Kind> {
    if crate::schedule_updates::blocked(&episode.anime_id, episode.episode) { return None; }
    if sub
        .one_shot_episode
        .is_some_and(|value| value != episode.episode)
    {
        return None;
    }
    if episode.blocked || now > episode.airing_at.saturating_add(7 * DAY) {
        return None;
    }
    let offset = episode
        .reminder_offset_minutes
        .unwrap_or(sub.reminder_offset_minutes);
    let before = episode.airing_at.saturating_sub(offset as u64 * 60_000);
    if offset > 0
        && episode.before_notified_at.is_none()
        && now >= before
        && now < episode.airing_at
    {
        return Some(Kind::Before);
    }
    if now < episode.airing_at {
        return None;
    }
    if episode.aired_notified_at.is_none() && now <= episode.airing_at.saturating_add(DAY) {
        return Some(Kind::Aired);
    }
    if episode.available_notified_at.is_none()
        && state.availability.iter().any(|value| {
            value.key == episode.key
                && value.status == "available"
                && value.evidence.as_deref() == Some("exact-source")
                && value.expires_at > now
                && value.checked_at <= now + 60_000
        })
    {
        return Some(Kind::Available);
    }
    None
}
fn mark_delivery(episode: &mut Episode, kind: Kind, shown: bool, now: u64) {
    if !shown {
        return;
    }
    match kind {
        Kind::Before => episode.before_notified_at = Some(now),
        Kind::Aired => episode.aired_notified_at = Some(now),
        Kind::Available => episode.available_notified_at = Some(now),
    }
}
fn notification_id(key: &str, kind: Kind) -> i32 {
    let hash = key.bytes().fold(2166136261u32, |hash, value| {
        hash.wrapping_mul(16777619) ^ value as u32
    });
    ((hash & 0x1fffffff) * 3
        + match kind {
            Kind::Before => 0,
            Kind::Aired => 1,
            Kind::Available => 2,
        }) as i32
}
fn deliver() {
    if !RUNNING.load(Ordering::SeqCst) || !PERMISSION.load(Ordering::SeqCst) {
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
    let now = now_ms();
    let mut delivered = 0;
    for index in 0..state.episodes.len() {
        if delivered >= 3 {
            break;
        }
        let episode = state.episodes[index].clone();
        let Some(sub) = state
            .subscriptions
            .iter()
            .find(|value| value.id == episode.anime_id)
            .cloned()
        else {
            continue;
        };
        let Some(kind) = due_kind(&episode, &sub, &state, now) else {
            continue;
        };
        let (title, body) = match kind {
            Kind::Before => (format!("{} is airing soon", sub.title), format!("Episode {} is scheduled in about {} minutes.", episode.episode, episode.reminder_offset_minutes.unwrap_or(sub.reminder_offset_minutes))),
            Kind::Aired => (format!("{} has aired", sub.title), format!("Episode {} reached its confirmed broadcast time. Watch availability is checked separately.", episode.episode)),
            Kind::Available => (format!("{} is available to watch", sub.title), format!("A matching source for Episode {} was found in StreamNyaa.", episode.episode)),
        };
        let shown = app
            .notification()
            .builder()
            .id(notification_id(&episode.key, kind))
            .title(title)
            .body(body)
            .show()
            .is_ok();
        mark_delivery(&mut state.episodes[index], kind, shown, now);
        if shown {
            delivered += 1;
        }
    }
    if delivered > 0 {
        let _ = persist(&state);
        publish(&state);
    }
}

pub(super) async fn execute(
    job: data_requests::Job,
    suffix: &str,
) -> Result<data_requests::DataResponse, data_requests::DataError> {
    let deadline = if matches!(job, data_requests::Job::Metadata(_)) { 80_000 } else { 30_000 };
    execute_bounded(job, suffix, deadline).await
}
pub(super) async fn execute_bounded(job: data_requests::Job, suffix: &str, deadline: u64) -> Result<data_requests::DataResponse, data_requests::DataError> {
    let id = format!("reminder-{}-{suffix}", now_ms());
    if let Ok(mut active) = ACTIVE_REQUEST.lock() { *active = Some(id.clone()); }
    let result = data_requests::execute(
        job,
        Some(id.clone()),
        Some("background".into()),
        Some(deadline),
    )
    .await;
    if let Ok(mut active) = ACTIVE_REQUEST.lock() {
        if active.as_deref() == Some(&id) {
            *active = None;
        }
    }
    result
}

async fn refresh_schedule() {
    let subscriptions = {
        let Ok(mut state) = store().lock() else {
            return;
        };
        if state.subscriptions.is_empty()
            || now_ms().saturating_sub(state.last_schedule_check_at) < 30 * 60_000
        {
            return;
        }
        state.last_schedule_check_at = now_ms();
        state.subscriptions.clone()
    };
    if subscriptions.is_empty() {
        return;
    }
    let mut failed = false;
    for chunk in subscriptions.chunks(25) {
        if !RUNNING.load(Ordering::SeqCst) {
            return;
        }
        let mut resolved = chunk.to_vec();
        let missing = resolved
            .iter()
            .enumerate()
            .filter(|(_, sub)| sub.anilist_id.is_none() && sub.mal_id.is_some())
            .collect::<Vec<_>>();
        if !missing.is_empty() {
            let selection = missing
                .iter()
                .map(|(index, sub)| {
                    format!(
                        "m{index}:Media(idMal:{},type:ANIME){{id idMal}}",
                        sub.mal_id.unwrap()
                    )
                })
                .collect::<Vec<_>>()
                .join(" ");
            let request = MetadataApiRequest {
                provider: "anilist".into(),
                path: None,
                body: Some(serde_json::json!({"query":format!("query{{{selection}}}")})),
                ttl_seconds: Some(86400),
            };
            match execute(data_requests::Job::Metadata(request), "identity").await {
                Ok(response)
                    if response.complete
                        && !response.cache_status.to_ascii_lowercase().contains("stale") =>
                {
                    for (index, sub) in resolved.iter_mut().enumerate() {
                        let value = &response.data["data"][format!("m{index}")];
                        if sub.anilist_id.is_none()
                            && value["idMal"].as_u64() == sub.mal_id.map(|id| id as u64)
                        {
                            sub.anilist_id =
                                value["id"].as_u64().and_then(|id| u32::try_from(id).ok());
                        }
                    }
                }
                _ => {
                    failed = true;
                    break;
                }
            }
        }
        let from = now_ms().saturating_sub(DAY) / 1000;
        let to = (now_ms() + 7 * DAY) / 1000;
        let selection=resolved.iter().enumerate().filter_map(|(index,sub)|sub.anilist_id.map(|id|format!("a{index}:Page(page:1,perPage:25){{airingSchedules(mediaId:{id},airingAt_greater:{from},airingAt_lesser:{to},sort:TIME){{episode airingAt}}}}"))).collect::<Vec<_>>().join(" ");
        if selection.is_empty() {
            continue;
        }
        let request = MetadataApiRequest {
            provider: "anilist".into(),
            path: None,
            body: Some(serde_json::json!({"query":format!("query{{{selection}}}")})),
            ttl_seconds: Some(900),
        };
        let response = match execute(data_requests::Job::Metadata(request), "schedule").await {
            Ok(response)
                if response.complete
                    && !response.cache_status.to_ascii_lowercase().contains("stale") =>
            {
                response
            }
            _ => {
                failed = true;
                break;
            }
        };
        let Ok(mut state) = store().lock() else {
            return;
        };
        for (index, sub) in resolved.iter().enumerate() {
            if let Some(saved) = state
                .subscriptions
                .iter_mut()
                .find(|value| value.id == sub.id)
            {
                if saved.anilist_id.is_none() {
                    saved.anilist_id = sub.anilist_id;
                }
            }
            if let Some(rows) =
                response.data["data"][format!("a{index}")]["airingSchedules"].as_array()
            {
                for row in rows {
                    if let (Some(episode), Some(time)) =
                        (row["episode"].as_u64(), row["airingAt"].as_u64())
                    {
                        let airing_at = time.saturating_mul(1000);
                        let blocked = state
                            .episodes
                            .iter()
                            .find(|value| {
                                value.anime_id == sub.id && value.episode == episode as u32
                            })
                            .is_some_and(|value| value.blocked && value.airing_at == airing_at);
                        reconcile(
                            &mut state,
                            ScheduleItem {
                                anime_id: sub.id.clone(),
                                episode: episode as u32,
                                airing_at,
                                blocked,
                                before_notified_at: None,
                                reminder_offset_minutes: None,
                            },
                        );
                    }
                }
            }
        }
        let _ = persist(&state);
        publish(&state);
    }
    if failed {
        if let Ok(mut state) = store().lock() {
            state.last_schedule_check_at = now_ms().saturating_sub(25 * 60_000);
            let _ = persist(&state);
        }
    }
}

fn next_source_check(state: &State, now: u64) -> Option<(Episode, Subscription)> {
    state
        .episodes
        .iter()
        .filter(|episode| {
            !episode.blocked
                && !crate::schedule_updates::blocked(&episode.anime_id, episode.episode)
                && episode.available_notified_at.is_none()
                && episode.airing_at <= now
                && now <= episode.airing_at.saturating_add(7 * DAY)
                && episode.next_check_at <= now
        })
        .find_map(|episode| {
            state
                .subscriptions
                .iter()
                .find(|sub| {
                    sub.id == episode.anime_id
                        && sub
                            .one_shot_episode
                            .is_none_or(|value| value == episode.episode)
                })
                .map(|sub| (episode.clone(), sub.clone()))
        })
}
fn backoff(attempt: u32) -> u64 {
    [
        5 * 60_000,
        15 * 60_000,
        30 * 60_000,
        60 * 60_000,
        2 * 60 * 60_000,
    ][(attempt as usize).min(4)]
}

async fn check_one_source() {
    let next = store()
        .lock()
        .ok()
        .and_then(|state| next_source_check(&state, now_ms()));
    let Some((episode, sub)) = next else {
        return;
    };
    let mut available = false;
    let mut retry_at = 0;
    let mut local_wait = false;
    for alias in sub.source_identity.aliases.iter().take(2) {
        if !RUNNING.load(Ordering::SeqCst) {
            return;
        }
        let query = format!("{} {:02}", alias, episode.episode);
        let url = format!("https://www.streamnyaa.xyz/api/nyaa?q={}&c=1_2&f=0&p=1&pages=1&deep=0&scope=episode&episode={}", percent_encode(&query),episode.episode);
        match execute(data_requests::Job::Source(url), "source").await {
            Ok(response) => {
                available |= !response.cache_status.to_ascii_lowercase().contains("stale")
                    && response.data.as_array().is_some_and(|items| {
                        items.iter().any(|item| {
                            let title = item["title"].as_str().unwrap_or_default();
                            let hash = item["infoHash"]
                                .as_str()
                                .or_else(|| item["info_hash"].as_str())
                                .unwrap_or_default();
                            let seeds = item["rawSeeders"]
                                .as_u64()
                                .or_else(|| item["seeders"].as_str().and_then(|v| v.parse().ok()))
                                .unwrap_or(0);
                            normalize_info_hash(hash).is_some()
                                && seeds > 0
                                && source_identity::exact_candidate(
                                    title,
                                    &sub.source_identity,
                                    episode.episode,
                                )
                        })
                    });
            }
            Err(error) => {
                local_wait = error.origin == "local-admission" || error.code == "queued";
                retry_at = error.retry_at.unwrap_or(0).min(u64::MAX as u128) as u64;
                break;
            }
        }
        if available {
            break;
        }
    }
    let now = now_ms();
    let record = Availability {
        details: Default::default(),
        key: episode.key.clone(),
        anime_id: episode.anime_id.clone(),
        episode: Some(episode.episode),
        scope: "episode".into(),
        status: if available { "available" } else { "unknown" }.into(),
        checked_at: now,
        expires_at: now + if available { 20 * 60_000 } else { 5 * 60_000 },
        // A bounded probe proves a positive candidate, never exhaustive absence.
        complete: false,
        evidence: Some(
            if available {
                "exact-source"
            } else {
                "bounded-check-incomplete"
            }
            .into(),
        ),
    };
    if let Ok(mut state) = store().lock() {
        // A disabled subscription or changed schedule cannot publish an obsolete check.
        if !state.subscriptions.iter().any(|value| value.id == sub.id) {
            return;
        }
        if let Some(current) = state.episodes.iter_mut().find(|value| {
            value.key == episode.key && value.airing_at == episode.airing_at && !value.blocked
        }) {
            current.next_check_at = (now
                + if local_wait {
                    60_000
                } else {
                    backoff(current.attempts)
                })
            .max(retry_at);
            if !local_wait {
                current.attempts = current.attempts.saturating_add(1);
            }
        } else {
            return;
        }
        put_availability(&mut state, record.clone());
        let _ = persist(&state);
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("streamnyaa-source-availability", &record);
        }
    }
}

pub fn start() {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = store();
    tauri::async_runtime::spawn(async {
        while RUNNING.load(Ordering::SeqCst) {
            if !get_desktop_playback_busy() { crate::schedule_updates::tick().await; }
            crate::schedule_updates::deliver(PERMISSION.load(Ordering::SeqCst));
            deliver();
            if PERMISSION.load(Ordering::SeqCst) {
                refresh_schedule().await;
                check_one_source().await;
                deliver();
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}
pub(super) fn running() -> bool { RUNNING.load(Ordering::SeqCst) }
pub fn shutdown() {
    RUNNING.store(false, Ordering::SeqCst);
    PERMISSION.store(false, Ordering::SeqCst);
    if let Ok(active) = ACTIVE_REQUEST.lock() {
        if let Some(id) = active.as_ref() {
            data_requests::cancel(id);
        }
    }
    if let Ok(state) = store().lock() {
        let _ = persist(&state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn subscription() -> Subscription {
        Subscription {
            id: "anilist:123".into(),
            title: "Example".into(),
            source_identity: SourceIdentity {
                anime_id: "anilist:123".into(),
                aliases: vec!["Example".into()],
                installment_aliases: vec![],
                format: "TV".into(),
                season_number: None,
                part_number: None,
                sequel: false,
            },
            anilist_id: Some(123),
            mal_id: None,
            created_at: 1,
            one_shot_episode: None,
            reminder_offset_minutes: 10,
        }
    }
    fn state() -> State {
        let mut state = State::default();
        state.subscriptions.push(subscription());
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "anilist:123".into(),
                episode: 2,
                airing_at: 1_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: None,
            },
        );
        state
    }
    #[test]
    fn stable_episode_identity_survives_reschedule() {
        let mut state = state();
        state.episodes[0].aired_notified_at = Some(1);
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "anilist:123".into(),
                episode: 2,
                airing_at: 2_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: None,
            },
        );
        assert_eq!(state.episodes.len(), 1);
        assert_eq!(state.episodes[0].previous_airing_at, Some(1_000_000));
        assert_eq!(state.episodes[0].aired_notified_at, Some(1));
    }
    #[test]
    fn failure_never_marks_delivery() {
        let mut state = state();
        mark_delivery(&mut state.episodes[0], Kind::Aired, false, 1_000_000);
        assert!(state.episodes[0].aired_notified_at.is_none());
        mark_delivery(&mut state.episodes[0], Kind::Aired, true, 1_000_000);
        assert_eq!(state.episodes[0].aired_notified_at, Some(1_000_000));
    }
    #[test]
    fn airing_and_availability_are_separate() {
        let mut state = state();
        let sub = subscription();
        assert_eq!(
            due_kind(&state.episodes[0], &sub, &state, 1_000_000),
            Some(Kind::Aired)
        );
        mark_delivery(&mut state.episodes[0], Kind::Aired, true, 1_000_000);
        assert_eq!(due_kind(&state.episodes[0], &sub, &state, 1_000_001), None);
        put_availability(
            &mut state,
            Availability {
                details: Default::default(),
                key: "anilist:123:episode-2".into(),
                anime_id: "anilist:123".into(),
                episode: Some(2),
                scope: "episode".into(),
                status: "available".into(),
                checked_at: 1_000_000,
                expires_at: 2_000_000,
                complete: true,
                evidence: Some("exact-source".into()),
            },
        );
        assert_eq!(
            due_kind(&state.episodes[0], &sub, &state, 1_000_001),
            Some(Kind::Available)
        );
    }
    #[test]
    fn cancelled_and_stale_episodes_never_notify() {
        let mut state = state();
        state.episodes[0].blocked = true;
        assert_eq!(
            due_kind(&state.episodes[0], &subscription(), &state, 1_000_000),
            None
        );
        state.episodes[0].blocked = false;
        assert_eq!(
            due_kind(
                &state.episodes[0],
                &subscription(),
                &state,
                1_000_000 + 8 * DAY
            ),
            None
        );
    }
    #[test]
    fn raw_ids_cannot_cross_providers() {
        let mut state = state();
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "mal:123".into(),
                episode: 2,
                airing_at: 2_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: None,
            },
        );
        assert_eq!(state.episodes.len(), 1);
    }
    #[test]
    fn restart_keeps_delivery_and_distinct_kinds() {
        let mut state = state();
        state.episodes[0].aired_notified_at = Some(1_000_000);
        let restored: State = serde_json::from_slice(&serde_json::to_vec(&state).unwrap()).unwrap();
        assert_eq!(restored.episodes[0].aired_notified_at, Some(1_000_000));
        assert!(restored.episodes[0].available_notified_at.is_none());
        assert_ne!(
            notification_id("anilist:123:episode-2", Kind::Aired),
            notification_id("anilist:123:episode-2", Kind::Available)
        );
    }
    #[test]
    fn bounded_source_backoff_and_catchup() {
        assert_eq!(backoff(100), 2 * 60 * 60_000);
        let state = state();
        assert_eq!(
            due_kind(
                &state.episodes[0],
                &subscription(),
                &state,
                1_000_000 + DAY + 1
            ),
            None
        );
    }
    #[test]
    fn exact_positive_does_not_require_exhaustive_search() {
        let mut state = state();
        state.episodes[0].aired_notified_at = Some(1_000_000);
        state.availability.push(Availability {
            details: Default::default(),
            key: "anilist:123:episode-2".into(),
            anime_id: "anilist:123".into(),
            episode: Some(2),
            scope: "episode".into(),
            status: "available".into(),
            checked_at: 1_000_000,
            expires_at: 2_000_000,
            complete: false,
            evidence: Some("exact-source".into()),
        });
        assert_eq!(
            due_kind(&state.episodes[0], &subscription(), &state, 1_000_001),
            Some(Kind::Available)
        );
        state.availability[0].evidence = Some("untested".into());
        assert_eq!(
            due_kind(&state.episodes[0], &subscription(), &state, 1_000_001),
            None
        );
    }
    #[test]
    fn malformed_title_scope_cannot_hide_an_episode() {
        let record = Availability {
            details: Default::default(),
            key: "anilist:123:episode-2".into(),
            anime_id: "anilist:123".into(),
            episode: Some(2),
            scope: "title".into(),
            status: "unavailable".into(),
            checked_at: 1_000_000,
            expires_at: 2_000_000,
            complete: true,
            evidence: Some("no-matching-source".into()),
        };
        assert!(!valid_availability(&record));
    }
    #[test]
    fn failed_probe_preserves_valid_source_evidence() {
        let now = now_ms();
        let mut state = state();
        let mut record = Availability {
            details: Default::default(),
            key: "anilist:123:episode-2".into(),
            anime_id: "anilist:123".into(),
            episode: Some(2),
            scope: "episode".into(),
            status: "available".into(),
            checked_at: now,
            expires_at: now + 1_000_000,
            complete: false,
            evidence: Some("exact-source".into()),
        };
        put_availability(&mut state, record.clone());
        record.status = "unknown".into();
        record.checked_at += 1;
        record.evidence = Some("bounded-check-incomplete".into());
        put_availability(&mut state, record);
        assert_eq!(state.availability[0].status, "available");
    }
    #[test]
    fn lightweight_positive_preserves_original_home_proof_and_expiry() {
        let now = now_ms();
        let mut state = state();
        let mut record = Availability {
            details: serde_json::from_value(serde_json::json!({"sourceHash": "a".repeat(40), "playableEpisode": 2})).unwrap(),
            key: "anilist:123:episode-2".into(), anime_id: "anilist:123".into(), episode: Some(2),
            scope: "episode".into(), status: "available".into(), checked_at: now - 1000,
            expires_at: now + 1000, complete: true, evidence: Some("exact-source".into()),
        };
        put_availability(&mut state, record.clone());
        record.details.clear(); record.checked_at = now; record.expires_at = now + 1_200_000;
        put_availability(&mut state, record.clone());
        assert_eq!(state.availability[0].checked_at, now - 1000);
        assert_eq!(state.availability[0].expires_at, now + 1000);
        assert!(state.availability[0].details.contains_key("sourceHash"));
        state.availability[0].expires_at = now - 1;
        put_availability(&mut state, record);
        assert!(!state.availability[0].details.contains_key("sourceHash"));
    }
    #[test]
    fn legacy_episode_offset_survives_future_recurring_records() {
        let mut state = state();
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "anilist:123".into(),
                episode: 2,
                airing_at: 1_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: Some(3),
            },
        );
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "anilist:123".into(),
                episode: 2,
                airing_at: 2_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: None,
            },
        );
        assert_eq!(state.episodes[0].reminder_offset_minutes, Some(3));
        reconcile(
            &mut state,
            ScheduleItem {
                anime_id: "anilist:123".into(),
                episode: 3,
                airing_at: 3_000_000,
                blocked: false,
                before_notified_at: None,
                reminder_offset_minutes: None,
            },
        );
        assert_eq!(state.episodes.len(), 2);
    }
    #[test]
    fn disabling_subscription_stops_future_source_checks() {
        let mut state = state();
        assert!(next_source_check(&state, 1_000_000).is_some());
        state.subscriptions.clear();
        assert!(next_source_check(&state, 1_000_000).is_none());
    }
}
