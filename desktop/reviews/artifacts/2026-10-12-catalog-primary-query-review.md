# Primary catalog query verification — 2026-10-12

Normal public HTTPS POST requests were sent directly to AniList using the current source query builders, with at least 2,100 ms between request starts. No fallback provider, credentials, account data, or media URLs were used. These are live API checks, not native visual or interaction acceptance.

- All nine Explore modes returned HTTP 200 without GraphQL errors: New episodes, Trending, Airing now, This season, Popular, Top rated, Top 100, Upcoming, and Top by year. Each returned 25 records. New episodes returned 25 valid episode/airing records, rather than catalog substitutes.
- A query with active year, premiere-date, genre, format, and status filters also returned HTTP 200 and 25 records.
- The initial seven-alias Home request exceeded the actual eight-second HTTP deadline. Home batching was reduced to two shelves per request; four subsequent requests covering all seven shelves returned HTTP 200 without GraphQL errors. Durations were 583–2,007 ms. The recent-episode shelf returned 18 valid airing records.
- AniList reported a limit of 30 requests per minute. External availability and quota changes remain outside application control.

Evidence:

- `2026-10-12T09-07-16-574Z-primary-catalog-query-probes.json`: all Explore checks plus the initial oversized Home request that exposed the timeout.
- `2026-10-12T09-09-35-938Z-primary-catalog-query-probes.json`: all four final, bounded Home batches passed.
- `2026-10-12T09-06-13-074Z-primary-catalog-query-probes.json`: unsuccessful restricted-environment attempt, followed by the normal network-enabled requests above. It does not establish a provider outage.

Query hashes and source-file SHA-256 values are retained in the JSON reports. Native layout/scaling, installation, notification delivery, and playback acceptance require separate evidence.
