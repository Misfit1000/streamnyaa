# Desktop 0.1.10: remaining release gates

This follow-up supersedes the dependency-audit blocker in the earlier artwork/Cast/Calendar/trailer report. It preserves desktop application identity, visual design, settings, media and progress. No audit rule or test expectation was weakened.

## Security repair

The dependency audit initially reported six advisories. Updated versions are:

| Dependency | Before | After |
| --- | --- | --- |
| Vitest and its mocker | 3.2.7 | 4.1.11 |
| tinypool | 1.1.1 | Removed with the compatible test-runner update |
| proxy-addr | 2.0.7 | 2.0.8 |
| source-map-js | 1.2.1 | 1.2.2 |
| undici | 7.29.0 | 7.30.1 |

`npm audit` now reports **zero vulnerabilities**, including development dependencies. The [Vitest 4 migration requirements](https://v4.vitest.dev/guide/migration.html) fit the existing Node/Vite ranges. Its [published mocker security fix](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) is included. The application does not require an unrelated Vite or Node major upgrade.

Full local `verify:web` passed: TypeScript, all 16 web tests, security audit, production frontend, asset checks, server build and smoke checks for 13 production routes. Generated sitemap changes from that verification were discarded rather than included in this desktop repair. The complete frontend suite passed with 471 tests across 81 files under the patched runner. Desktop contracts also passed. A small visible AnimeSchedule attribution appears when its release-track records are displayed; provider error details remain administrator-only.

## Additional real native engine evidence

The previously ignored download integration was run through its intended local-only tracker/seeder harness and **passed**. It exercises the native queue, bandwidth-limited transfer, pause/resume, verified output bytes and durable completion in a separate profile. The regular Rust run's 94 passes plus this independently executed integration cover all 95 current native tests; the standard run still deliberately leaves that integration ignored without its harness.

The bundled MPV/rqbit playback fixture also passed, using real decoded media, open-ended byte ranges, cached and partial data, replacement seeks and a simultaneous transfer. Cached seek p95 was **89 ms** across ten target seeks. Rate-limited partial seek p95 was **4,989 ms**, including piece acquisition. Frames were already advancing at the first observation that reported target-buffer availability; the reported zero observation delta is **not proof of zero decode latency**. Fine-grained acquisition-to-frame latency, live torrent throughput and installed interaction acceptance remain separate.

Player sources, the bundled engine/player binaries and native source are unchanged by this security follow-up. The earlier 525 player-state assertions, controls, stalled-stream check and 100-cycle soak apply to those identical files; they were not repeatedly rerun for dependency metadata alone. Current native source also compiled successfully into the isolated debug app.

The release preparer now verifies nested resources, including `mpv/fonts.conf`, in the same pass as the binaries and player script. It also normalizes source-hash records before JSON serialization so Windows PowerShell emits an ordinary array rather than its extended `value`/`Count` wrapper. All 31 native/resource input hashes from the previous release evidence were explicitly compared and remained unchanged. Final packaging must verify the new manifest's array shape and nested resource entry by reading it back.

## External and environment gates

- The user logged into the StreamNyaa-owning Vercel account in the in-app browser. The project's environment-variable search confirmed no AnimeSchedule variable. Configuring the existing application token is the next step; the token must remain server-side and must never enter the repository or installer. Live gateway, reported Beyblade dub and actual Windows notification acceptance remain pending until that token is working.
- An AnimeSchedule login tab is open for the user to obtain/access the application credential. Creating credentials, accepting new API terms or solving a challenge must follow the browser's action-time approval/handoff requirements. An existing authorized application is preferred to avoid unnecessary new access.
- The host is **Windows 11 Home**. `WindowsSandbox.exe` and Hyper-V's `Get-VM` are unavailable. No isolated Windows installer environment has been established. The live installed user's registry/profile must not be overwritten to pretend to perform an isolated install or upgrade.
- No unexpired CurrentUser code-signing certificate with a private key, signing environment configuration, or relevant local PFX/P12 file was found. Trusted signing remains blocked; a self-signed artifact would not close that gate.
- Native Calendar/Cast/trailer interactions and real Windows notification behavior at 100%, 150% and 200% OS scaling remain unaccepted. YouTube's verification challenge remains provider-controlled. Automated fixtures and browser previews do not establish those results.

Final installer paths, checksum, signature status, source commit, remote CI result and any subsequent live gateway observations are recorded in the companion release evidence. Do not interpret a candidate installer or zero dependency advisories as closing the external/native gates above.
