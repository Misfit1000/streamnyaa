# Gemini 2.5 writing recovery — 2026-10-22

The production job remained paused at article writing after HTTP 503. The previous writer stopped after the first model transport error and retained no partial revision progress. Gemini 2.5 is retained; no new provider, billing configuration, model upgrade, database migration or automatic-publication change is introduced.

The writer now shares a maximum of three model requests per worker across generation and its one allowed editorial revision. Transient 500/502/503/504 and connection failures use persisted 30-second, one-minute, two-minute and five-minute backoff. A retry only waits inside the worker when it fits the existing deadline. Longer provider deadlines are honored; quota and denied-access responses are not retried in a loop. Continued outages remain paused rather than becoming an empty article or false publication success.

Draft text, validation feedback, revision number, request attempts, safe provider error details, finish reason and token usage are checkpointed. Resuming after an interruption reuses completed writing. The existing draft/evidence revision gate and publication leases remain authoritative. Credentials and arbitrary response payloads are excluded from diagnostics.

For Gemini 2.5, responses use an explicit article schema and a bounded 2,048-token thinking budget within the existing 8,192-token output limit. Truncated responses are retained as failed drafts and cannot be accepted as complete articles. Admin shows the configured model, current tracked stage and automatic retry time without changing its layout.

Verification: TypeScript, 672 frontend tests, 26 publishing/model/review/Calendar/gateway regressions, 19 web/account/route contracts and the production build pass. Controlled fixtures verify 503-to-success recovery, persistent overload caps, Retry-After, denied access/quota handling, interrupted revisions, truncation, secret redaction and durable private draft creation. No public-provider load testing or test publication was performed. Live acceptance is recorded separately; a successful fixture is not evidence that Google's live service has recovered.

References checked: [Gemini 2.5 availability](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash), [generate-content thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [retry guidance](https://ai.google.dev/gemini-api/docs/troubleshooting).
