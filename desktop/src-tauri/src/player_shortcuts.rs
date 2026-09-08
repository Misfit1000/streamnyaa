use super::*;
const ACTIONS: [&str; 6] = ["pause", "fullscreen", "mute", "back", "forward", "settings"];
pub fn defaults() -> HashMap<String, String> {
    ACTIONS.into_iter().zip(["SPACE", "f", "m", "j", "l", "s"]).map(|(a,k)| (a.into(),k.into())).collect()
}
pub fn validate(config: &HashMap<String, String>) -> Result<(), String> {
    if config.len() != ACTIONS.len() { return Err("Invalid shortcut actions".into()); }
    let mut used = std::collections::HashSet::new();
    for action in ACTIONS {
        let key = config.get(action).ok_or("Missing shortcut")?;
        let letter = |s: &str| s.len() == 1 && s.as_bytes()[0].is_ascii_lowercase();
        let valid = key == "SPACE" || letter(key) || key.strip_prefix('F').and_then(|s| s.parse::<u8>().ok()).is_some_and(|n| (1..=12).contains(&n))
            || key.strip_prefix("Ctrl+").is_some_and(letter) || key.strip_prefix("Alt+").is_some_and(letter);
        if !valid || ["k","a","c","i","o","p","x","z","n","Ctrl+q","Ctrl+w","Alt+f"].contains(&key.as_str()) {
            return Err("Reserved or invalid shortcut".into());
        }
        if !used.insert(key) { return Err("Shortcut conflict".into()); }
    }
    Ok(())
}
fn path() -> PathBuf { player_preferences_path().with_file_name("player-shortcuts.json") }
pub fn load() -> HashMap<String, String> {
    fs::read(path()).ok().filter(|bytes| bytes.len() <= 2048)
        .and_then(|bytes| serde_json::from_slice::<HashMap<String,String>>(&bytes).ok())
        .filter(|config| validate(config).is_ok()).unwrap_or_else(defaults)
}
#[tauri::command]
pub fn get_player_shortcuts() -> HashMap<String, String> { load() }
#[tauri::command]
pub fn save_player_shortcuts(config: HashMap<String,String>) -> Result<(), String> {
    validate(&config)?;
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().map_err(|_| "Shortcut settings unavailable")?;
    let destination = path();
    fs::create_dir_all(destination.parent().ok_or("Invalid settings directory")?).map_err(|_| "Could not create settings directory")?;
    let temporary = destination.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec(&config).map_err(|_| "Invalid shortcuts")?).map_err(|_| "Could not save shortcuts")?;
    fs::rename(&temporary, &destination).map_err(|_| "Could not publish shortcuts")?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn defaults_swaps_and_conflicts() {
        let mut config = defaults(); assert!(validate(&config).is_ok());
        config.insert("fullscreen".into(), "m".into()); assert!(validate(&config).is_err());
        config.insert("mute".into(), "f".into()); assert!(validate(&config).is_ok());
        config.insert("pause".into(), "f; quit".into()); assert!(validate(&config).is_err());
    }
}
