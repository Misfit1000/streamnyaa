# Settings and CC follow-up — 2026-09-16

Status: user-reported physical-click failure remains open pending a captured reproduction on the updated player.

## Implemented

- CC now opens the subtitle picker, including the external-file import action, even when media has no embedded subtitle tracks. Previously the click handler silently did nothing in that case.
- The keyboard subtitle toggle now explains when there are no subtitle tracks.
- Opt-in input tracing now identifies a rejected press/release pair, its targets, pointer coordinates, dimensions and whether layout changed. No media addresses or credentials are added to this trace.
- Added regressions for CC without embedded subtitles and pointer-move/press/release navigation through all seven settings submenus.
- Previous committed repair 432f3b9 prevents duplicate activation when a native double-click notification occurs between ordinary down/up events.

## Verification and limits

Player-state: 495 assertions pass. Desktop contracts, controls, stall and 100-cycle soak pass. Frontend and Rust code are unchanged from the previously verified repair.

The user's report that Settings and CC do not respond takes precedence over successful automated clicks. The earlier input trace showed both physical CC clicks reaching the old silent handler. It did not establish the cause of the reported Settings failure. No complete fix or installed-app acceptance is claimed.

An updated diagnostic player was opened for the user to reproduce the failed clicks without simultaneous agent pointer control. Physical reproduction results are pending. The installed app and current release remain unchanged; candidate packaging does not establish acceptance.
