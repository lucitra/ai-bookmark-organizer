---
name: capture-bookmark-marketing
description: Capture, verify, and optionally promote real 1280x800 marketing and Chrome Web Store screenshots for the AI Bookmark Organizer extension. Use only for this repository when product UI, store assets, release screenshots, or bookmark-marketing images need to be refreshed after a UI change.
---

# Capture Bookmark Marketing

Use the isolated Chrome-for-Testing harness to exercise the packaged extension UI with deterministic synthetic bookmarks. Never use the developer's normal Chrome profile or real bookmark collection.

## Workflow

1. Read `references/capture-contract.md` before capturing.
2. Confirm the extension validates:

   ```bash
   node scripts/validate-extension.mjs
   ```

3. Install the pinned harness dependency when needed:

   ```bash
   npm --prefix skills/capture-bookmark-marketing/scripts ci
   ```

4. Capture the scenarios into the ignored review directory:

   ```bash
   npm --prefix skills/capture-bookmark-marketing/scripts run capture
   ```

   Add `-- --headed` only while debugging the isolated test browser.
   To verify the exact unpacked release archive, set `LUCITRA_EXTENSION_DIR` to
   its temporary extraction directory before running the same command.

   Before a release that changes planning or assignment behavior, also run the
   deterministic 1,000-bookmark QA scenario. It verifies automatic detail,
   complete proposed coverage, and safe two-level folder paths without putting
   a thousand synthetic records through the screenshot browser:

   ```bash
   npm --prefix skills/capture-bookmark-marketing/scripts run qa:large
   ```

5. Verify dimensions, PNG integrity, uniqueness, report hashes, and release separation:

   ```bash
   npm --prefix skills/capture-bookmark-marketing/scripts run verify
   ```

6. Inspect every generated PNG visually. Check that text is readable, no loading or error state is visible, no menu or tooltip obscures the product, and no personal data appears.
7. Promote only approved captures into `store-assets/screenshot-N.png`:

   ```bash
   npm --prefix skills/capture-bookmark-marketing/scripts run promote
   ```

8. Re-run extension and release validation after promotion.

## Safety Rules

- Keep the browser profile temporary and isolated. Never pass a personal `--user-data-dir`.
- Use only the synthetic fixture titles and public URLs in `scripts/capture.mjs`.
- Capture real extension pages after real bookmark API operations. Do not mock, composite, retouch, or fabricate UI.
- Do not crop a narrow popup into a fake 1280x800 canvas. The harness captures full-page extension surfaces that naturally fit the store format.
- Keep Puppeteer and all harness files outside `release-files.txt`; they are development tooling, not extension runtime code.
- Treat `store-assets/generated/` as review output. Promotion is the only command allowed to replace submission screenshots.
- If Chrome cannot render `chrome://bookmarks` in the isolated automation browser, retain the real applied-workspace capture and record the internal-page capture as unavailable. Do not substitute a mock.

## Outputs

- Review captures: `store-assets/generated/*.png`
- Machine-readable evidence: `store-assets/generated/capture-report.json`
- Promoted submission assets: `store-assets/screenshot-1.png` through `screenshot-5.png`

The number of promoted screenshots follows the verified report. A fifth screenshot is present only when the real Chrome bookmark manager is capturable.
