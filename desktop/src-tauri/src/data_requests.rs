//! Desktop-only, cancellable public-data transport. No authentication traffic enters this queue.
use super::*;
use std::{
    collections::{HashSet, VecDeque},
    sync::{atomic::AtomicU8, Arc},
};
use tokio::sync::watch;

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DataError {
    code: String,
    provider: String,
    message: String,
    retryable: bool,
    status_code: Option<u16>,
    retry_after_ms: Option<u64>,
}
impl DataError {
    fn new(provider: &str, code: &str) -> Self {
        let message = match code {
            "cancelled" => "The request was cancelled.",
            "timeout" => "The connection took too long. StreamNyaa will reconnect.",
            "rate-limited" => {
                "Updates are temporarily delayed. StreamNyaa will retry automatically."
            }
            "invalid" => "The response could not be verified.",
            "access-denied" => "Catalog access was declined. Your internet connection may still be working.",
            _ => "The connection was interrupted. StreamNyaa will reconnect.",
        };
        Self {
            code: code.into(),
            provider: provider.into(),
            message: message.into(),
            retryable: !matches!(code, "cancelled" | "invalid" | "access-denied"),
            status_code: None,
            retry_after_ms: None,
        }
    }
}
#[derive(Clone, Serialize, Debug)]
pub struct DataResponse {
    data: serde_json::Value,
    fetched_at: u128,
    cache_status: &'static str,
    complete: bool,
    provider: String,
    duration_ms: u128,
}
#[derive(Clone)]
pub enum Job {
    Metadata(MetadataApiRequest),
    Source(String),
}
impl Job {
    fn provider(&self) -> &str {
        match self {
            Self::Metadata(r) => &r.provider,
            Self::Source(_) => "nyaa",
        }
    }
    fn key(&self) -> String {
        match self {
            Self::Metadata(r) => metadata_cache_key(r),
            Self::Source(url) => format!("nyaa|{url}"),
        }
    }
}
type Outcome = Result<DataResponse, DataError>;
struct Flight {
    ids: HashSet<String>,
    tx: watch::Sender<Option<Outcome>>,
    abort: tokio::task::AbortHandle,
    priority: Arc<AtomicU8>,
}
#[derive(Default)]
struct Registry {
    flights: HashMap<String, Flight>,
    clients: HashMap<String, (String, watch::Sender<bool>)>,
    cancelled_before_start: HashMap<String, Instant>,
}
fn registry() -> &'static Mutex<Registry> {
    static VALUE: OnceLock<Mutex<Registry>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(Registry::default()))
}
fn detach(id: &str) {
    let Ok(mut state) = registry().lock() else {
        return;
    };
    if let Some((key, cancelled)) = state.clients.remove(id) {
        let _ = cancelled.send(true);
        if let Some(flight) = state.flights.get_mut(&key) {
            flight.ids.remove(id);
            if flight.ids.is_empty() {
                if let Some(flight) = state.flights.remove(&key) {
                    flight.abort.abort();
                }
            }
        }
    }
}
struct Subscriber(String);
impl Drop for Subscriber {
    fn drop(&mut self) {
        detach(&self.0);
    }
}
pub fn cancel(id: &str) {
    if let Ok(mut state) = registry().lock() {
        let now = Instant::now();
        state
            .cancelled_before_start
            .retain(|_, at| now.duration_since(*at) < Duration::from_secs(15));
        if !state.clients.contains_key(id) && state.cancelled_before_start.len() < 128 {
            state.cancelled_before_start.insert(id.to_string(), now);
        }
    }
    detach(id);
}
pub fn promote(id: &str) {
    if let Ok(state) = registry().lock() {
        if let Some((key, _)) = state.clients.get(id) {
            if let Some(flight) = state.flights.get(key) {
                flight.priority.store(0, Ordering::Relaxed);
            }
        }
    }
}

#[derive(Default)]
struct Lane {
    pending: HashMap<u64, Arc<AtomicU8>>,
    starts: VecDeque<Instant>,
    active: usize,
    last: Option<Instant>,
    blocked_until: Option<Instant>,
    denied_until: Option<Instant>,
}
fn lanes() -> &'static Mutex<HashMap<String, Lane>> {
    static VALUE: OnceLock<Mutex<HashMap<String, Lane>>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(HashMap::new()))
}
struct Ticket {
    provider: String,
    id: u64,
    active: bool,
}
impl Drop for Ticket {
    fn drop(&mut self) {
        if let Ok(mut all) = lanes().lock() {
            if let Some(lane) = all.get_mut(&self.provider) {
                lane.pending.remove(&self.id);
                if self.active {
                    lane.active = lane.active.saturating_sub(1);
                }
            }
        }
    }
}
async fn slot(provider: &str, priority: Arc<AtomicU8>) -> Result<Ticket, DataError> {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let mut ticket = Ticket {
        provider: provider.into(),
        id,
        active: false,
    };
    lanes()
        .lock()
        .map_err(|_| DataError::new(provider, "error"))?
        .entry(provider.into())
        .or_default()
        .pending
        .insert(id, priority);
    loop {
        {
            let mut all = lanes()
                .lock()
                .map_err(|_| DataError::new(provider, "error"))?;
            let lane = all.entry(provider.into()).or_default();
            let now = Instant::now();
            if lane.denied_until.is_some_and(|until| until > now) {
                let mut error = DataError::new(provider, "access-denied");
                error.status_code = Some(403);
                return Err(error);
            }
            while lane
                .starts
                .front()
                .is_some_and(|v| now.duration_since(*v) >= Duration::from_secs(60))
            {
                lane.starts.pop_front();
            }
            if let Some(until) = lane.blocked_until.filter(|v| *v > now) {
                let mut error = DataError::new(provider, "rate-limited");
                error.retry_after_ms = Some(until.duration_since(now).as_millis() as u64);
                return Err(error);
            }
            let first = lane
                .pending
                .iter()
                .min_by_key(|(id, p)| (p.load(Ordering::Relaxed), **id))
                .map(|(id, _)| *id);
            let gap = match provider {
                "anilist" => 350,
                "jikan" => 1000,
                "nyaa" => 600,
                _ => 350,
            };
            let minute_limit = if provider == "anilist" { 30 } else { 60 };
            // A locally exhausted budget is not a broken connection. Return the
            // remaining wait so subscribers recover after the window resets.
            if lane.starts.len() >= minute_limit {
                let mut error = DataError::new(provider, "rate-limited");
                error.retry_after_ms = lane.starts.front().map(|first| {
                    Duration::from_secs(60)
                        .saturating_sub(now.duration_since(*first))
                        .as_millis() as u64 + 1
                });
                return Err(error);
            }
            if first == Some(id)
                && lane.active < 2
                && lane.starts.len() < minute_limit
                && lane
                    .last
                    .is_none_or(|last| now.duration_since(last) >= Duration::from_millis(gap))
            {
                lane.pending.remove(&id);
                lane.active += 1;
                lane.last = Some(now);
                lane.starts.push_back(now);
                ticket.active = true;
                return Ok(ticket);
            }
        }
        // No mutex is held while waiting. Dropping this future removes its queue ticket.
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(8))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(4)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("StreamNyaa Desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("public-data HTTP client")
    })
}
fn allowed_url(url: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|u| {
        u.scheme() == "https"
            && u.port_or_known_default() == Some(443)
            && u.username().is_empty()
            && u.password().is_none()
            && u.fragment().is_none()
            && matches!(
                u.host_str(),
                Some(
                    "graphql.anilist.co"
                        | "api.jikan.moe"
                        | "nyaa.si"
                        | "www.streamnyaa.xyz"
                        | "api.themoviedb.org"
                        | "animeschedule.net"
                        | "api.anidb.net"
                )
            )
    })
}
fn retry_delay(headers: &reqwest::header::HeaderMap) -> Duration {
    let retry = headers
        .get("Retry-After")
        .and_then(|v| v.to_str().ok())
        .and_then(|value| {
            value.parse::<u64>().ok().or_else(|| {
                httpdate::parse_http_date(value)
                    .ok()
                    .and_then(|date| date.duration_since(SystemTime::now()).ok())
                    .map(|d| d.as_secs())
            })
        });
    let reset = headers
        .get("X-RateLimit-Reset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .map(|reset| reset.saturating_sub(unix_timestamp()));
    Duration::from_secs(retry.or(reset).unwrap_or(60).clamp(1, 86_400))
}
async fn fetch_bytes(
    provider: &str,
    url: &str,
    body: Option<&serde_json::Value>,
    bearer: Option<&str>,
    priority: Arc<AtomicU8>,
) -> Result<Vec<u8>, DataError> {
    if !allowed_url(url) {
        return Err(DataError::new(provider, "invalid"));
    }
    for attempt in 0..2 {
        let permit = slot(provider, priority.clone()).await?;
        let mut request = if let Some(body) = body {
            client().post(url).json(body)
        } else {
            client().get(url)
        };
        if let Some(token) = bearer {
            request = request.bearer_auth(token);
        }
        let result = request.send().await;
        match result {
            Ok(mut response) => {
                let status = response.status();
                if status.as_u16() == 403 {
                    if let Ok(mut all) = lanes().lock() {
                        all.entry(provider.into()).or_default().denied_until =
                            Some(Instant::now() + Duration::from_secs(300));
                    }
                    let mut error = DataError::new(provider, "access-denied");
                    error.status_code = Some(403);
                    return Err(error);
                }
                if status.as_u16() == 429 {
                    let wait = retry_delay(response.headers()).as_secs();
                    if let Ok(mut all) = lanes().lock() {
                        all.entry(provider.into()).or_default().blocked_until =
                            Some(Instant::now() + Duration::from_secs(wait));
                    }
                    let mut error = DataError::new(provider, "rate-limited");
                    error.status_code = Some(429);
                    error.retry_after_ms = Some(wait * 1000);
                    return Err(error);
                }
                if status.is_success() {
                    if response
                        .headers()
                        .get("X-RateLimit-Remaining")
                        .and_then(|v| v.to_str().ok())
                        == Some("0")
                    {
                        if let Ok(mut all) = lanes().lock() {
                            all.entry(provider.into()).or_default().blocked_until =
                                Some(Instant::now() + retry_delay(response.headers()));
                        }
                    }
                    if response.content_length().unwrap_or(0) > MAX_REMOTE_RESPONSE_BYTES {
                        return Err(DataError::new(provider, "invalid"));
                    }
                    let mut bytes = Vec::new();
                    while let Some(chunk) = response
                        .chunk()
                        .await
                        .map_err(|_| DataError::new(provider, "error"))?
                    {
                        if bytes.len() + chunk.len() > MAX_REMOTE_RESPONSE_BYTES as usize {
                            return Err(DataError::new(provider, "invalid"));
                        }
                        bytes.extend_from_slice(&chunk);
                    }
                    return Ok(bytes);
                }
                if !status.is_server_error() || attempt == 1 {
                    let mut error = DataError::new(
                        provider,
                        if status.is_redirection() {
                            "invalid"
                        } else {
                            "error"
                        },
                    );
                    error.status_code = Some(status.as_u16());
                    error.retryable = status.is_server_error();
                    return Err(error);
                }
            }
            Err(error) => {
                log_info(format!(
                    "Data transport provider={} attempt={} timeout={} connect={} body={} decode={}",
                    provider, attempt + 1, error.is_timeout(), error.is_connect(),
                    error.is_body(), error.is_decode()
                ));
                if attempt == 1 {
                    return Err(DataError::new(
                        provider,
                        if error.is_timeout() {
                            "timeout"
                        } else {
                            "error"
                        },
                    ));
                }
            }
        }
        drop(permit);
        tokio::time::sleep(Duration::from_millis(350 + (now_millis() % 250) as u64)).await;
    }
    Err(DataError::new(provider, "error"))
}
async fn metadata(
    request: &MetadataApiRequest,
    priority: Arc<AtomicU8>,
) -> Result<serde_json::Value, DataError> {
    let provider = request.provider.as_str();
    let path = || {
        safe_metadata_path(request.path.as_deref(), provider)
            .map_err(|_| DataError::new(provider, "invalid"))
    };
    let mut bearer = None;
    let url = match provider {
        "anilist" => "https://graphql.anilist.co".to_string(),
        "jikan" => format!("https://api.jikan.moe/v4{}", path()?),
        "tmdb" => {
            bearer = env_value(&["TMDB_BEARER_TOKEN", "TMDB_READ_ACCESS_TOKEN"]);
            let key = env_value(&["TMDB_API_KEY"]);
            if bearer.is_none() && key.is_none() {
                return Ok(disabled_provider_value(
                    provider,
                    "Artwork enrichment is not configured.",
                ));
            }
            let mut url = reqwest::Url::parse(&format!("https://api.themoviedb.org/3{}", path()?))
                .map_err(|_| DataError::new(provider, "invalid"))?;
            if bearer.is_none() {
                url.query_pairs_mut()
                    .append_pair("api_key", key.as_deref().unwrap_or(""));
            }
            url.to_string()
        }
        "animeschedule" => {
            bearer = env_value(&["ANIMESCHEDULE_TOKEN", "ANIMESCHEDULE_API_TOKEN"]);
            format!("https://animeschedule.net/api/v3{}", path()?)
        }
        "anidb" => {
            let path = path()?;
            let aid = query_param(&format!("https://api.anidb.net{path}"), "aid")
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|v| *v > 0)
                .ok_or_else(|| DataError::new(provider, "invalid"))?;
            let Some(name) = env_value(&["ANIDB_CLIENT"]) else {
                return Ok(disabled_provider_value(
                    provider,
                    "AniDB is not configured.",
                ));
            };
            let Some(version) = env_value(&["ANIDB_CLIENT_VERSION", "ANIDB_CLIENTVER"]) else {
                return Ok(disabled_provider_value(
                    provider,
                    "AniDB is not configured.",
                ));
            };
            let mut url = reqwest::Url::parse("https://api.anidb.net:443/httpapi").unwrap();
            url.query_pairs_mut().extend_pairs([
                ("request", "anime"),
                ("client", &name),
                ("clientver", &version),
                ("protover", "1"),
                ("aid", &aid.to_string()),
            ]);
            let xml = fetch_bytes(provider, url.as_str(), None, None, priority).await?;
            return Ok(
                serde_json::json!({"provider":provider,"aid":aid,"raw_xml":String::from_utf8(xml).map_err(|_| DataError::new(provider,"invalid"))?}),
            );
        }
        _ => return Err(DataError::new(provider, "invalid")),
    };
    if provider == "anilist" && request.body.is_none() {
        return Err(DataError::new(provider, "invalid"));
    }
    let bytes = fetch_bytes(
        provider,
        &url,
        request.body.as_ref(),
        bearer.as_deref(),
        priority,
    )
    .await?;
    let value = serde_json::from_slice(&bytes).map_err(|_| DataError::new(provider, "invalid"))?;
    if !valid_desktop_metadata_payload(provider, &value) {
        return Err(DataError::new(provider, "invalid"));
    }
    Ok(value)
}
async fn sources(
    url: &str,
    priority: Arc<AtomicU8>,
    deadline: Instant,
) -> Result<(serde_json::Value, bool), DataError> {
    let url =
        validated_desktop_source_api_url(url).map_err(|_| DataError::new("nyaa", "invalid"))?;
    let query = query_param(&url, "q").unwrap_or_default();
    let category = query_param(&url, "c").unwrap_or_else(|| "1_2".into());
    let filter = query_param(&url, "f").unwrap_or_else(|| "0".into());
    let page = query_param(&url, "p")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1)
        .max(1);
    let pages = query_param(&url, "pages")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1)
        .clamp(1, 3);
    let variants = if query_param(&url, "deep").as_deref() == Some("1") {
        nyaa_query_variants(&query, parse_episode_from_query(&query))
    } else {
        vec![query]
    };
    let mut categories = vec![category];
    if query_param(&url, "wide").as_deref() == Some("1") {
        categories.extend(["1_2", "1_3", "1_4"].map(String::from));
        categories.sort();
        categories.dedup();
    }
    let mut items = Vec::new();
    let mut failed = None;
    let mut complete = true;
    'queries: for variant in variants {
        for category in &categories {
            for p in page..page + pages {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining < Duration::from_millis(150) {
                    complete = false;
                    break 'queries;
                }
                let rss = nyaa_rss_url(&variant, category, &filter, p);
                let bytes = tokio::time::timeout(
                    remaining.min(Duration::from_secs(4)),
                    fetch_bytes("nyaa", &rss, None, None, priority.clone()),
                )
                .await
                .unwrap_or_else(|_| Err(DataError::new("nyaa", "timeout")));
                match bytes {
                    Ok(bytes) => {
                        let xml = match String::from_utf8(bytes) {
                            Ok(xml) if xml.contains("<rss") && xml.contains("<channel") => xml,
                            _ => {
                                complete = false;
                                failed = Some(DataError::new("nyaa", "invalid"));
                                break 'queries;
                            }
                        };
                        items.extend(parse_nyaa_rss_items(&xml, &variant, category, p, 1));
                    }
                    Err(error) => {
                        complete = false;
                        failed = Some(error);
                        break 'queries;
                    }
                }
            }
        }
    }
    if items.is_empty() {
        if let Some(error) = failed {
            if matches!(
                error.code.as_str(),
                "rate-limited" | "invalid" | "cancelled"
            ) {
                return Err(error);
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining > Duration::from_millis(500) {
                let bytes = tokio::time::timeout(
                    remaining,
                    fetch_bytes("relay", &url, None, None, priority),
                )
                .await
                .map_err(|_| DataError::new("nyaa", "timeout"))??;
                let value: serde_json::Value = serde_json::from_slice(&bytes)
                    .map_err(|_| DataError::new("nyaa", "invalid"))?;
                if !value.is_array() {
                    return Err(DataError::new("nyaa", "invalid"));
                }
                return Ok((value, true));
            }
            return Err(error);
        }
        if !complete {
            return Err(DataError::new("nyaa", "timeout"));
        }
    }
    Ok((
        serde_json::Value::Array(dedupe_source_json(items)),
        complete,
    ))
}
async fn run(job: Job, priority: Arc<AtomicU8>, timeout: Duration) -> Outcome {
    let started = Instant::now();
    let provider = job.provider().to_string();
    let key = match &job {
        Job::Source(url) => url.clone(),
        _ => job.key(),
    };
    let ttl = match &job {
        Job::Metadata(r) => r.ttl_seconds.unwrap_or(900).clamp(30, 86400) as u128 * 1000,
        _ => SOURCE_API_CACHE_TTL_MS,
    };
    let cache = if provider == "nyaa" {
        source_cache()
    } else {
        metadata_cache()
    };
    if let Ok(cache) = cache.lock() {
        if let Some(entry) = cache
            .get(&key)
            .filter(|e| now_millis().saturating_sub(e.fetched_at) < ttl)
        {
            return Ok(DataResponse {
                data: entry.data.clone(),
                fetched_at: entry.fetched_at,
                cache_status: "memory",
                complete: true,
                provider,
                duration_ms: started.elapsed().as_millis(),
            });
        }
    }
    let (data, complete) = match &job {
        Job::Metadata(request) => (metadata(request, priority).await?, true),
        Job::Source(url) => {
            sources(
                url,
                priority,
                started + timeout.saturating_sub(Duration::from_millis(100)),
            )
            .await?
        }
    };
    let fetched_at = now_millis();
    if complete {
        if let Ok(mut cache) = cache.lock() {
            cache.insert(
                key,
                SourceCacheEntry {
                    data: data.clone(),
                    fetched_at,
                },
            );
            trim_memory_cache(
                &mut cache,
                86_400_000,
                if provider == "nyaa" {
                    SOURCE_API_CACHE_MAX_ENTRIES
                } else {
                    METADATA_CACHE_MAX_ENTRIES
                },
            );
        }
    }
    Ok(DataResponse {
        data,
        fetched_at,
        cache_status: "network",
        complete,
        provider,
        duration_ms: started.elapsed().as_millis(),
    })
}
pub async fn execute(
    job: Job,
    request_id: Option<String>,
    priority: Option<String>,
    deadline_ms: Option<u64>,
) -> Outcome {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let id =
        request_id.unwrap_or_else(|| format!("native-{}", NEXT.fetch_add(1, Ordering::Relaxed)));
    if id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(DataError::new(job.provider(), "invalid"));
    }
    let key = job.key();
    let provider = job.provider().to_string();
    if !matches!(
        provider.as_str(),
        "nyaa" | "anilist" | "jikan" | "tmdb" | "animeschedule" | "anidb"
    ) {
        return Err(DataError::new("desktop", "invalid"));
    }
    if key.len() > 65_536 {
        return Err(DataError::new(&provider, "invalid"));
    }
    let max = if provider == "nyaa" { 12_000 } else { 10_000 };
    let duration = Duration::from_millis(deadline_ms.unwrap_or(max).clamp(100, max));
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    let mut result_rx;
    {
        let mut state = registry()
            .lock()
            .map_err(|_| DataError::new(&provider, "error"))?;
        if state.cancelled_before_start.remove(&id).is_some() {
            return Err(DataError::new(&provider, "cancelled"));
        }
        if state.clients.contains_key(&id) || state.clients.len() >= 128 {
            return Err(DataError::new(&provider, "error"));
        }
        if !state.flights.contains_key(&key) {
            let priority = Arc::new(AtomicU8::new(match priority.as_deref() {
                Some("background") => 2,
                Some("prefetch") => 1,
                _ => 0,
            }));
            let worker_priority = priority.clone();
            let (tx, _) = watch::channel(None);
            let worker_tx = tx.clone();
            let worker_provider = provider.clone();
            let task = tokio::spawn(async move {
                let started = Instant::now();
                let result = tokio::time::timeout(duration, run(job, worker_priority, duration))
                    .await
                    .unwrap_or_else(|_| Err(DataError::new(&worker_provider, "timeout")));
                log_info(format!(
                    "Data request provider={} outcome={} duration_ms={} http_status={} retry_after_ms={}",
                    worker_provider,
                    result
                        .as_ref()
                        .map(|r| r.cache_status)
                        .unwrap_or_else(|e| e.code.as_str()),
                    started.elapsed().as_millis(),
                    result.as_ref().err().and_then(|e| e.status_code).unwrap_or(0),
                    result.as_ref().err().and_then(|e| e.retry_after_ms).unwrap_or(0)
                ));
                worker_tx.send_replace(Some(result));
            });
            state.flights.insert(
                key.clone(),
                Flight {
                    ids: HashSet::new(),
                    tx,
                    abort: task.abort_handle(),
                    priority,
                },
            );
        }
        let flight = state.flights.get_mut(&key).unwrap();
        if priority.as_deref().unwrap_or("foreground") == "foreground" {
            flight.priority.store(0, Ordering::Relaxed);
        }
        flight.ids.insert(id.clone());
        result_rx = flight.tx.subscribe();
        state.clients.insert(id.clone(), (key, cancel_tx));
    }
    let _subscriber = Subscriber(id);
    tokio::time::timeout(duration,async {
        loop {
            if let Some(result) = result_rx.borrow().clone() { return result; }
            tokio::select! {
                _ = cancel_rx.changed() => return Err(DataError::new(&provider,"cancelled")),
                result = result_rx.changed() => if result.is_err() { return Err(DataError::new(&provider,"error")); },
            }
        }
    }).await.unwrap_or_else(|_| Err(DataError::new(&provider,"timeout")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn denied_endpoint_is_not_retried_by_other_consumers() {
        let provider = "test-denied";
        lanes().lock().unwrap().entry(provider.into()).or_default().denied_until =
            Some(Instant::now() + Duration::from_secs(300));
        let error = slot(provider, Arc::new(AtomicU8::new(0))).await.err().unwrap();
        assert_eq!(error.code, "access-denied");
        assert_eq!(error.status_code, Some(403));
        assert!(!error.retryable);
        let mut all = lanes().lock().unwrap();
        let lane = all.remove(provider).unwrap();
        assert!(lane.pending.is_empty());
        assert_eq!(lane.active, 0);
        assert!(lane.starts.is_empty());
    }
    #[tokio::test]
    async fn exhausted_local_budget_reports_retry_after_without_waiting() {
        let provider = "test-budget";
        lanes().lock().unwrap().entry(provider.into()).or_default().starts =
            std::iter::repeat(Instant::now()).take(60).collect();
        let result = tokio::time::timeout(
            Duration::from_millis(100),
            slot(provider, Arc::new(AtomicU8::new(0))),
        ).await.expect("budget exhaustion must not wait for the HTTP deadline");
        let error = result.err().expect("budget should be exhausted");
        assert_eq!(error.code, "rate-limited");
        assert!(error.retry_after_ms.unwrap() > 59_000);
        let mut all = lanes().lock().unwrap();
        assert!(all.get(provider).unwrap().pending.is_empty());
        all.remove(provider);
    }
    #[test]
    fn restricts_transport_destinations() {
        assert!(allowed_url("https://api.jikan.moe/v4/anime/1"));
        for url in [
            "http://api.jikan.moe/v4",
            "https://api.jikan.moe.evil.test",
            "https://user@nyaa.si",
            "https://127.0.0.1/",
        ] {
            assert!(!allowed_url(url));
        }
    }
    #[tokio::test]
    async fn cancelled_queue_ticket_is_removed() {
        let priority = Arc::new(AtomicU8::new(2));
        let first = slot("test-cancel", priority.clone()).await.unwrap();
        let request =
            tokio::time::timeout(Duration::from_millis(10), slot("test-cancel", priority)).await;
        assert!(request.is_err());
        assert!(lanes()
            .lock()
            .unwrap()
            .get("test-cancel")
            .unwrap()
            .pending
            .is_empty());
        drop(first);
        assert_eq!(
            lanes().lock().unwrap().get("test-cancel").unwrap().active,
            0
        );
    }
}
