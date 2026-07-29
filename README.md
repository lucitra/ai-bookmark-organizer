# AI Bookmark Organizer

A Manifest V3 Chrome Extension that reads your existing Chrome bookmarks and
organizes them locally with Chrome Built-in AI. It uses Chrome's on-device
language model when available and falls back to `Uncategorized` when the local AI
surface is not enabled.

[Download the extension](https://lucitra.github.io/ai-bookmark-organizer/) ·
[View the source](https://github.com/lucitra/ai-bookmark-organizer) ·
[Read the privacy policy](https://lucitra.ai/tools/ai-bookmark-organizer/privacy/)

> [!IMPORTANT]
> This is an unpacked Chrome extension, not a bookmark or bookmarklet. It moves
> bookmarks only after you review the preview and click **Apply Changes**.

## What It Does

- Reads bookmark titles and URLs using Chrome's bookmarks API.
- Suggests one- or two-word folders with Chrome's on-device language model.
- Shows every suggestion before changing your bookmarks.
- Creates `Other bookmarks/AI Organized Bookmarks/<Category>` and moves the
  approved bookmarks into those category folders.
- Stores the latest completed preview locally so it can be restored if you close
  the popup before applying it.

The extension does not use a cloud AI API, require an account, or need an API key.
Chrome may download its on-device model the first time AI is used, but bookmark
content is processed locally.

## Requirements

- Chrome 138 or newer on a supported desktop or Chromebook Plus device.
- Enough free storage and memory for Chrome's built-in language model.
- An unmetered connection for Chrome's initial model download.

Chrome documents the current operating-system, storage, and hardware requirements
in [Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).
The Prompt API is available to Chrome extensions from Chrome 138.

## Install a Release From GitHub

1. Open the
   [AI Bookmark Organizer download page](https://lucitra.github.io/ai-bookmark-organizer/).
2. Select **Download latest release**.
3. Unzip `ai-bookmark-organizer.zip`.
4. In Chrome, open `chrome://extensions`.
5. Turn on **Developer mode** in the top-right corner.
6. Select **Load unpacked**.
7. Select the unzipped folder that directly contains `manifest.json`.
8. Open Chrome's extensions menu and pin **AI Bookmark Organizer** for easy
   access.

Developers can clone the source repository instead:

```bash
git clone https://github.com/lucitra/ai-bookmark-organizer.git
cd ai-bookmark-organizer
```

Then load that cloned folder in Chrome.

Managed Chrome installations may block unpacked extensions. A downloaded ZIP
cannot bypass that policy. Install the Chrome Web Store release after it is
approved, and ask the administrator to allow its extension ID if the store
installation is also restricted.

## Use the Organizer

1. Optional but recommended: export a bookmark backup from Chrome's Bookmark
   Manager before the first run.
2. Select the pinned **AI Bookmark Organizer** icon.
3. Check the badge in the top-right:
   - **AI Ready** means Chrome's local model can categorize bookmarks.
   - **Fallback** means AI is unavailable. A scan will label every bookmark
     `Uncategorized`; do not apply that preview unless that is what you want.
4. Select **Scan & Organize Bookmarks** and keep the popup open while it scans.
   The first run can take longer while Chrome downloads the local model.
5. Review the category beside each bookmark in **Preview**.
6. Select **Apply Changes** only when the suggestions look right.
7. Open Chrome's Bookmark Manager and look under
   `Other bookmarks/AI Organized Bookmarks`.

The extension never deletes bookmarks. Applying a preview moves the bookmarks
into the new category folders. If a bookmark is managed by policy or was removed
after the scan, it may be skipped and the popup will report the skipped count.

## If the Badge Shows Fallback

1. Update Chrome and confirm it is version 138 or newer.
2. Confirm the computer meets
   [Chrome's built-in AI requirements](https://developer.chrome.com/docs/ai/get-started#requirements).
3. Open `chrome://on-device-internals`, then check **Model Status** for download
   or model errors.
4. Restart Chrome, reopen the extension, and scan again.

Chrome's Prompt API reports whether the model is `available`, `downloadable`,
`downloading`, or `unavailable`. The extension starts a supported download after
you click the scan button and shows its progress in the popup.

## Update the Extension

1. Pull the latest `main` branch or download and unzip the latest release.
2. Open `chrome://extensions`.
3. Select **Reload** on the **AI Bookmark Organizer** card.

If the folder moved, remove the old unpacked extension and repeat the installation
steps with the new folder.

## Verify a Download

Every GitHub release includes `SHA256SUMS.txt` and GitHub build provenance. To
compare a downloaded ZIP with the published checksum:

```bash
shasum -a 256 ai-bookmark-organizer.zip
```

The result must match the `ai-bookmark-organizer.zip` line in
`SHA256SUMS.txt` for that release.

## Maintainer Release Process

Pull requests and pushes to `main` build the exact Chrome Web Store ZIP twice and
fail if the results differ. A release is published only from a semantic version
tag whose version matches `manifest.json` and whose commit is contained in
`main`.

1. Update `manifest.json` with the next version.
2. Merge the validated change into `main`.
3. Create and push an annotated tag:

   ```bash
   git tag -a v1.0.0 -m "AI Bookmark Organizer v1.0.0"
   git push origin v1.0.0
   ```

The release workflow creates the package from an explicit runtime-file
allowlist, publishes checksums and provenance, and then makes the completed
release immutable. GitHub Pages always links to the latest published release.

## How It Works

1. The popup checks for Chrome's local AI APIs in this order:
   - `LanguageModel`
   - `window.ai.languageModel`
   - `chrome.aiOriginTrial.languageModel`
2. It reads bookmarks with `chrome.bookmarks.getTree()`.
3. It sends each bookmark title and URL to the local model with this prompt:

   ```text
   Given the bookmark title '{title}' and URL '{url}', respond with ONLY a 1 to 2 word general category folder name (e.g., Technology, Recipes, Finance, Productivity, Design, News). Do not add punctuation or extra words.
   ```

4. It previews the suggested folder names in the popup.
5. When you click **Apply Changes**, it creates an `AI Organized Bookmarks`
   folder and moves bookmarks into suggested category folders.

## Project Files

- `manifest.json` - Manifest V3 config with `bookmarks` and `storage` permissions.
- `popup.html` - Extension popup UI.
- `popup.css` - Local, dependency-free popup styling.
- `popup.js` - Bookmark scanning, local AI categorization, preview, and apply logic.
