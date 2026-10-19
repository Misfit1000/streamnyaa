//! Durable per-owner history. Browser arrays are bounded read models, never deletion evidence.
use super::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

const SCHEMA: &str = "
 PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS history_meta(owner TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,key));
 CREATE TABLE IF NOT EXISTS history_titles(owner TEXT NOT NULL,identity TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '{}',explicit_status TEXT,last_played INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,identity));
 CREATE TABLE IF NOT EXISTS history_episodes(owner TEXT NOT NULL,identity TEXT NOT NULL,episode TEXT NOT NULL,payload TEXT NOT NULL,first_played INTEGER NOT NULL,last_played INTEGER NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,identity,episode));
 CREATE INDEX IF NOT EXISTS history_recent ON history_episodes(owner,hidden,last_played DESC,identity,episode);
 CREATE INDEX IF NOT EXISTS history_completed ON history_episodes(owner,hidden,json_extract(payload,'$.completed'));
 CREATE INDEX IF NOT EXISTS titles_recent ON history_titles(owner,last_played DESC,identity);
 CREATE TABLE IF NOT EXISTS history_markers(owner TEXT NOT NULL,identity TEXT NOT NULL,episode TEXT NOT NULL,watched INTEGER NOT NULL,epoch INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(owner,identity,episode));
 CREATE TABLE IF NOT EXISTS history_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,identity TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS history_pending ON history_outbox(owner,seq);
 CREATE TABLE IF NOT EXISTS history_tombstones(owner TEXT NOT NULL,identity TEXT NOT NULL,episode TEXT NOT NULL,cleared_at INTEGER NOT NULL,PRIMARY KEY(owner,identity,episode));
 CREATE TABLE IF NOT EXISTS history_aliases(owner TEXT NOT NULL,alias TEXT NOT NULL,identity TEXT NOT NULL,PRIMARY KEY(owner,alias));
 PRAGMA user_version=1;";

fn error(e: impl std::fmt::Display) -> String {
    format!("History could not be saved: {e}")
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn path() -> PathBuf {
    player_preferences_path().with_file_name("history-v1.sqlite3")
}
fn open_at(p: &Path) -> Result<Connection, String> {
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(error)?;
    }
    let c = Connection::open(p).map_err(error)?;
    c.busy_timeout(Duration::from_secs(5)).map_err(error)?;
    c.pragma_update(None, "journal_mode", "WAL")
        .map_err(error)?;
    c.pragma_update(None, "synchronous", "FULL")
        .map_err(error)?;
    let version: i64 = c
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(error)?;
    if version > 1 {
        return Err("History was created by a newer version of StreamNyaa.".into());
    }
    c.execute_batch(SCHEMA).map_err(error)?;
    Ok(c)
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn number(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}
fn parse(s: String) -> Result<Value, String> {
    serde_json::from_str(&s).map_err(error)
}
fn identity(v: &Value) -> Result<String, String> {
    let id = text(v, "identity");
    if id.is_empty()
        || id.len() > 500
        || !["mal:", "anilist:", "legacy:"]
            .iter()
            .any(|prefix| id.starts_with(prefix))
    {
        return Err("History requires an installment identity.".into());
    }
    Ok(id.into())
}
fn epoch(c: &Connection, owner: &str, id: &str, ep: &str) -> Result<u64, String> {
    let id = c
        .query_row(
            "SELECT identity FROM history_aliases WHERE owner=?1 AND alias=?2",
            params![owner, id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?
        .unwrap_or(id.into());
    Ok(c.query_row("SELECT COALESCE(MAX(epoch),0) FROM history_markers WHERE owner=?1 AND identity=?2 AND episode IN (?3,'*')", params![owner,id,ep], |r| r.get(0)).map_err(error)?)
}
pub fn current_epoch(owner: &str, id: &str, ep: &str) -> u64 {
    open_at(&path())
        .and_then(|c| epoch(&c, owner, id, ep))
        .unwrap_or(0)
}
pub fn legacy_identity(id: &str) -> String {
    if ["mal:", "anilist:", "legacy:"]
        .iter()
        .any(|prefix| id.starts_with(prefix))
    {
        id.into()
    } else {
        format!("legacy:{id}")
    }
}
fn enqueue(
    c: &Connection,
    owner: &str,
    id: &str,
    kind: &str,
    mut payload: Value,
) -> Result<(), String> {
    if kind == "progress" || kind == "metadata" || kind == "status" {
        c.execute(
            "DELETE FROM history_outbox WHERE owner=?1 AND identity=?2 AND kind=?3",
            params![owner, id, kind],
        )
        .map_err(error)?;
    }
    payload["identity"] = json!(id);
    payload["kind"] = json!(kind);
    c.execute(
        "INSERT INTO history_outbox(owner,identity,kind,payload) VALUES(?1,?2,?3,?4)",
        params![owner, id, kind, payload.to_string()],
    )
    .map_err(error)?;
    Ok(())
}
fn ensure_title(c: &Connection, owner: &str, id: &str, metadata: &Value) -> Result<(), String> {
    let metadata = if metadata.is_object() {
        metadata.clone()
    } else {
        json!({"title":id,"animeId":id})
    };
    c.execute(
        "INSERT OR IGNORE INTO history_titles(owner,identity,metadata) VALUES(?1,?2,?3)",
        params![owner, id, metadata.to_string()],
    )
    .map_err(error)?;
    Ok(())
}
fn upsert(c: &Connection, owner: &str, mut v: Value, dirty: bool) -> Result<(), String> {
    let raw_id = identity(&v)?;
    let id = c
        .query_row(
            "SELECT identity FROM history_aliases WHERE owner=?1 AND alias=?2",
            params![owner, raw_id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(error)?
        .unwrap_or(raw_id);
    v["identity"] = json!(id);
    let ep = text(&v, "episode").to_string();
    if ep.is_empty()
        || ep.len() > 30
        || text(&v, "title").is_empty()
        || text(&v, "title").len() > 1000
        || v.to_string().len() > 2_000_000
    {
        return Err("Invalid episode history.".into());
    }
    let expected = epoch(c, owner, &id, &ep)?;
    if number(&v, "epoch") != expected {
        return Ok(());
    }
    let at = number(&v, "updatedAt");
    let cleared:u64=c.query_row("SELECT COALESCE(MAX(cleared_at),0) FROM history_tombstones WHERE owner=?1 AND identity=?2 AND episode IN (?3,'*')",params![owner,id,ep],|r|r.get(0)).map_err(error)?;
    if cleared > 0 && at <= cleared {
        return Ok(());
    }
    let played = number(&v, "lastPlayedAt");
    let old=c.query_row("SELECT payload,first_played FROM history_episodes WHERE owner=?1 AND identity=?2 AND episode=?3",params![owner,id,ep],|r|Ok((r.get::<_,String>(0)?,r.get::<_,u64>(1)?))).optional().map_err(error)?;
    let mut first = played;
    if let Some((raw, first_at)) = old {
        let previous = parse(raw)?;
        if number(&previous, "updatedAt") >= at {
            return Ok(());
        }
        first = first_at.min(played);
        if number(&previous, "epoch") == expected {
            let prior = serde_json::from_value::<playback_progress::Coverage>(
                previous["watchedCoverage"].clone(),
            )
            .unwrap_or_default();
            if !v["watchedCoverage"].is_null() {
                let incoming = serde_json::from_value::<playback_progress::Coverage>(
                    v["watchedCoverage"].clone(),
                )
                .map_err(error)?;
                let merged = playback_progress::merge(&prior, &incoming);
                v["watchedCoverage"] = serde_json::to_value(&merged).map_err(error)?;
                v["completed"] = json!(playback_progress::complete(&merged));
                if merged.duration > 0.0 {
                    v["progressPercent"] = json!(
                        merged.intervals.iter().map(|r| r[1] - r[0]).sum::<f64>() / merged.duration
                            * 100.0
                    );
                }
            }
            if v["source"].is_null() {
                v["source"] = previous["source"].clone();
            }
        }
    }
    v["firstPlayedAt"] = json!(first);
    ensure_title(
        c,
        owner,
        &id,
        &json!({"animeId":v["animeId"],"title":v["title"],"poster":v["poster"]}),
    )?;
    let previous_played: u64 = c
        .query_row(
            "SELECT last_played FROM history_titles WHERE owner=?1 AND identity=?2",
            params![owner, id],
            |r| r.get(0),
        )
        .map_err(error)?;
    c.execute("INSERT INTO history_episodes(owner,identity,episode,payload,first_played,last_played,hidden) VALUES(?1,?2,?3,?4,?5,?6,0) ON CONFLICT(owner,identity,episode) DO UPDATE SET payload=excluded.payload,last_played=MAX(last_played,excluded.last_played),hidden=0",params![owner,id,ep,v.to_string(),first,played]).map_err(error)?;
    c.execute(
        "UPDATE history_titles SET last_played=MAX(last_played,?3) WHERE owner=?1 AND identity=?2",
        params![owner, id, played],
    )
    .map_err(error)?;
    if v["completed"].as_bool() == Some(true) {
        let watched = c
            .query_row(
                "SELECT watched FROM history_markers WHERE owner=?1 AND identity=?2 AND episode=?3",
                params![owner, id, ep],
                |r| r.get::<_, bool>(0),
            )
            .optional()
            .map_err(error)?
            .unwrap_or(false);
        if !watched {
            c.execute("INSERT INTO history_markers(owner,identity,episode,watched,epoch,updated_at) VALUES(?1,?2,?3,1,?4,?5) ON CONFLICT(owner,identity,episode) DO UPDATE SET watched=1,updated_at=excluded.updated_at",params![owner,id,ep,expected,at]).map_err(error)?;
            if dirty {
                enqueue(
                    c,
                    owner,
                    &id,
                    "watch",
                    json!({"episode":ep,"watched":true,"epoch":expected,"updatedAt":at,"manual":false}),
                )?;
            }
        }
    }
    if dirty {
        if previous_played == 0 && played > 0 {
            let raw: String = c
                .query_row(
                    "SELECT metadata FROM history_titles WHERE owner=?1 AND identity=?2",
                    params![owner, id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            enqueue(c, owner, &id, "metadata", json!({"metadata":parse(raw)?}))?;
        }
        enqueue(c, owner, &id, "progress", v)?;
    }
    Ok(())
}
fn summary(
    c: &Connection,
    owner: &str,
    id: &str,
    raw: String,
    status: Option<String>,
    played: u64,
    revision: u64,
) -> Result<Value, String> {
    let metadata = parse(raw)?;
    let mut stmt=c.prepare("SELECT episode,watched,epoch,updated_at FROM history_markers WHERE owner=?1 AND identity=?2 ORDER BY episode").map_err(error)?;
    let markers=stmt.query_map(params![owner,id],|r|Ok(json!({"episode":r.get::<_,String>(0)?,"watched":r.get::<_,bool>(1)?,"epoch":r.get::<_,u64>(2)?,"updatedAt":r.get::<_,u64>(3)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
    let watched: std::collections::HashSet<u64> = markers
        .iter()
        .filter(|v| v["watched"].as_bool() == Some(true))
        .filter_map(|v| text(v, "episode").parse().ok())
        .collect();
    let total = number(&metadata, "totalEpisodes");
    let latest = number(&metadata, "latestAired");
    let all = |n: u64| n > 0 && n <= 100_000 && (1..=n).all(|ep| watched.contains(&ep));
    let finished = metadata["finished"].as_bool() == Some(true);
    let computed = if finished && all(total) {
        "Completed"
    } else {
        "Watching"
    };
    let resume=c.query_row("SELECT payload FROM history_episodes WHERE owner=?1 AND identity=?2 AND hidden=0 ORDER BY last_played DESC,episode DESC LIMIT 1",params![owner,id],|r|r.get::<_,String>(0)).optional().map_err(error)?.map(parse).transpose()?;
    Ok(
        json!({"identity":id,"metadata":metadata,"explicitStatus":status,"status":status.as_deref().unwrap_or(computed),"caughtUp":!finished&&all(latest),"markers":markers,"lastPlayedAt":played,"revision":revision,"resume":resume}),
    )
}
fn summaries(c: &Connection, owner: &str, query: &Value) -> Result<Value, String> {
    let offset = number(query, "offset");
    let limit = number(query, "limit").clamp(1, 100);
    let pattern = format!("%{}%", text(query, "search"));
    let status = text(query, "status");
    let predicate="owner=?1 AND lower(json_extract(metadata,'$.title')) LIKE lower(?2) AND (last_played>0 OR explicit_status IS NOT NULL OR EXISTS(SELECT 1 FROM history_markers m WHERE m.owner=history_titles.owner AND m.identity=history_titles.identity AND m.watched=1)) AND (?5='' OR COALESCE(explicit_status,CASE WHEN json_extract(metadata,'$.finished')=1 AND json_extract(metadata,'$.totalEpisodes')>0 AND (SELECT COUNT(*) FROM history_markers m WHERE m.owner=history_titles.owner AND m.identity=history_titles.identity AND m.watched=1 AND m.episode NOT GLOB '*[^0-9]*' AND CAST(m.episode AS INTEGER) BETWEEN 1 AND json_extract(metadata,'$.totalEpisodes'))=json_extract(metadata,'$.totalEpisodes') THEN 'Completed' ELSE 'Watching' END)=?5)";
    let mut stmt=c.prepare(&format!("SELECT identity,metadata,explicit_status,last_played,revision FROM history_titles WHERE {predicate} ORDER BY last_played DESC,identity LIMIT ?3 OFFSET ?4")).map_err(error)?;
    let rows = stmt
        .query_map(params![owner, pattern, limit, offset, status], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, u64>(3)?,
                r.get::<_, u64>(4)?,
            ))
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    let items = rows
        .into_iter()
        .map(|(id, m, s, p, r)| summary(c, owner, &id, m, s, p, r))
        .collect::<Result<Vec<_>, _>>()?;
    let total: u64 = c
        .query_row(
            &format!("SELECT COUNT(*) FROM history_titles WHERE {predicate}"),
            params![owner, pattern, limit, offset, status],
            |r| r.get(0),
        )
        .map_err(error)?;
    Ok(
        json!({"items":items,"total":total,"nextOffset":if offset+limit<total {Some(offset+limit)}else{None}}),
    )
}
fn run(c: &mut Connection, owner: &str, action: &str, q: Value) -> Result<Value, String> {
    match action {
        "stats" => {
            let total: u64 = c
                .query_row(
                    "SELECT COUNT(*) FROM history_episodes WHERE owner=?1 AND hidden=0",
                    [owner],
                    |r| r.get(0),
                )
                .map_err(error)?;
            let completed_episodes:u64=c.query_row("SELECT COUNT(*) FROM history_episodes WHERE owner=?1 AND hidden=0 AND json_extract(payload,'$.completed')=1",[owner],|r|r.get(0)).map_err(error)?;
            let recent:u64=c.query_row("SELECT COUNT(*) FROM history_episodes WHERE owner=?1 AND hidden=0 AND last_played>=?2",params![owner,now().saturating_sub(7*24*60*60*1000)],|r|r.get(0)).map_err(error)?;
            let watching = summaries(c, owner, &json!({"status":"Watching","limit":1}))?;
            let completed = summaries(c, owner, &json!({"status":"Completed","limit":1}))?;
            Ok(
                json!({"total":total,"completed":completed_episodes,"inProgress":total-completed_episodes,"recent":recent,"watchingTitles":watching["total"],"completedTitles":completed["total"]}),
            )
        }
        "page" => {
            let limit = number(&q, "limit").clamp(1, 100);
            let offset = number(&q, "offset");
            if text(&q, "search").is_empty()
                && ["", "all"].contains(&text(&q, "filter"))
                && ["", "recent"].contains(&text(&q, "sort"))
            {
                let total: u64 = c
                    .query_row(
                        "SELECT COUNT(*) FROM history_episodes WHERE owner=?1 AND hidden=0",
                        [owner],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                let mut stmt=c.prepare("SELECT payload FROM history_episodes WHERE owner=?1 AND hidden=0 ORDER BY last_played DESC,identity,episode LIMIT ?2 OFFSET ?3").map_err(error)?;
                let items = stmt
                    .query_map(params![owner, limit, offset], |r| r.get::<_, String>(0))
                    .map_err(error)?
                    .map(|r| parse(r.map_err(error)?))
                    .collect::<Result<Vec<_>, _>>()?;
                return Ok(
                    json!({"items":items,"total":total,"nextOffset":if offset+limit<total{Some(offset+limit)}else{None}}),
                );
            }
            let pattern = format!("%{}%", text(&q, "search"));
            let filter = text(&q, "filter");
            let order = match text(&q, "sort") {
                "title" => "json_extract(payload,'$.title') COLLATE NOCASE,identity,episode",
                "progress" => {
                    "CAST(json_extract(payload,'$.progressPercent') AS REAL) DESC,identity,episode"
                }
                "episode" => "CAST(episode AS INTEGER),identity",
                _ => "last_played DESC,identity,episode",
            };
            let predicate="owner=?1 AND hidden=0 AND (lower(json_extract(payload,'$.title')) LIKE lower(?2) OR lower(json_extract(payload,'$.source.title')) LIKE lower(?2) OR episode LIKE ?2) AND (?3 NOT IN ('completed','in-progress','recent') OR (?3='completed' AND json_extract(payload,'$.completed')=1) OR (?3='in-progress' AND COALESCE(json_extract(payload,'$.completed'),0)=0) OR (?3='recent' AND last_played>=?4))";
            let cutoff = now().saturating_sub(7 * 24 * 60 * 60 * 1000);
            let total: u64 = c
                .query_row(
                    &format!("SELECT COUNT(*) FROM history_episodes WHERE {predicate}"),
                    params![owner, pattern, filter, cutoff],
                    |r| r.get(0),
                )
                .map_err(error)?;
            let mut stmt=c.prepare(&format!("SELECT payload FROM history_episodes WHERE {predicate} ORDER BY {order} LIMIT ?5 OFFSET ?6")).map_err(error)?;
            let items = stmt
                .query_map(
                    params![owner, pattern, filter, cutoff, limit, offset],
                    |r| r.get::<_, String>(0),
                )
                .map_err(error)?
                .map(|r| parse(r.map_err(error)?))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(
                json!({"items":items,"total":total,"nextOffset":if offset+limit<total{Some(offset+limit)}else{None}}),
            )
        }
        "titles" => summaries(c, owner, &q),
        "episode" => {
            let id = identity(&q)?;
            let ep = text(&q, "episode");
            let raw=c.query_row("SELECT payload FROM history_episodes WHERE owner=?1 AND identity=?2 AND episode=?3 AND hidden=0",params![owner,id,ep],|r|r.get::<_,String>(0)).optional().map_err(error)?;
            Ok(json!({"record":raw.map(parse).transpose()?,"epoch":epoch(c,owner,&id,ep)?}))
        }
        "title" => {
            let id = identity(&q)?;
            let row=c.query_row("SELECT metadata,explicit_status,last_played,revision FROM history_titles WHERE owner=?1 AND identity=?2",params![owner,id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,u64>(2)?,r.get::<_,u64>(3)?))).optional().map_err(error)?;
            row.map(|(m, s, p, r)| summary(c, owner, &id, m, s, p, r))
                .transpose()
                .map(|v| v.unwrap_or(Value::Null))
        }
        "upsert" | "import" => {
            let tx = c.transaction().map_err(error)?;
            let records = q["records"].as_array().ok_or("Invalid history import")?;
            if records.len() > 1000 {
                return Err("Import history in batches of at most 1000 episodes.".into());
            }
            let batch = text(&q, "migration");
            let done = !batch.is_empty()
                && tx
                    .query_row(
                        "SELECT 1 FROM history_meta WHERE owner=?1 AND key=?2",
                        params![owner, batch],
                        |_| Ok(()),
                    )
                    .optional()
                    .map_err(error)?
                    .is_some();
            if !done {
                for record in records {
                    upsert(&tx, owner, record.clone(), action == "upsert")?;
                }
                if !batch.is_empty() {
                    tx.execute(
                        "INSERT INTO history_meta(owner,key,value) VALUES(?1,?2,?3)",
                        params![owner, batch, records.len().to_string()],
                    )
                    .map_err(error)?;
                }
            }
            tx.commit().map_err(error)?;
            Ok(json!({"saved":records.len(),"alreadyImported":done}))
        }
        "metadata" | "status" => {
            let id = identity(&q)?;
            let tx = c.transaction().map_err(error)?;
            ensure_title(&tx, owner, &id, &q["metadata"])?;
            if action == "metadata" {
                let old: String = tx
                    .query_row(
                        "SELECT metadata FROM history_titles WHERE owner=?1 AND identity=?2",
                        params![owner, id],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                let mut metadata = parse(old)?;
                let before = metadata.clone();
                for (key, value) in q["metadata"].as_object().ok_or("Invalid title metadata")? {
                    if !value.is_null() && value != "" {
                        metadata[key] = value.clone();
                    }
                }
                if before == metadata {
                    tx.commit().map_err(error)?;
                    return Ok(json!(true));
                }
                tx.execute(
                    "UPDATE history_titles SET metadata=?3 WHERE owner=?1 AND identity=?2",
                    params![owner, id, metadata.to_string()],
                )
                .map_err(error)?;
                let tracked:bool=tx.query_row("SELECT last_played>0 OR explicit_status IS NOT NULL OR EXISTS(SELECT 1 FROM history_markers WHERE owner=?1 AND identity=?2 AND watched=1) FROM history_titles WHERE owner=?1 AND identity=?2",params![owner,id],|r|r.get(0)).map_err(error)?;
                if tracked {
                    enqueue(&tx, owner, &id, "metadata", json!({"metadata":metadata}))?;
                }
            } else {
                let status = text(&q, "status");
                let revision = text(&q, "revision");
                let revision_key = format!("organization:{id}");
                if !revision.is_empty()
                    && tx
                        .query_row(
                            "SELECT value FROM history_meta WHERE owner=?1 AND key=?2",
                            params![owner, revision_key],
                            |r| r.get::<_, String>(0),
                        )
                        .optional()
                        .map_err(error)?
                        .as_deref()
                        == Some(revision)
                {
                    tx.commit().map_err(error)?;
                    return Ok(json!(true));
                }
                if ![
                    "",
                    "Bookmarked",
                    "Watching",
                    "Completed",
                    "On hold",
                    "Dropped",
                ]
                .contains(&status)
                {
                    return Err("Invalid tracking status".into());
                }
                tx.execute(
                    "UPDATE history_titles SET explicit_status=?3 WHERE owner=?1 AND identity=?2",
                    params![
                        owner,
                        id,
                        if status.is_empty() {
                            None
                        } else {
                            Some(status)
                        }
                    ],
                )
                .map_err(error)?;
                enqueue(
                    &tx,
                    owner,
                    &id,
                    "status",
                    json!({"status":status,"updatedAt":now()}),
                )?;
                if !revision.is_empty() {
                    tx.execute("INSERT INTO history_meta(owner,key,value) VALUES(?1,?2,?3) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value",params![owner,revision_key,revision]).map_err(error)?;
                }
            }
            tx.commit().map_err(error)?;
            Ok(json!(true))
        }
        "alias" => {
            let id = identity(&q)?;
            let from = text(&q, "from");
            if from == id
                || !(from.starts_with("legacy:")
                    || q["providerVerified"].as_bool() == Some(true)
                        && (from.starts_with("anilist:") || from.starts_with("mal:")))
            {
                return Ok(json!(false));
            }
            let tx = c.transaction().map_err(error)?;
            let old = tx
                .query_row(
                    "SELECT metadata FROM history_titles WHERE owner=?1 AND identity=?2",
                    params![owner, from],
                    |r| r.get::<_, String>(0),
                )
                .optional()
                .map_err(error)?;
            let Some(raw) = old else {
                return Ok(json!(false));
            };
            let old = parse(raw)?;
            let normalized = |s: &str| {
                s.split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_lowercase()
            };
            let matches = q["remote"].as_bool() == Some(true)
                || q["titles"].as_array().is_some_and(|values| {
                    values
                        .iter()
                        .filter_map(Value::as_str)
                        .any(|s| normalized(s) == normalized(text(&old, "title")))
                });
            if !matches {
                return Ok(json!(false));
            }
            ensure_title(&tx, owner, &id, &old)?;
            tx.execute("INSERT INTO history_aliases(owner,alias,identity) VALUES(?1,?2,?3) ON CONFLICT(owner,alias) DO UPDATE SET identity=excluded.identity",params![owner,from,id]).map_err(error)?;
            let mut stmt=tx.prepare("SELECT payload FROM history_episodes WHERE owner=?1 AND identity=?2 ORDER BY last_played").map_err(error)?;
            let records = stmt
                .query_map(params![owner, from], |r| r.get::<_, String>(0))
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            drop(stmt);
            // Move markers first so reset generations still govern imported progress.
            tx.execute("INSERT INTO history_markers(owner,identity,episode,watched,epoch,updated_at) SELECT owner,?3,episode,watched,epoch,updated_at FROM history_markers WHERE owner=?1 AND identity=?2 ON CONFLICT(owner,identity,episode) DO UPDATE SET watched=excluded.watched,epoch=excluded.epoch,updated_at=excluded.updated_at WHERE excluded.epoch>epoch OR (excluded.epoch=epoch AND excluded.updated_at>updated_at)",params![owner,from,id]).map_err(error)?;
            tx.execute("INSERT INTO history_tombstones(owner,identity,episode,cleared_at) SELECT owner,?3,episode,cleared_at FROM history_tombstones WHERE owner=?1 AND identity=?2 ON CONFLICT(owner,identity,episode) DO UPDATE SET cleared_at=MAX(cleared_at,excluded.cleared_at)",params![owner,from,id]).map_err(error)?;
            for raw in records {
                let mut v = parse(raw)?;
                v["identity"] = json!(id);
                upsert(&tx, owner, v, false)?;
            }
            tx.execute("UPDATE history_titles SET explicit_status=COALESCE(explicit_status,(SELECT explicit_status FROM history_titles WHERE owner=?1 AND identity=?2)),last_played=MAX(last_played,COALESCE((SELECT last_played FROM history_titles WHERE owner=?1 AND identity=?2),0)) WHERE owner=?1 AND identity=?3",params![owner,from,id]).map_err(error)?;
            for table in ["history_episodes", "history_markers", "history_titles"] {
                tx.execute(
                    &format!("DELETE FROM {table} WHERE owner=?1 AND identity=?2"),
                    params![owner, from],
                )
                .map_err(error)?;
            }
            if q["remote"].as_bool() != Some(true) {
                enqueue(
                    &tx,
                    owner,
                    &id,
                    "alias",
                    json!({"from":from,"providerVerified":q["providerVerified"]}),
                )?;
            }
            tx.commit().map_err(error)?;
            Ok(json!(true))
        }
        "watch" | "reset" => {
            let id = identity(&q)?;
            let ep = if action == "reset" {
                "*"
            } else {
                text(&q, "episode")
            };
            if ep.is_empty() || ep.len() > 30 {
                return Err("Invalid tracking episode".into());
            }
            let tx = c.transaction().map_err(error)?;
            ensure_title(&tx, owner, &id, &q["metadata"])?;
            let at = now().max(epoch(&tx, owner, &id, ep)?.saturating_add(1));
            if action == "reset" {
                tx.execute(
                    "DELETE FROM history_markers WHERE owner=?1 AND identity=?2",
                    params![owner, id],
                )
                .map_err(error)?;
                tx.execute(
                    "DELETE FROM history_episodes WHERE owner=?1 AND identity=?2",
                    params![owner, id],
                )
                .map_err(error)?;
            } else {
                tx.execute(
                    "DELETE FROM history_episodes WHERE owner=?1 AND identity=?2 AND episode=?3",
                    params![owner, id, ep],
                )
                .map_err(error)?;
            }
            let watched = q["watched"].as_bool().unwrap_or(false) && action != "reset";
            tx.execute("INSERT INTO history_markers(owner,identity,episode,watched,epoch,updated_at) VALUES(?1,?2,?3,?4,?5,?5) ON CONFLICT(owner,identity,episode) DO UPDATE SET watched=excluded.watched,epoch=excluded.epoch,updated_at=excluded.updated_at",params![owner,id,ep,watched,at]).map_err(error)?;
            if action == "reset" {
                tx.execute("UPDATE history_titles SET explicit_status=NULL,last_played=0 WHERE owner=?1 AND identity=?2",params![owner,id]).map_err(error)?;
            } else {
                enqueue(
                    &tx,
                    owner,
                    &id,
                    "metadata",
                    json!({"metadata":q["metadata"]}),
                )?;
            }
            enqueue(
                &tx,
                owner,
                &id,
                action,
                json!({"episode":ep,"watched":watched,"epoch":at,"updatedAt":at,"manual":true}),
            )?;
            tx.commit().map_err(error)?;
            Ok(json!({"epoch":at}))
        }
        "clear" => {
            let id = text(&q, "identity");
            let ep = text(&q, "episode");
            let completed = q["completedOnly"].as_bool().unwrap_or(false);
            let tx = c.transaction().map_err(error)?;
            let mut stmt=tx.prepare("SELECT DISTINCT identity FROM history_episodes WHERE owner=?1 AND (?2='' OR identity=?2) AND (?3='' OR episode=?3) AND (?4=0 OR json_extract(payload,'$.completed')=1) AND hidden=0").map_err(error)?;
            let ids = stmt
                .query_map(params![owner, id, ep, completed], |r| r.get::<_, String>(0))
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            drop(stmt);
            tx.execute("INSERT INTO history_tombstones(owner,identity,episode,cleared_at) SELECT owner,identity,episode,?5 FROM history_episodes WHERE owner=?1 AND (?2='' OR identity=?2) AND (?3='' OR episode=?3) AND (?4=0 OR json_extract(payload,'$.completed')=1) ON CONFLICT(owner,identity,episode) DO UPDATE SET cleared_at=excluded.cleared_at",params![owner,id,ep,completed,now()]).map_err(error)?;
            tx.execute("DELETE FROM history_episodes WHERE owner=?1 AND (?2='' OR identity=?2) AND (?3='' OR episode=?3) AND (?4=0 OR json_extract(payload,'$.completed')=1)",params![owner,id,ep,completed]).map_err(error)?;
            // Clear is an explicit operation. Compact watched markers are deliberately retained.
            for id in ids {
                enqueue(
                    &tx,
                    owner,
                    &id,
                    "clearResume",
                    json!({"episode":ep,"updatedAt":now()}),
                )?;
            }
            tx.commit().map_err(error)?;
            Ok(json!(true))
        }
        "outbox" => {
            let mut stmt = c
                .prepare(
                    "SELECT seq,payload FROM history_outbox WHERE owner=?1 ORDER BY seq LIMIT 200",
                )
                .map_err(error)?;
            let rows = stmt
                .query_map([owner], |r| {
                    Ok((r.get::<_, u64>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            let mut items = Vec::new();
            let mut bytes = 0;
            for (seq, raw) in rows {
                // Bound IPC and cloud payloads as well as the operation count.
                if !items.is_empty() && bytes + raw.len() > 1_000_000 {
                    break;
                }
                bytes += raw.len();
                let mut v = parse(raw)?;
                v["sequence"] = json!(seq);
                v["operationId"] = json!(format!("{}:{seq}", text(&q, "deviceId")));
                items.push(v);
            }
            Ok(json!(items))
        }
        "ack" => {
            let max = number(&q, "through");
            c.execute(
                "DELETE FROM history_outbox WHERE owner=?1 AND seq<=?2",
                params![owner, max],
            )
            .map_err(error)?;
            Ok(json!(true))
        }
        "cloudApplied" => {
            c.execute("INSERT INTO history_meta(owner,key,value) VALUES(?1,'cloud-migrated','1') ON CONFLICT(owner,key) DO UPDATE SET value='1'",[owner]).map_err(error)?;
            Ok(json!(true))
        }
        "migrationState" => Ok(
            json!({"cloudMigrated":c.query_row("SELECT 1 FROM history_meta WHERE owner=?1 AND key='cloud-migrated'",[owner],|_|Ok(())).optional().map_err(error)?.is_some()}),
        ),
        "cloudApply" => {
            for t in q["tracking"]
                .as_array()
                .ok_or("Incomplete cloud tracking response")?
            {
                if let Some(aliases) = t["aliases"].as_array() {
                    for from in aliases {
                        run(
                            c,
                            owner,
                            "alias",
                            json!({"identity":t["identity"],"from":from,"remote":true,"providerVerified":true}),
                        )?;
                    }
                }
            }
            let tx = c.transaction().map_err(error)?;
            let mut safe_cursor = q["cursor"].as_u64();
            if let Some(through) = q["through"].as_u64() {
                tx.execute(
                    "DELETE FROM history_outbox WHERE owner=?1 AND seq<=?2",
                    params![owner, through],
                )
                .map_err(error)?;
            }
            for t in q["tracking"]
                .as_array()
                .ok_or("Incomplete cloud tracking response")?
            {
                let id = identity(t)?;
                let pending:u64=tx.query_row("SELECT COUNT(*) FROM history_outbox WHERE owner=?1 AND identity=?2 AND kind IN ('watch','reset','status','metadata')",params![owner,id],|r|r.get(0)).map_err(error)?;
                if pending > 0 {
                    if let Some(cursor) = safe_cursor {
                        safe_cursor = Some(cursor.min(number(t, "revision").saturating_sub(1)));
                    }
                    continue;
                }
                ensure_title(&tx, owner, &id, &t["metadata"])?;
                tx.execute("UPDATE history_titles SET metadata=?3,explicit_status=?4,last_played=MAX(last_played,?5),revision=MAX(revision,?6) WHERE owner=?1 AND identity=?2",params![owner,id,t["metadata"].to_string(),t["explicitStatus"].as_str(),number(t,"lastPlayedAt"),number(t,"revision")]).map_err(error)?;
                for m in t["markers"]
                    .as_array()
                    .ok_or("Incomplete watched markers")?
                {
                    let ep = text(m, "episode");
                    let incoming = number(m, "epoch");
                    if incoming < epoch(&tx, owner, &id, ep)? {
                        continue;
                    }
                    let old = epoch(&tx, owner, &id, ep)?;
                    if incoming > old {
                        tx.execute("DELETE FROM history_episodes WHERE owner=?1 AND identity=?2 AND (?3='*' OR episode=?3)",params![owner,id,ep]).map_err(error)?;
                        if ep == "*" {
                            tx.execute("DELETE FROM history_markers WHERE owner=?1 AND identity=?2 AND epoch<?3",params![owner,id,incoming]).map_err(error)?;
                            tx.execute("UPDATE history_titles SET last_played=?3 WHERE owner=?1 AND identity=?2",params![owner,id,number(t,"lastPlayedAt")]).map_err(error)?;
                        }
                    }
                    tx.execute("INSERT INTO history_markers(owner,identity,episode,watched,epoch,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(owner,identity,episode) DO UPDATE SET watched=excluded.watched,epoch=excluded.epoch,updated_at=excluded.updated_at WHERE excluded.epoch>epoch OR (excluded.epoch=epoch AND excluded.updated_at>=updated_at)",params![owner,id,ep,m["watched"].as_bool().unwrap_or(false),incoming,number(m,"updatedAt")]).map_err(error)?;
                }
            }
            for r in q["resumes"]
                .as_array()
                .ok_or("Incomplete cloud resume response")?
            {
                upsert(&tx, owner, r.clone(), false)?;
            }
            if let Some(cursor) = safe_cursor {
                tx.execute("INSERT INTO history_meta(owner,key,value) VALUES(?1,'cloud-cursor',?2) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value",params![owner,cursor.to_string()]).map_err(error)?;
            }
            tx.commit().map_err(error)?;
            Ok(json!({"cursor":safe_cursor}))
        }
        "cursor" => Ok(json!(c
            .query_row(
                "SELECT value FROM history_meta WHERE owner=?1 AND key='cloud-cursor'",
                [owner],
                |r| r.get::<_, String>(0)
            )
            .optional()
            .map_err(error)?
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0))),
        "readModel" => {
            let mut out = Vec::new();
            for request in q["requests"]
                .as_array()
                .ok_or("Invalid history read model")?
                .iter()
                .take(400)
            {
                let action = text(request, "action");
                if !["title", "episode"].contains(&action) {
                    return Err("Invalid read-model operation".into());
                }
                out.push(run(c, owner, action, request.clone())?);
            }
            Ok(json!(out))
        }
        "archiveRaw" => {
            let key = text(&q, "key");
            if !key.starts_with("cloud-legacy:")
                || q["rows"].as_array().is_none_or(|v| v.len() > 500)
            {
                return Err("Invalid recovery archive batch".into());
            }
            c.execute("INSERT INTO history_meta(owner,key,value) VALUES(?1,?2,?3) ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value",params![owner,key,q["rows"].to_string()]).map_err(error)?;
            Ok(json!({"saved":q["rows"].as_array().unwrap().len()}))
        }
        "importTracking" => {
            let tx = c.transaction().map_err(error)?;
            if tx
                .query_row(
                    "SELECT 1 FROM history_meta WHERE owner=?1 AND key='legacy-tracking-v1'",
                    [owner],
                    |_| Ok(()),
                )
                .optional()
                .map_err(error)?
                .is_none()
            {
                for t in q["records"]
                    .as_array()
                    .ok_or("Invalid title tracking import")?
                {
                    let id = identity(t)?;
                    ensure_title(&tx, owner, &id, &t["metadata"])?;
                    tx.execute("UPDATE history_titles SET last_played=MAX(last_played,?3),explicit_status=COALESCE(explicit_status,?4) WHERE owner=?1 AND identity=?2",params![owner,id,number(t,"lastPlayedAt"),t["explicitStatus"].as_str()]).map_err(error)?;
                }
                tx.execute(
                    "INSERT INTO history_meta(owner,key,value) VALUES(?1,'legacy-tracking-v1','1')",
                    [owner],
                )
                .map_err(error)?;
            }
            tx.commit().map_err(error)?;
            Ok(json!(true))
        }
        "bootstrap" => {
            let tx = c.transaction().map_err(error)?;
            if tx
                .query_row(
                    "SELECT 1 FROM history_meta WHERE owner=?1 AND key='v3-bootstrap'",
                    [owner],
                    |_| Ok(()),
                )
                .optional()
                .map_err(error)?
                .is_none()
            {
                let mut stmt=tx.prepare("SELECT identity,metadata,explicit_status FROM history_titles WHERE owner=?1 AND (last_played>0 OR explicit_status IS NOT NULL OR EXISTS(SELECT 1 FROM history_markers m WHERE m.owner=?1 AND m.identity=history_titles.identity AND m.watched=1))").map_err(error)?;
                let rows = stmt
                    .query_map([owner], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, Option<String>>(2)?,
                        ))
                    })
                    .map_err(error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(error)?;
                drop(stmt);
                for (id, metadata, status) in rows {
                    enqueue(
                        &tx,
                        owner,
                        &id,
                        "metadata",
                        json!({"metadata":parse(metadata)?}),
                    )?;
                    if let Some(status) = status {
                        enqueue(
                            &tx,
                            owner,
                            &id,
                            "status",
                            json!({"status":status,"updatedAt":now()}),
                        )?;
                    }
                    let mut stmt=tx.prepare("SELECT episode,watched,epoch,updated_at FROM history_markers WHERE owner=?1 AND identity=?2").map_err(error)?;
                    let markers=stmt.query_map(params![owner,id],|r|Ok(json!({"episode":r.get::<_,String>(0)?,"watched":r.get::<_,bool>(1)?,"epoch":r.get::<_,u64>(2)?,"updatedAt":r.get::<_,u64>(3)?,"manual":true}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                    drop(stmt);
                    for m in markers {
                        enqueue(
                            &tx,
                            owner,
                            &id,
                            if text(&m, "episode") == "*" {
                                "reset"
                            } else {
                                "watch"
                            },
                            m,
                        )?;
                    }
                    if let Some(raw)=tx.query_row("SELECT payload FROM history_episodes WHERE owner=?1 AND identity=?2 AND hidden=0 ORDER BY last_played DESC LIMIT 1",params![owner,id],|r|r.get::<_,String>(0)).optional().map_err(error)?{enqueue(&tx,owner,&id,"progress",parse(raw)?)?;}
                }
                tx.execute(
                    "INSERT INTO history_meta(owner,key,value) VALUES(?1,'v3-bootstrap','1')",
                    [owner],
                )
                .map_err(error)?;
            }
            tx.commit().map_err(error)?;
            Ok(json!(true))
        }
        _ => Err("Unknown history operation".into()),
    }
}

pub fn save_checkpoint(r: &playback_progress::Record) -> Result<(), String> {
    let id = if r.context.identity.is_empty() {
        legacy_identity(&r.context.anime_id)
    } else {
        r.context.identity.clone()
    };
    let mut c = open_at(&path())?;
    run(
        &mut c,
        &r.context.owner,
        "upsert",
        json!({"records":[{"identity":id,"animeId":r.context.anime_id,"title":r.context.title,"poster":r.context.poster,"episode":r.context.episode,"positionSeconds":r.coverage.last_position,"durationSeconds":r.coverage.duration,"watchedCoverage":r.coverage,"completed":r.completed,"updatedAt":r.updated_at,"lastPlayedAt":r.updated_at,"epoch":r.context.tracking_epoch,"progressPercent":if r.coverage.duration>0.0{r.coverage.intervals.iter().map(|v|v[1]-v[0]).sum::<f64>()/r.coverage.duration*100.0}else{0.0}}]}),
    )?;
    Ok(())
}

#[tauri::command]
pub async fn history_store(action: String, request: Value) -> Result<Value, String> {
    let owner = playback_progress::current_owner();
    // Account changes invalidate queued frontend calls before they can cross namespaces.
    if text(&request, "owner") != owner {
        return Err("History account changed; retry in the current account.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = open_at(&path())?;
        run(&mut c, &owner, &action, request)
    })
    .await
    .map_err(error)?
}

fn backup_to(source: &Connection, destination: &Path) -> Result<(), String> {
    let mut target = Connection::open(destination).map_err(error)?;
    let backup = rusqlite::backup::Backup::new(source, &mut target).map_err(error)?;
    backup
        .run_to_completion(128, Duration::from_millis(2), None)
        .map_err(error)
}
fn upload_path(owner: &str, token: &str) -> Result<PathBuf, String> {
    if token.len() != 36 || !token.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid backup upload".into());
    }
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&owner, &mut hasher);
    Ok(path().with_file_name(format!(
        "history-import-{:x}-{token}.tmp",
        std::hash::Hasher::finish(&hasher)
    )))
}
#[tauri::command]
pub async fn history_backup(action: String, request: Value) -> Result<Value, String> {
    let owner = playback_progress::current_owner();
    if text(&request, "owner") != owner {
        return Err("History account changed.".into());
    }
    tauri::async_runtime::spawn_blocking(move||{
        match action.as_str(){
            "export"=>{
                let manifest=&request["manifest"];
                if manifest["app"]!="StreamNyaa Desktop" || manifest["version"]!=2 || manifest.to_string().len()>10_000_000{return Err("Invalid backup manifest".into());}
                let source=open_at(&path())?;
                let directory=std::env::var_os("USERPROFILE").map(PathBuf::from).ok_or("Cannot locate your Downloads folder")?.join("Downloads");
                fs::create_dir_all(&directory).map_err(error)?;
                let target=directory.join(format!("StreamNyaa-backup-{}.streamnyaa",now()));
                backup_to(&source,&target)?;
                let mut backup=open_at(&target)?;let tx=backup.transaction().map_err(error)?;
                for table in ["history_meta","history_titles","history_episodes","history_markers","history_outbox","history_tombstones","history_aliases"]{tx.execute(&format!("DELETE FROM {table} WHERE owner<>?1"),[&owner]).map_err(error)?;}
                tx.execute_batch("CREATE TABLE backup_manifest(payload TEXT NOT NULL);").map_err(error)?;
                tx.execute("INSERT INTO backup_manifest(payload) VALUES(?1)",[json!({"app":"StreamNyaa Desktop","version":3,"owner":owner,"settings":manifest}).to_string()]).map_err(error)?;
                tx.commit().map_err(error)?;
                backup.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(error)?;
                Ok(json!({"path":target.to_string_lossy(),"bytes":fs::metadata(&target).map_err(error)?.len(),"version":3}))
            },
            "upload"=>{
                let target=upload_path(&owner,text(&request,"token"))?;
                let offset=number(&request,"offset");
                let bytes=request["bytes"].as_array().ok_or("Invalid backup chunk")?;
                if bytes.len()>131072{return Err("Backup chunk is too large".into());}
                let bytes=bytes.iter().map(|v|v.as_u64().filter(|v|*v<=255).map(|v|v as u8).ok_or("Invalid backup byte")).collect::<Result<Vec<_>,_>>()?;
                let mut file=fs::OpenOptions::new().create(true).write(true).truncate(offset==0).open(&target).map_err(error)?;
                if file.metadata().map_err(error)?.len()!=offset{return Err("Backup upload was interrupted; start again".into());}
                use std::io::Seek;file.seek(std::io::SeekFrom::Start(offset)).map_err(error)?;file.write_all(&bytes).map_err(error)?;
                if request["final"].as_bool()==Some(true){file.sync_all().map_err(error)?;}
                Ok(json!({"received":offset+bytes.len() as u64}))
            },
            "inspect"|"restore"=>{
                let target=upload_path(&owner,text(&request,"token"))?;
                let backup=Connection::open_with_flags(&target,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(error)?;
                backup.pragma_update(None,"trusted_schema","OFF").map_err(error)?;
                let check:String=backup.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(error)?;
                if check!="ok"{return Err("The backup database is damaged".into());}
                let raw:String=backup.query_row("SELECT payload FROM backup_manifest LIMIT 1",[],|r|r.get(0)).map_err(error)?;
                let manifest=parse(raw)?;
                if manifest["version"]!=3 || manifest["app"]!="StreamNyaa Desktop" || text(&manifest,"owner")!=owner{return Err("Sign in to the account that owns this backup before importing it.".into());}
                if action=="inspect"{return Ok(manifest);}
                let mut destination=open_at(&path())?;
                // Keep one native recovery snapshot before an explicit import.
                backup_to(&destination,&path().with_file_name("history-before-import.sqlite3"))?;
                destination.execute("ATTACH DATABASE ?1 AS incoming",[target.to_string_lossy().as_ref()]).map_err(error)?;
                let tx=destination.transaction().map_err(error)?;
                let invalid:u64=tx.query_row("SELECT COUNT(*) FROM incoming.history_episodes WHERE owner<>?1 OR NOT json_valid(payload) OR length(payload)>2000000 OR identity NOT GLOB '*:*' OR length(identity)>500 OR length(episode)>30",[&owner],|r|r.get(0)).map_err(error)?;
                if invalid>0{return Err("The backup contains invalid history records".into());}
                for table in ["history_meta","history_titles","history_episodes","history_markers","history_tombstones","history_aliases"]{
                    tx.execute(&format!("DELETE FROM {table} WHERE owner=?1"),[&owner]).map_err(error)?;
                    tx.execute(&format!("INSERT INTO {table} SELECT * FROM incoming.{table} WHERE owner=?1"),[&owner]).map_err(error)?;
                }
                tx.execute("DELETE FROM history_outbox WHERE owner=?1",[&owner]).map_err(error)?;
                tx.execute("DELETE FROM history_meta WHERE owner=?1 AND key IN ('v3-bootstrap','cloud-cursor')",[&owner]).map_err(error)?;
                tx.commit().map_err(error)?;
                destination.execute_batch("DETACH DATABASE incoming").map_err(error)?;
                drop(backup);let _=fs::remove_file(target);
                Ok(json!(true))
            },
            "cancel"=>{let _=fs::remove_file(upload_path(&owner,text(&request,"token"))?);Ok(json!(true))},
            _=>Err("Unknown backup action".into())
        }
    }).await.map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA).unwrap();
        c
    }
    fn record(i: u64, ep: u64) -> Value {
        json!({"identity":format!("mal:{i}"),"animeId":i.to_string(),"title":format!("Anime {i}"),"episode":ep.to_string(),"positionSeconds":10,"updatedAt":i+1,"lastPlayedAt":i+1,"epoch":0})
    }
    #[test]
    fn archive_is_unbounded_and_paged() {
        let mut c = db();
        for batch in 0..6 {
            let records = (batch * 1000..(batch + 1) * 1000)
                .map(|i| record(i, 1))
                .collect::<Vec<_>>();
            run(
                &mut c,
                "a",
                "import",
                json!({"records":records,"migration":format!("batch-{batch}")}),
            )
            .unwrap();
        }
        let page = run(&mut c, "a", "page", json!({"limit":50})).unwrap();
        assert_eq!(page["total"], 6000);
        assert_eq!(page["items"].as_array().unwrap().len(), 50);
        assert_eq!(
            run(&mut c, "b", "page", json!({"limit":50})).unwrap()["total"],
            0
        );
    }
    #[test]
    fn remote_reset_removes_resume_recency_and_rejects_old_samples() {
        let mut c = db();
        run(&mut c, "a", "import", json!({"records":[record(1,1)]})).unwrap();
        run(&mut c,"a","cloudApply",json!({"tracking":[{"identity":"mal:1","metadata":{"title":"Anime 1"},"lastPlayedAt":0,"revision":4,"markers":[{"episode":"*","watched":false,"epoch":100,"updatedAt":100}]}],"resumes":[],"cursor":4})).unwrap();
        let t = run(&mut c, "a", "title", json!({"identity":"mal:1"})).unwrap();
        assert_eq!(t["lastPlayedAt"], 0);
        assert!(t["resume"].is_null());
        let mut stale = record(1, 1);
        stale["updatedAt"] = json!(200);
        run(&mut c, "a", "import", json!({"records":[stale]})).unwrap();
        assert_eq!(
            run(&mut c, "a", "page", json!({"limit":50})).unwrap()["total"],
            0
        );
    }
    #[test]
    fn sync_batches_are_bounded_by_bytes_without_dropping_operations() {
        let mut c = db();
        for i in 1..=4 {
            enqueue(
                &c,
                "a",
                &format!("mal:{i}"),
                "metadata",
                json!({"metadata":{"title":"x".repeat(400_000)}}),
            )
            .unwrap();
        }
        let batch = run(&mut c, "a", "outbox", json!({"deviceId":"device-one"})).unwrap();
        assert_eq!(batch.as_array().unwrap().len(), 2);
        run(&mut c, "a", "ack", json!({"through":batch[1]["sequence"]})).unwrap();
        assert_eq!(
            run(&mut c, "a", "outbox", json!({"deviceId":"device-one"}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn deletion_does_not_erase_markers_and_reset_rejects_old_samples() {
        let mut c = db();
        let mut v = record(1, 1);
        v["completed"] = json!(true);
        run(&mut c, "a", "upsert", json!({"records":[v.clone()]})).unwrap();
        run(&mut c, "a", "clear", json!({})).unwrap();
        let t = run(&mut c, "a", "title", json!({"identity":"mal:1"})).unwrap();
        assert_eq!(t["markers"][0]["watched"], true);
        run(
            &mut c,
            "a",
            "watch",
            json!({"identity":"mal:1","episode":"1","watched":false}),
        )
        .unwrap();
        v["updatedAt"] = json!(now() + 100);
        run(&mut c, "a", "upsert", json!({"records":[v]})).unwrap();
        assert_eq!(
            run(&mut c, "a", "page", json!({"limit":50})).unwrap()["total"],
            0
        );
    }
    #[test]
    fn title_completion_requires_finished_and_no_holes() {
        let mut c = db();
        for ep in 1..=2 {
            let mut v = record(1, ep);
            v["completed"] = json!(true);
            upsert(&c, "a", v, false).unwrap();
        }
        run(&mut c,"a","metadata",json!({"identity":"mal:1","metadata":{"title":"Anime","totalEpisodes":2,"latestAired":2,"finished":false}})).unwrap();
        let t = run(&mut c, "a", "title", json!({"identity":"mal:1"})).unwrap();
        assert_eq!(t["status"], "Watching");
        assert_eq!(t["caughtUp"], true);
        run(
            &mut c,
            "a",
            "metadata",
            json!({"identity":"mal:1","metadata":{"finished":true}}),
        )
        .unwrap();
        assert_eq!(
            run(&mut c, "a", "title", json!({"identity":"mal:1"})).unwrap()["status"],
            "Completed"
        );
    }
    #[test]
    fn failed_batch_is_atomic_and_restartable() {
        let mut c = db();
        let result = run(
            &mut c,
            "a",
            "import",
            json!({"records":[record(1,1),{"identity":"bad"}],"migration":"one"}),
        );
        assert!(result.is_err());
        assert_eq!(
            run(&mut c, "a", "page", json!({"limit":50})).unwrap()["total"],
            0
        );
        run(
            &mut c,
            "a",
            "import",
            json!({"records":[record(1,1)],"migration":"one"}),
        )
        .unwrap();
        assert_eq!(
            run(
                &mut c,
                "a",
                "import",
                json!({"records":[record(1,1)],"migration":"one"})
            )
            .unwrap()["alreadyImported"],
            true
        );
    }
    #[test]
    fn disk_roundtrip_and_consistent_backup() {
        let root = std::env::temp_dir().join(format!(
            "streamnyaa-history-test-{}-{}",
            std::process::id(),
            now()
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("history.sqlite3");
        let backup = root.join("backup.sqlite3");
        {
            let mut c = open_at(&file).unwrap();
            run(&mut c, "owner", "upsert", json!({"records":[record(1,1)]})).unwrap();
            backup_to(&c, &backup).unwrap();
        }
        {
            let mut c = open_at(&file).unwrap();
            assert_eq!(
                run(&mut c, "owner", "page", json!({"limit":50})).unwrap()["total"],
                1
            );
        }
        {
            let mut c = open_at(&backup).unwrap();
            assert_eq!(
                run(&mut c, "owner", "page", json!({"limit":50})).unwrap()["total"],
                1
            );
            assert_eq!(
                run(&mut c, "other", "page", json!({"limit":50})).unwrap()["total"],
                0
            );
        }
        for entry in fs::read_dir(&root).unwrap() {
            fs::remove_file(entry.unwrap().path()).unwrap();
        }
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn aliases_require_exact_title_evidence_and_preserve_markers() {
        let mut c = db();
        let mut v = record(7, 1);
        v["identity"] = json!("legacy:7");
        v["completed"] = json!(true);
        upsert(&c, "a", v, false).unwrap();
        assert_eq!(
            run(
                &mut c,
                "a",
                "alias",
                json!({"identity":"mal:7","from":"legacy:7","titles":["Anime 7 Season 2"]})
            )
            .unwrap(),
            false
        );
        assert_eq!(
            run(
                &mut c,
                "a",
                "alias",
                json!({"identity":"mal:7","from":"legacy:7","titles":["Anime 7"]})
            )
            .unwrap(),
            true
        );
        assert_eq!(
            run(&mut c, "a", "title", json!({"identity":"mal:7"})).unwrap()["markers"][0]
                ["watched"],
            true
        );
        assert_eq!(
            run(&mut c, "a", "page", json!({"limit":50})).unwrap()["total"],
            1
        );
    }
    #[test]
    fn unavailable_storage_never_acknowledges_an_import() {
        let mut c = db();
        c.pragma_update(None, "query_only", true).unwrap();
        assert!(run(
            &mut c,
            "a",
            "import",
            json!({"records":[record(1,1)],"migration":"readonly"})
        )
        .is_err());
        c.pragma_update(None, "query_only", false).unwrap();
        assert_eq!(
            run(
                &mut c,
                "a",
                "import",
                json!({"records":[record(1,1)],"migration":"readonly"})
            )
            .unwrap()["alreadyImported"],
            false
        );
    }
    #[test]
    fn metadata_does_not_make_a_title_recent() {
        let mut c = db();
        run(
            &mut c,
            "a",
            "metadata",
            json!({"identity":"mal:1","metadata":{"title":"Only browsed"}}),
        )
        .unwrap();
        assert_eq!(
            run(&mut c, "a", "outbox", json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            run(&mut c, "a", "titles", json!({"limit":50})).unwrap()["total"],
            0
        );
    }
    #[test]
    #[ignore = "Explicit local performance measurement, no provider traffic"]
    fn large_archive_measurement() {
        let root = std::env::temp_dir().join(format!("streamnyaa-history-benchmark-{}", now()));
        fs::create_dir_all(&root).unwrap();
        let p = root.join("archive.sqlite3");
        let mut c = open_at(&p).unwrap();
        let start = Instant::now();
        for batch in 0..200 {
            let records = (0..500)
                .map(|i| {
                    let index = batch * 500 + i;
                    let mut v = record(index / 100 + 1, index % 100 + 1);
                    v["updatedAt"] = json!(index + 1);
                    v["lastPlayedAt"] = json!(index + 1);
                    v
                })
                .collect::<Vec<_>>();
            run(&mut c, "benchmark", "import", json!({"records":records})).unwrap();
        }
        let write_ms = start.elapsed().as_millis();
        let mut samples = Vec::new();
        for offset in (0..100000).step_by(1000) {
            let start = Instant::now();
            let page = run(
                &mut c,
                "benchmark",
                "page",
                json!({"limit":50,"offset":offset}),
            )
            .unwrap();
            assert_eq!(page["total"], 100000);
            assert_eq!(page["items"].as_array().unwrap().len(), 50);
            samples.push(start.elapsed().as_micros());
        }
        samples.sort();
        c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();
        eprintln!("HISTORY_BENCHMARK records=100000 titles=1000 write_ms={write_ms} page_p50_us={} page_p95_us={} database_bytes={} read_model_rows=50",samples[50],samples[95],fs::metadata(&p).unwrap().len());
        drop(c);
        for entry in fs::read_dir(&root).unwrap() {
            fs::remove_file(entry.unwrap().path()).unwrap();
        }
        fs::remove_dir(root).unwrap();
    }
}
