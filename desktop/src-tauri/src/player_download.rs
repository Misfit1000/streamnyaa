//! Explicit, selected-video export. Never changes torrent ownership or cache policy.
use std::{fs, io::Write, path::Path, time::{Duration, Instant}};

pub fn save(url: &str, destination: &Path, active: impl Fn() -> bool, progress: impl Fn(u64, u64)) -> Result<(), String> {
    let url = reqwest::Url::parse(url).map_err(|_| "Invalid video address.")?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port() != Some(3030)
        || !url.path().starts_with("/torrents/") || !url.username().is_empty() || url.password().is_some() {
        return Err("Only the active local video can be downloaded.".into());
    }
    transfer(url, destination, active, progress)
}

fn transfer(url: reqwest::Url, destination: &Path, active: impl Fn() -> bool, progress: impl Fn(u64, u64)) -> Result<(), String> {
    if destination.exists() { return Err("Choose a new filename; existing files are never replaced.".into()); }
    let client = reqwest::Client::builder().no_proxy()
        .redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(3))
        .read_timeout(Duration::from_secs(20)).build().map_err(|_| "Could not start download.")?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()
        .map_err(|_| "Could not start download worker.")?;
    // Reserve a sibling temporary file exclusively; a failed/cancelled export never appears complete.
    let partial = destination.with_extension(format!("{}.streamnyaa-part", std::process::id()));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&partial)
        .map_err(|_| "Could not create download. Check the folder and available space.")?;
    let result = runtime.block_on(async {
        let mut offset = 0u64;
        if !active() { return Err("Download cancelled.".into()); }
        let mut response = client.get(url).header("Accept-Encoding", "identity").send().await
            .map_err(|_| "Could not read the video. Retry when playback is ready.")?;
        if response.status().as_u16() != 200 { return Err("Local video is not ready to download. Try again after playback starts.".into()); }
        let size = response.content_length().filter(|size| *size > 0).ok_or("Video size is not available yet.")?;
        let started = Instant::now();
        let mut storage_checked_at: Option<Instant> = None;
        progress(0, size);
        loop {
            if !active() { return Err("Download cancelled.".into()); }
            if started.elapsed() > Duration::from_secs(7200) { return Err("Download timed out. Retry to reuse cached data.".into()); }
            if storage_checked_at.is_none_or(|checked| checked.elapsed() >= Duration::from_secs(5)) {
                storage_checked_at = Some(Instant::now());
                if let Some(free) = destination.parent().and_then(super::available_disk_bytes) {
                    if free < size.saturating_sub(offset).saturating_add(256 * 1024 * 1024) {
                        return Err("Not enough storage for this episode. Choose a location with more free space.".into());
                    }
                }
            }
            let mut pending = Box::pin(response.chunk());
            let chunk = loop {
                tokio::select! {
                    result = &mut pending => break result.map_err(|_| "Download stalled. Retry to reuse cached data.")?,
                    _ = tokio::time::sleep(Duration::from_millis(250)) => {
                        if !active() { return Err("Download cancelled.".into()); }
                    }
                }
            };
            let Some(bytes) = chunk else { break; };
            if bytes.len() as u64 > size.saturating_sub(offset) { return Err("Video length changed during download.".into()); }
            file.write_all(&bytes).map_err(|_| "Could not save video. Check free disk space.")?;
            offset += bytes.len() as u64;
            progress(offset, size);
        }
        if offset != size { return Err("Download was incomplete. Retry to reuse cached data.".into()); }
        file.sync_all().map_err(|_| "Could not finish saving video.")?;
        if !active() { return Err("Download cancelled.".into()); }
        // Atomic publication that refuses to overwrite a file created while downloading.
        fs::hard_link(&partial, destination).map_err(|_| "Could not publish download. Choose a new filename on a local disk.")?;
        Ok(())
    });
    drop(file);
    let _ = fs::remove_file(&partial);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn saves_complete_video_and_cleans_failed_transfers() {
        use std::{net::TcpListener, io::Read, thread, time::SystemTime};
        let root = std::env::temp_dir().join(format!("streamnyaa-download-test-{}", SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        for (status, length, body, expected) in [(200, 4, "test", true), (500, 4, "fail", false), (200, 8, "part", false)] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/video", listener.local_addr().unwrap()).parse().unwrap();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 2048];
                let _ = stream.read(&mut request);
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}").unwrap();
            });
            let target = root.join(format!("video-{status}-{length}.mkv"));
            let result = transfer(url, &target, || true, |_, _| {});
            server.join().unwrap();
            assert_eq!(result.is_ok(), expected, "{result:?}");
            assert_eq!(target.exists(), expected);
            if expected { assert_eq!(fs::read(&target).unwrap(), b"test"); }
        }
        let target = root.join("existing.mkv");
        fs::write(&target, "keep").unwrap();
        assert!(transfer("http://127.0.0.1:1/video".parse().unwrap(), &target, || true, |_, _| {}).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"keep");
        let cancelled = root.join("cancelled.mkv");
        assert!(transfer("http://127.0.0.1:1/video".parse().unwrap(), &cancelled, || false, |_, _| {}).is_err());
        assert!(!cancelled.exists());
        assert!(fs::read_dir(&root).unwrap().all(|file| !file.unwrap().path().to_string_lossy().ends_with("streamnyaa-part")));
        fs::remove_dir_all(root).unwrap();
    }
    #[test] fn rejects_external_addresses_before_writing() {
        for url in ["https://example.com/video", "http://127.0.0.1:3030/admin", "http://name@127.0.0.1:3030/torrents/0/stream/0"] {
            assert!(save(url, Path::new("unused-download-test.mkv"), || true, |_, _| {}).is_err());
        }
    }
}
