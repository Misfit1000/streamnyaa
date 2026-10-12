# Vercel request reduction

Implemented in shared client and API code without changing player behavior or account authorization.

- Source-history sync sends at most 30 entries in a single API request, preserves the old single-entry API contract, and records successful acknowledgements per account. Unchanged acknowledged entries are skipped across restarts; failed/local-only responses remain pending. Changes during an upload are drained by the same serialized uploader.
- Concurrent history reads for the same credentials and limit share a request. Responses are not retained as a private cross-account cache.
- Public authentication configuration is cached on the device for one hour, with concurrent fetch coalescing. Environment configuration retains precedence. Failed fetches use the existing bundled fallback for one minute before retrying; fallback is not persisted as a successful response. Role checks and session validation retain their existing behavior.
- Vercel browser cache headers make versioned `/assets/` files immutable for one year. The HTML shell and authenticated responses are not included. Public auth configuration gets a five-minute browser cache.
- Auth, history and account-sync routes cache CORS preflight permission for ten minutes. Actual authenticated requests still validate their bearer token and remain `no-store`.

Existing account sync is already change-triggered/debounced; desktop sync goes directly to Supabase. No extra polling timers were introduced or native progress sampling removed.

## Delivery and limits

Validation: TypeScript passed; all 247 frontend tests passed (including 15 new client/API regressions); all 16 web checks passed; `git diff --check` passed. Rust and MPV code are unchanged, so native player suites were not repeated for this request-usage change.

Deploy the backward-compatible API before distributing clients that send batches. An older server rejects batch uploads; the updated client retains those entries locally and retries at the next sync opportunity rather than acknowledging them or fanning out requests.

These changes reduce Vercel application requests, not database operations. The API retains the existing delete/reinsert schema contract; it is not a database transaction and does not claim cross-device atomic history writes. Playback progress uses the separate account-sync path.

No production Vercel dashboard was available for a traffic baseline; no measured production savings or 10,000-user capacity claim is made. A full 30-entry pending-history sync changes from 30 application requests to one; subsequent unchanged syncs send zero. Browser preflights may add requests depending on their cache state.

Deployment and installer packaging are separate from this source update. No production configuration, user data, or installed application was replaced.
