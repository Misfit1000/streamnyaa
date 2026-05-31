# StreamNyaa Desktop Rollback

## Keep these from every release

- signed installer
- `release-manifest.json`
- `SHA256SUMS.txt`
- short changelog

## Rollback trigger conditions

- installer launches but playback fails on clean machines
- multiple player windows open
- cache cleanup regresses
- bundled binaries are missing or broken
- runtime logs show repeated startup or playback failures

## Rollback steps

1. Stop promoting the new installer immediately.
2. Restore the previous stable installer and its manifest/checksum files.
3. Mark the failed version as blocked in release notes.
4. Keep the failed installer and logs for investigation.
5. Fix on the `desktop` branch, rerun:
   - `npm run verify:desktop-release`
   - `npm run desktop:build`
   - `npm run prepare:desktop-release`

## Minimum rollback promise

At any point, there should always be one known-good signed installer available for re-distribution.
