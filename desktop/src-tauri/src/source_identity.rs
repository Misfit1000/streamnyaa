//! Pure source identity rules shared by interactive discovery and release alerts.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIdentity {
    pub anime_id: String,
    pub aliases: Vec<String>,
    #[serde(default)]
    pub installment_aliases: Vec<String>,
    pub format: String,
    pub season_number: Option<u32>,
    pub part_number: Option<u32>,
    #[serde(default)]
    pub sequel: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Evidence { Exact, Uncertain, Conflict }

fn normalize(value: &str) -> String {
    value.to_lowercase().replace("&#39;", "").replace("&apos;", "")
        .replace("&amp;", " and ").replace('&', " and ").replace(['\'', '’', '‘', '`', '´'], "")
        .chars().map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}
fn number(value: &str) -> Option<u32> { value.parse::<u32>().ok().filter(|n| *n > 0 && *n < 10000) }
fn marker(value: &str, names: &[&str]) -> Option<u32> {
    let normalized = normalize(value);
    let words: Vec<_> = normalized.split_whitespace().collect();
    for (index, word) in words.iter().enumerate() {
        if names.contains(word) { if let Some(n) = words.get(index + 1).and_then(|v| number(v)) { return Some(n); } }
        for name in names { if let Some(rest) = word.strip_prefix(name) { if let Some(n) = number(rest) { return Some(n); } } }
        if names.contains(&"season") {
            if let Some(rest) = word.strip_prefix('s') {
                let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() && (rest.len() == digits.len() || rest[digits.len()..].starts_with('e')) {
                    if let Some(n) = number(&digits) { return Some(n); }
                }
            }
            if words.get(index + 1) == Some(&"season") {
                let digits: String = word.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Some(n) = number(&digits) { return Some(n); }
            }
        }
    }
    None
}
pub fn parse_episode_intent(query: &str) -> Option<u64> {
    let normalized = normalize(query);
    let words: Vec<_> = normalized.split_whitespace().collect();
    for (index, word) in words.iter().enumerate() {
        if let Some(rest) = word.strip_prefix('s') {
            if let Some((season, episode)) = rest.split_once('e') {
                if number(season).is_some() { if let Some(n) = number(episode.split('v').next().unwrap_or("")) { return Some(n as u64); } }
            }
        }
        for prefix in ["episode", "ep", "e"] {
            if *word == prefix { if let Some(n) = words.get(index + 1).and_then(|v| number(v)) { return Some(n as u64); } }
            else if let Some(rest) = word.strip_prefix(prefix) { if let Some(n) = number(rest.split('v').next().unwrap_or("")) { return Some(n as u64); } }
        }
    }
    let lower_query = query.to_lowercase();
    for separator in [" - ", " – "] {
        if let Some((_, suffix)) = lower_query.split_once(separator) {
            if let Some(n) = suffix.split_whitespace().next().and_then(|token| number(token.split('v').next().unwrap_or(""))) { return Some(n as u64); }
        }
    }
    // Episode suffix only: a number in a series name or a season marker is not an episode.
    let last = words.last()?;
    let previous = words.get(words.len().saturating_sub(2)).copied().unwrap_or("");
    if ["season", "part", "cour", "ova", "ona", "special", "movie", "film", "volume", "vol"].contains(&previous) { return None; }
    let n = number(last.split('v').next().unwrap_or(""))?;
    if n >= 1900 || words.len() < 2 { return None; }
    Some(n as u64)
}
pub fn release_episode(title: &str) -> Option<u64> {
    let lower = title.to_ascii_lowercase();
    // Drop bracketed release metadata before looking for bare episode suffixes.
    let mut cleaned = String::new(); let mut bracket = 0;
    for c in lower.chars() { match c { '[' | '(' => bracket += 1, ']' | ')' => bracket = (bracket - 1).max(0), _ if bracket == 0 => cleaned.push(c), _ => {} } }
    parse_episode_intent(&cleaned)
}
pub fn matches_episode(title: &str, episode: u64) -> bool {
    let lower = title.to_ascii_lowercase();
    let mut cleaned = String::new(); let mut bracket = 0;
    for c in lower.chars() { match c { '[' | '(' => bracket += 1, ']' | ')' => bracket = (bracket - 1).max(0), _ if bracket == 0 => cleaned.push(c), _ => {} } }
    let normalized = normalize(&cleaned);
    let words: Vec<_> = normalized.split_whitespace().collect();
    if parse_episode_intent(&cleaned) == Some(episode) { return true; }
    for (i, word) in words.iter().enumerate() {
        if word.starts_with('s') && word.contains('e') && parse_episode_intent(word) == Some(episode) { return true; }
        if ["episode", "ep", "e"].contains(word) && words.get(i + 1).and_then(|v| number(v)).map(u64::from) == Some(episode) { return true; }
    }
    false
}
fn title_part(value: &str) -> String {
    let mut title=value.trim();
    while title.starts_with('[') { if let Some(end)=title.find(']') { title=title[end+1..].trim(); } else { break; } }
    for separator in [" - "," – "] { if let Some((prefix,suffix))=title.split_once(separator) {if suffix.split_whitespace().next().and_then(|word|number(word.split('v').next().unwrap_or(""))).is_some(){title=prefix;break;}} }
    let mut clean=String::new();let mut bracket=false;
    for c in title.chars(){if c=='['{bracket=true;clean.push(' ');}else if c==']'{bracket=false;}else if !bracket{clean.push(c);}}
    for extension in [".mkv",".mp4",".avi",".webm",".m2ts"] { if clean.to_lowercase().ends_with(extension) {clean.truncate(clean.len()-extension.len());} }
    let normalized=normalize(&clean);let words:Vec<_>=normalized.split_whitespace().collect();
    let end=words.iter().enumerate().position(|(index,word)| (word.starts_with('s')&&word.contains('e')&&parse_episode_intent(word).is_some())
        || ["episode","ep","480p","720p","1080p","1440p","2160p","hevc","x264","x265","h264","h265","aac","flac","webrip","webdl","bluray","bdrip","bdremux","repack","jap"].contains(word) || *word=="web" && words.get(index+1).is_none_or(|next| ["dl","dual","1080p","720p","2160p"].contains(next)) || *word=="dual" && words.get(index+1).is_some_and(|next| *next=="audio")).unwrap_or(words.len());
    words[..end].join(" ")
}
fn title_candidates(value:&str) -> Vec<String> {
    let mut segments:Vec<String>=value.split('|').map(str::to_string).collect();
    let mut without=String::new();let mut inside=String::new();let mut parenthesis=false;
    for c in value.chars(){if c=='(' {parenthesis=true;inside.clear();without.push(' ');}else if c==')'&&parenthesis {segments.push(inside.clone());parenthesis=false;}else if parenthesis {inside.push(c);}else{without.push(c);}}
    segments.push(without);segments.iter().map(|s|title_part(s)).collect()
}

fn strip_markers(value: &str) -> String {
    let normalized = normalize(value); let words: Vec<_> = normalized.split_whitespace().collect();
    let mut output = Vec::new(); let mut i = 0;
    while i < words.len() {
        if ["season", "part", "cour"].contains(&words[i]) && words.get(i + 1).and_then(|v| number(v)).is_some() { i += 2; continue; }
        if marker(words[i], &["season", "part", "cour"]).is_some() { i += 1; continue; }
        if words.get(i + 1) == Some(&"season") && words[i].chars().next().is_some_and(|c| c.is_ascii_digit()) { i += 2; continue; }
        output.push(words[i]); i += 1;
    }
    output.join(" ")
}
fn contains_title(title: &str, alias: &str) -> bool { !alias.is_empty() && format!(" {title} ").contains(&format!(" {alias} ")) }
fn canonical_title_core(value: &str) -> String {
    let stripped=strip_markers(value);let words:Vec<_>=stripped.split_whitespace().collect();
    words.iter().enumerate().filter(|(index,word)| {
        if word.parse::<u32>().ok().is_some_and(|number|(1900..=2099).contains(&number)){return false;}
        if ["movie","film"].contains(word)&&words.get(index+1).and_then(|n|number(n)).is_none(){return false;}
        if **word=="the"&&words.get(index+1).is_some_and(|next|["movie","film"].contains(next))&&words.get(index+2).and_then(|n|number(n)).is_none(){return false;}
        true
    }).map(|(_,word)|*word).collect::<Vec<_>>().join(" ")
}

fn has_exact_canonical_title(parsed: &str, aliases: &[String], episode: u32) -> bool {
    let core = canonical_title_core(parsed);
    let words: Vec<_> = core.split_whitespace().collect();
    let suffix_episode = words.last().and_then(|word| number(word.split('v').next().unwrap_or("")).map(u64::from).or_else(|| parse_episode_intent(word)));
    let without_episode = if words.len() > 1 && suffix_episode == Some(episode as u64) { words[..words.len() - 1].join(" ") } else { core.clone() };
    aliases.iter().any(|alias| { let canonical = canonical_title_core(alias); !canonical.is_empty() && (core == canonical || without_episode == canonical) })
}
pub fn classify(title: &str, identity: &SourceIdentity, episode: u32) -> Evidence {
    let candidates=title_candidates(title);
    let parsed=candidates.iter().find(|value|has_exact_canonical_title(value,&identity.aliases,episode)).or_else(||candidates.iter().find(|value|identity.aliases.iter().any(|alias|contains_title(&strip_markers(value),&strip_markers(alias))))).or_else(||candidates.first()).cloned().unwrap_or_default();
    let stripped = canonical_title_core(&parsed);
    if identity.anime_id.is_empty() || !identity.aliases.iter().any(|alias| contains_title(&stripped, &canonical_title_core(alias))) { return Evidence::Conflict; }
    let normalized = normalize(title);
    if normalized.split_whitespace().any(|w| ["trailer", "preview", "creditless", "ncop", "nced", "soundtrack", "ost", "pv"].contains(&w)) { return Evidence::Conflict; }
    let season = marker(title, &["season"]); let part = marker(title, &["part", "cour"]);
    if identity.format=="MOVIE" { if let Some(expected)=identity.aliases.iter().find_map(|alias|marker(alias,&["movie","film"])) {
      if marker(title,&["movie","film"]).is_some_and(|actual|actual!=expected)||part.is_some_and(|actual|actual!=expected){return Evidence::Conflict;}
    } }
    if !identity.sequel && identity.season_number.is_none() && season.is_some_and(|n| n > 1) { return Evidence::Conflict; }
    if identity.season_number.zip(season).is_some_and(|(a,b)| a != b) || identity.part_number.zip(part).is_some_and(|(a,b)| a != b) { return Evidence::Conflict; }
    for kind in ["movie", "film", "ova", "ona", "special"] {
        let format = if kind == "film" { "MOVIE".to_string() } else { kind.to_uppercase() };
        if normalized.split_whitespace().any(|word| word == kind) && identity.format != format { return Evidence::Conflict; }
    }
    if normalized.split_whitespace().any(|word| ["batch", "complete", "collection"].contains(&word))
        || title.split_whitespace().any(|word| word.trim_matches(['[', ']']).split_once('-').is_some_and(|(a,b)| number(a).is_some() && number(b).is_some())) { return Evidence::Uncertain; }
    if identity.format != "MOVIE" && release_episode(title).is_some_and(|actual| actual != episode as u64) { return Evidence::Conflict; }
    if identity.part_number.is_none() && part.is_some_and(|n| n > 1) { return Evidence::Uncertain; }
    if identity.format != "MOVIE" && !matches_episode(title, episode as u64) { return Evidence::Uncertain; }
    if !has_exact_canonical_title(&parsed, &identity.aliases, episode) { return Evidence::Uncertain; }
    let matching_aliases: Vec<_> = identity.installment_aliases.iter().filter(|alias| if identity.format=="MOVIE" {contains_title(&canonical_title_core(&parsed), &canonical_title_core(alias))} else {contains_title(&parsed,&normalize(alias))}).collect();
    let alias = !matching_aliases.is_empty();
    let season_alias = matching_aliases.iter().any(|alias| marker(alias, &["season"]) == identity.season_number
        || marker(alias, &["season"]).is_none() && marker(alias, &["part", "cour"]).is_none());
    let part_alias = matching_aliases.iter().any(|alias| marker(alias, &["part", "cour"]) == identity.part_number
        || marker(alias, &["season"]).is_none() && marker(alias, &["part", "cour"]).is_none());
    let season_proven = identity.season_number.is_none_or(|n| n == 1 || season == Some(n)) || season_alias;
    let part_proven = identity.part_number.is_none_or(|n| n == 1 || part == Some(n)) || part_alias;
    let sequel_proven = !identity.sequel || season.is_some_and(|n| n > 1 && Some(n) == identity.season_number)
        || part.is_some_and(|n| n > 1 && Some(n) == identity.part_number) || alias;
    if season_proven && part_proven && sequel_proven { Evidence::Exact } else { Evidence::Uncertain }
}
pub fn exact_candidate(title: &str, identity: &SourceIdentity, episode: u32) -> bool { classify(title, identity, episode) == Evidence::Exact }

#[cfg(test)]
mod tests {
    use super::*;
    fn sequel(format: &str) -> SourceIdentity { SourceIdentity { anime_id:"mal:2".into(), aliases:vec!["Yasei no Last Boss ga Arawareta! Season 2".into(), "Yasei no Last Boss ga Arawareta!".into()], installment_aliases:vec!["Yasei no Last Boss ga Arawareta! Season 2".into()], format:format.into(), season_number:Some(2), part_number:None, sequel:true } }
    #[test] fn sxe_uses_episode_only() { for (text, episode) in [("Example S02E01",1), ("Example S01E03",3), ("Example S02E105",105), ("Example EP01",1), ("Example - 003v2",3)] { assert_eq!(parse_episode_intent(text),Some(episode)); } }
    #[test] fn title_scope_does_not_infer_season() { assert_eq!(parse_episode_intent("Example Season 2"),None); assert_eq!(parse_episode_intent("86"),None); }
    #[test] fn bare_root_is_not_sequel_evidence() { for kind in ["TV","ONA","OVA","SPECIAL"] { assert_eq!(classify("[Group] Yasei no Last Boss ga Arawareta! - 01 [1080p]",&sequel(kind),1),Evidence::Uncertain); assert!(!exact_candidate("Yasei no Last Boss ga Arawareta! S01E01",&sequel(kind),1)); assert!(exact_candidate("Yasei no Last Boss ga Arawareta! S02E01",&sequel(kind),1)); } }
    #[test] fn part_conflict_is_rejected() { let mut identity=sequel("TV"); identity.part_number=Some(2); assert_eq!(classify("Yasei no Last Boss ga Arawareta! Season 2 Part 1 - 01",&identity,1),Evidence::Conflict); }
    #[test] fn shared_source_identity_vectors() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../tests/fixtures/source-identity.json")).unwrap();
        let default_identity: SourceIdentity = serde_json::from_value(fixture["identity"].clone()).unwrap();
        for case in fixture["cases"].as_array().unwrap() {
            let title = case["title"].as_str().unwrap();
            let identity = if case["identity"].is_object() { serde_json::from_value(case["identity"].clone()).unwrap() } else { default_identity.clone() };
            let actual = serde_json::to_value(classify(title, &identity, case["episode"].as_u64().unwrap() as u32)).unwrap();
            assert_eq!(actual, case["evidence"], "{title}");
        }
    }
    #[test] fn real_movie_release_vectors() {
        let fixture:serde_json::Value=serde_json::from_str(include_str!("../../../tests/fixtures/movie-source-identity.json")).unwrap();
        let identity:SourceIdentity=serde_json::from_value(fixture["identity"].clone()).unwrap();
        for case in fixture["cases"].as_array().unwrap(){
            let title=case["title"].as_str().unwrap();
            assert_eq!(serde_json::to_value(classify(title,&identity,1)).unwrap(),case["evidence"],"{title}");
        }
    }
}
