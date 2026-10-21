# StreamNyaa Desktop 0.1.12 — batch playback and publishing acceptance

Source: `7b8675988cae8cf289c3e297cfa73a5887593e8c` (includes `6090a3a` and the production review gate `c770dc2`). Version, application identifier, approved cinematic-v3 artwork, existing accounts and archive compatibility are preserved. The prior 0.1.11 installer is the required immediate rollback.

## Delivered behavior

- Title-scoped pack discovery shares the existing source budget and continuation. Single-episode candidates remain available progressively. A pack label verifies neither its files nor its episodes.
- Use checks a bounded manifest through an isolated, owned metadata-only engine; it does not interrupt active playback or add a Downloads entry. Native validation binds the chosen file to its release, manifest, installment and episode. Missing, ambiguous, combined and unqualified absolute-numbered files cannot silently select an unrelated video. Explicit ambiguity opens the accessible file picker.
- Playback requests only the selected video and matching subtitles. A verified next file in the same pack reuses the active engine and cached pieces. Existing safe disk and cache limits remain enforced. Whole-release downloads remain explicit. Progress remains scoped to the actual episode.
- Manifest-confirmed numbered episodes display Available from batch without rewriting provider-confirmed aired totals or Calendar dates. Changing episode, identity or preferences invalidates the active selection; cancelled inspection cannot replace newer playback.
- Private revision-bound article review is deployed behind an additive service-only database gate. Approval/rejection and enabling automatic publication require authenticated Admin access and current persisted state. Public Blog/archive/sitemap reads remain read-only. Completed quiet-day retries refresh discovery; interrupted runs retain their saved cursor. Existing articles are unchanged.
- Vite was patched from 6.4.3 to 6.4.5 after the final audit reported new launch-editor advisories; the affected TypeScript/frontend/web/build checks were repeated successfully. No runtime UI redesign or paid dependency was introduced.

## Automated and controlled acceptance

- TypeScript; 651 frontend tests across 98 files; 31 web/account/gateway/history/publishing tests; three article HTML tests; desktop contracts; web/server builds, bundle checks and smoke checks passed. Dependency audit: zero reported vulnerabilities at verification time.
- Rust: 126 passed, seven ignored by default. The ignored batch metadata acceptance test was then explicitly executed and passed against the local fixture. Six other opt-in native tests were not claimed as rerun acceptance.
- Bundled player: 558 behavioral assertions, controls, stall recovery and 100-cycle soak passed. The controls harness exercises actual EOF and Next/Close/Replay pointer dispatch through bundled MPV input. It also verifies 12 episode replacements while retaining one owned MPV process.
- A generated ten-file, valid Matroska torrent fixture verified metadata-only inspection without adding a transfer, episode 2/3 indices `[1,2]`, wrong-episode selection rejection, native cache reuse, selected-file priority and the same torrent ID. Both selected HTTP streams were decoded by bundled MPV. Inspection left the active transfer engine alive. The native bridge resolved local metadata in approximately 0.73 s; its next cached lookup took 12 ms in this fixture. These are fixture observations, not public-provider or capacity benchmarks.
- Fixtures cover missing episodes, wrong seasons, duplicate encodes, samples/extras, matching subtitles, combined videos, unknown absolute numbering, malformed paths/cache files, hash encodings, cancellation, cache reload and stale selections. Review tests cover exact revisions, concurrent approval, leases, unauthorized access, private-cache cancellation and quiet-day recovery.

## Production publishing and Google evidence

- The additive review migration was applied before dependent deployment. The gate was verified closed, with no anonymous read or ordinary authenticated approval access.
- Approved production attempt: job `835e4239-6a03-4f44-ab61-97d2f4052eff`, latest observed status `skipped`. Its durable checkpoint records six candidate feeds checked, zero recent leads and zero briefs, followed by insufficient activity-report evidence. No draft or new article was published. Configured Gemini credentials are not proof of live model/draft acceptance; this run did not reach that stage. Automatic publication remains paused until an actual new draft is reviewed and durably published. No filler or synthetic success was manufactured.
- The existing Blue Box article was unknown to Google's index. Search Console's actual live smartphone test succeeded: crawl allowed, page fetch successful, indexing allowed, and the correct self-canonical. One indexing request completed successfully. Indexing/ranking remains Google's decision; no result or ranking is guaranteed.
- Sitemap index submission was accepted. Its initial Search Console row reported Couldn't fetch, although direct production checks returned HTTP 200 XML for the index, static blog sitemap and dynamic blog sitemap. This is recorded separately from the successful live article fetch; submission success is not represented as sitemap processing success.
- Normal and Googlebot public article requests returned the same complete initial HTML, HTTP 200, self-canonical and no noindex header. Existing archived posts were not rewritten or editorially certified.
- Source was pushed normally to main. Vercel reported a GitHub outage delaying automatic deployments; final deployment outcome is recorded in the accompanying release evidence.

## Remaining acceptance limits

- The first new representative production draft, human editorial approval, durable new publication, subsequent automatic publication and independently identified scheduled-cron execution are pending. The review gate remains safely closed.
- The fixture proves native metadata validation, file priority, session reuse and real bundled decoding. A complete installed-app Watch Use → Play → Next interaction with a public batch was not performed. Public DHT/provider availability and real-world preparation latency are not certified.
- Clean installation, upgrade and rollback in a disposable Windows environment, physical-display scaling at 100/150/200%, and real Windows notification delivery were not available. Programmatic player input tests are distinguished from installed-app pointer acceptance.
- No code-signing certificate was available. Actual installer signature status is recorded by the release preparer. No signing service was purchased.
- Pack playback remains subject to the existing safe storage bounds and peer/file availability. Combined multi-episode videos without established segment boundaries require manual handling; no offsets were invented.
- Installer resources are verified by staged hashes and exact NSIS inclusion records; independent installer extraction is not claimed. Automated capacity/load testing remains outside this update.

The accompanying `2026-10-21-batch-publishing-installer.json` records installer checksum, size, executable version, source/resource hashes, rollback identity and individual final-check log hashes.

## Final release receipt

- Installer: `StreamNyaa_0.1.12_x64-setup.exe`, 42,506,449 bytes. SHA-256: `F3A737B5BCE7B2AD19436ACB33F451E7B2E0CE9E74804DD6E94782CD12806FF8`. Executable product version: 0.1.12. Authenticode: **NotSigned**.
- Preserved 0.1.11 rollback: 42,488,736 bytes, SHA-256 `FFA7189E708D1272122FEB65D3B35EFA30B766ACE5B68D04392A72870C98CEAD`. Its existing release manifest was verified before the new release copy.
- Vercel production deployment `5SkK5nKH92hVnsTw2agj8KeNcMSt` completed **Ready** for exact source `7b86759`, with `www.streamnyaa.xyz` assigned. The user explicitly approved this one manual deployment after automatic approval review blocked the alternate workflow during the reported GitHub outage. No security settings or credentials were changed. A delayed automatic build for the same source also appeared; its independent outcome is not needed to establish the verified revision.
- Post-deployment public Home/article/XML checks returned HTTP 200. Private draft access without authentication returned HTTP 401 and `Cache-Control: no-store`. The article response was identical for the ordinary and Googlebot user agents. These HTTP checks do not substitute for editorial acceptance or Google indexing.
- Only evidence files were updated after the installer build; validated application source/resource hashes remain unchanged. The installer was built once for this final revision.
