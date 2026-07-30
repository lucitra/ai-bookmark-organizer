<div align="center">
  <img src="./docs/assets/icon-128.png" alt="" width="96" height="96" />
  <h1>AI Bookmark Organizer</h1>
  <p>
    Save the page you are on. Turn a bookmark pile into a working library.
    Ask questions across links you already saved.
  </p>
  <p>
    <a href="https://lucitra.github.io/ai-bookmark-organizer/"><strong>Product and download</strong></a>
    ·
    <a href="https://lucitra.ai/tools/ai-bookmark-organizer/privacy/">Privacy</a>
    ·
    <a href="https://github.com/lucitra/ai-bookmark-organizer/issues">Support</a>
  </p>
  <p><code>local / no account / no API key / reversible</code></p>
</div>

A local-first Manifest V3 Chrome extension for saving, organizing, and asking
questions about Chrome bookmarks. Chrome Built-in AI runs on the device when
available; deterministic local rules keep the core organizer useful without a
cloud service.

> [!IMPORTANT]
> This is a Chrome extension, not a bookmark or bookmarklet. It never reorganizes
> bookmarks until you review the proposed moves and select **Apply selected**.

## What It Does

- Saves the current page into a chosen bookmark folder, with an optional local
  AI category suggestion.
- Organizes all bookmarks or one selected folder using a collection-aware
  category plan.
- Accepts a plain-language organization instruction, such as “separate AI
  infrastructure from design tools and learning resources.”
- Checkpoints every completed batch so an interrupted scan can resume without
  starting over.
- Shows an editable category and a metadata-grounded reason for every proposed
  move.
- Moves only selected bookmarks and provides an undo action for the last apply.
- Answers questions using saved titles, URLs, folder paths, and organizer
  categories, with links back to relevant bookmarks.

The extension does not fetch bookmarked pages, use a cloud AI API, require an
account, or need an API key. Chrome may download its on-device model the first
time AI is used, but bookmark processing stays on the device.

## Install

### Chrome Web Store

The public listing is being prepared. Once approved, the store listing will be
the recommended installation method and will provide a stable extension ID and
automatic updates.

### Local release

1. Open the
   [AI Bookmark Organizer download page](https://lucitra.github.io/ai-bookmark-organizer/).
2. Download the latest release and unzip `ai-bookmark-organizer.zip`.
3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Select **Load unpacked**.
6. Select the unzipped directory that directly contains `manifest.json`.
7. Pin **AI Bookmark Organizer** from Chrome’s extensions menu.

Do not select the repository’s `dist/` directory: it contains release archives,
not an unpacked extension. Developers should load the repository root.

Managed Chrome installations may block unpacked extensions. A downloaded ZIP
cannot bypass that policy. Install the Chrome Web Store release after approval,
or ask the administrator to allow its extension ID.

## Use

### Save the current page

1. Open the page you want to save.
2. Select the pinned extension icon.
3. Choose the destination folder.
4. Optionally enter a category or select **Suggest category**.
5. Select **Save bookmark**.

The extension reads only the active tab’s title and URL after you open the
popup. It does not read the page body.

### Organize a collection

1. Open the popup and select **Open organizer workspace**.
2. Choose all bookmarks or one folder as the scan scope.
3. Choose the destination root and maximum number of categories.
4. Optionally describe the organization you want.
5. Select **Plan and scan**. Large scopes require confirmation.
6. Pause or close the workspace if needed. Reopening it offers the latest
   completed checkpoint for resumption.
7. Review every proposed move. Edit categories and deselect anything you do not
   want moved.
8. Select **Apply selected**.

Applied bookmarks move into
`<destination root>/AI Organized Bookmarks/<Category>`. The extension never
deletes bookmarks. **Undo last apply** moves bookmarks back to their recorded
folders and leaves empty organizer folders in place.

### Ask your bookmarks

Open **Ask Bookmarks**, choose a scope, and ask questions such as:

- “What NVIDIA developer resources have I saved?”
- “What are the largest themes in this collection?”
- “Which bookmarks appear to be duplicates?”

Answers are grounded in bookmark metadata only. The extension does not claim to
have read linked pages, and source links let you inspect the relevant bookmarks.

## Local AI and fallback behavior

AI Bookmark Organizer checks Chrome’s local AI APIs in this order:

1. `LanguageModel`
2. `window.ai.languageModel`
3. `chrome.aiOriginTrial.languageModel`

Chrome 138 or newer and supported hardware are required for the Prompt API.
Chrome documents current requirements in
[Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).

If local AI is unavailable, the extension clearly shows **Fallback**. Quick-save
and organization then use deterministic metadata rules. Bookmark Q&A returns
the strongest metadata matches and category summary instead of a generated
answer.

## Privacy and permissions

The packaged extension requests only:

- `activeTab` — temporarily reads the current tab’s title and URL after the user
  opens the extension so that page can be saved.
- `bookmarks` — reads bookmark metadata, creates bookmarks and organizer
  folders, and moves only user-approved bookmarks.
- `storage` — saves scan checkpoints, editable previews, recent bookmark Q&A,
  and the last undo record on the device.

There are no host permissions, remote resources, remote code, background service
worker, analytics, accounts, or network calls in the packaged extension.

## Development

See [DEV.md](./DEV.md) for the isolated Chrome profile workflow, deterministic
tests, package checks, and release commands.

Future relationship-workspace research is intentionally separate from the
standalone extension:

- [HubSpot patterns](./research/HUBSPOT.md) — bookmark-first objects,
  associations, activities, views, and phased CRM recommendations.
- [Gmail integration patterns](./research/GMAIL.md) — a narrow Workspace Add-on,
  shared backend records, AI/data boundaries, and a path that avoids broad
  mailbox access at launch.

To run the complete automated verification:

```bash
node --test test/*.test.cjs
node scripts/validate-extension.mjs
./scripts/validate-release.sh
```

The build uses the explicit allowlist in `release-files.txt`. CI builds the ZIP
twice and rejects a non-reproducible or unexpected package.

## Release process

1. Develop on a `codex/` or other feature branch.
2. Run the complete automated verification and isolated Chrome QA.
3. Update store copy, privacy disclosures, screenshots, and `SUBMISSION.md`.
4. Merge the reviewed pull request into `main`.
5. Tag the merged commit with the matching manifest version:

   ```bash
   git tag -a v1.1.0 -m "AI Bookmark Organizer v1.1.0"
   git push origin v1.1.0
   ```

The release workflow publishes the exact allowlisted package, checksums, and
build provenance. Do not move an existing version tag.

## Project files

- `manifest.json` — Manifest V3 configuration and minimal permissions.
- `lucitra.css` — shared Lucitra design foundations used by both extension
  surfaces.
- `shared.js` — local AI adapters, prompt boundaries, bookmark helpers, parsing,
  and deterministic fallback logic.
- `popup.*` — quick-save current-page experience.
- `workspace.*` — persistent organizer and metadata-only bookmark Q&A.
- `test/` — deterministic bookmark-tree fixtures and core tests.
- `scripts/` — package policy validation and reproducible release build.
- `research/` — source-backed future product research, outside the current
  extension scope.
