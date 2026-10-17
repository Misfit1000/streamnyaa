//! YouTube's required stable application identification, scoped to embed documents only.
pub fn is_embed_request(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && matches!(
                url.host_str(),
                Some("www.youtube.com" | "www.youtube-nocookie.com")
            )
            && url.path().starts_with("/embed/")
    })
}
#[cfg(windows)]
pub fn install(app: &tauri::AppHandle) {
    use tauri::Manager;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
        WebResourceRequestedEventHandler,
    };
    use windows::core::{w, PWSTR};
    if let Some(window) = app.get_webview_window("main") {
        let result = window.with_webview(|view| unsafe {
            let setup = || -> windows::core::Result<()> {
                let webview = view.controller().CoreWebView2()?;
                webview.AddWebResourceRequestedFilter(
                    w!("https://www.youtube.com/embed/*"),
                    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
                )?;
                webview.AddWebResourceRequestedFilter(
                    w!("https://www.youtube-nocookie.com/embed/*"),
                    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT,
                )?;
                let mut token = 0;
                webview.add_WebResourceRequested(
                    &WebResourceRequestedEventHandler::create(Box::new(|_, args| {
                        if let Some(args) = args {
                            let request = args.Request()?;
                            let mut uri = PWSTR::null();
                            request.Uri(&mut uri)?;
                            let uri = webview2_com::take_pwstr(uri);
                            if is_embed_request(&uri) {
                                request.Headers()?.SetHeader(
                                    w!("Referer"),
                                    w!("https://xyz.streamnyaa.desktop/"),
                                )?;
                            }
                        }
                        Ok(())
                    })),
                    &mut token,
                )?;
                Ok(())
            };
            if setup().is_err() {
                crate::log_info("Trailer application identification could not be installed.");
            }
        });
        if result.is_err() {
            crate::log_info("Trailer WebView is unavailable.");
        }
    }
}
#[cfg(not(windows))]
pub fn install(_app: &tauri::AppHandle) {}
#[cfg(test)]
mod tests {
    #[test]
    fn identification_is_limited_to_embed_documents() {
        assert!(super::is_embed_request(
            "https://www.youtube-nocookie.com/embed/abcdefghijk?fs=1"
        ));
        for url in [
            "https://accounts.google.com/",
            "https://www.youtube.com/watch?v=abcdefghijk",
            "https://www.youtube.com.evil/embed/test",
            "http://www.youtube.com/embed/test",
            "https://user@www.youtube.com/embed/test",
        ] {
            assert!(!super::is_embed_request(url));
        }
    }
}
