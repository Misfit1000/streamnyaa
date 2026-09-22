# Explore filter click repair — 2026-09-18

## Cause and fix
All Explore dropdowns use PremiumSelect. Its document mousedown handler treated clicks on the body-level popup as outside clicks because it only checked the trigger button. This unmounted the option before its click handler could apply a selection. The prior test sent click alone and missed the failure.

The popup now has its own ref and participates in the outside-press containment check. Option selection, clicking outside, Escape dismissal, and reopening retain their existing behavior and styling. This covers Genre, Format, Status, Sort, release windows, Year, Season and ranking year through their shared component.

## Evidence
- Before the fix: full press sequence regression failed because the listbox disappeared on mousedown.
- After the fix: 218 frontend tests passed in 50 files, including all five pictured dropdown selections and route/request changes.
- TypeScript and desktop contracts passed.
- Native/Rust/player code is unchanged from the preceding repair; those suites were not rerun for this frontend-only change.
- No interactive UI testing was performed, following the user's request to test personally.

Version remains 0.1.9. The previous installer and metadata are archived before replacing the usual release copy. Signature status and SHA-256 are recorded in the accompanying release manifest. The installer remains unsigned; native acceptance and installation testing remain with the user.
