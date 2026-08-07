# Marketing Screenshot Contract

## Required scenarios

All captures are 1280x800 PNG files at device scale factor 1.

1. `01-organize-preview.png` — a completed real scan with a populated category plan and reviewable bookmark moves.
2. `02-ask-duplicates.png` — a real chat request that detects synthetic duplicate bookmarks and proposes a reversible review action.
3. `03-agent-access.png` — the real Agent Access settings surface in its privacy-first default state.
4. `04-applied-result.png` — the real organizer after applying the synthetic plan, with the successful result and undo affordance visible.
5. `05-bookmark-folders.png` — optional; the real `chrome://bookmarks` view of the generated organizer folders when Chrome permits internal-page capture.

## Fixture boundary

The harness creates a fresh temporary Chrome profile and clears it before seeding public synthetic bookmark metadata. It must never connect to or copy the developer's Chrome profile. The browser closes and the temporary profile is deleted even after a failure.

The bookmarks cover research, software, design, learning, companies, and investors so the organizer is presented as an open-ended tool. A deliberate duplicate URL is included only to exercise the reversible duplicate-review flow.

## Acceptance criteria

- Real extension origin and real Chrome bookmark APIs are used.
- Each required image is exactly 1280x800 and visually distinct.
- The organize capture says the scan is complete and contains preview rows.
- The ask capture contains a user turn, assistant response, bookmark sources, and proposed action.
- The settings capture shows Agent Access off and external AI opt-in unchecked.
- The applied capture confirms moved bookmarks and exposes Undo.
- No personal bookmark, profile, email, account, or browser session data appears.
- No artificial browser frame, rounded-device mockup, annotation, or compositing is added.
- Generated files remain outside the extension package allowlist.

Promotion requires visual inspection in addition to script verification.
