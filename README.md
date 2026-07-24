# AI Bookmark Organizer

A Manifest V3 Chrome Extension that reads your existing Chrome bookmarks and
organizes them locally with Chrome Built-in AI. It uses Chrome's on-device
language model when available and falls back to `Uncategorized` when the local AI
surface is not enabled.

## Why This Setup

- **Zero cost:** no OpenAI, Gemini API, or cloud AI billing.
- **Zero setup:** users do not need accounts, API keys, or server config.
- **Private by default:** bookmark titles and URLs stay on the device and are
  processed through Chrome's local model when available.

## Project Files

- `manifest.json` - Manifest V3 config with `bookmarks` and `storage` permissions.
- `popup.html` - Extension popup UI.
- `popup.css` - Local, dependency-free popup styling.
- `popup.js` - Bookmark scanning, local AI categorization, preview, and apply logic.

## Load Unpacked in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select this folder: `ai-bookmark-organizer`.
5. Pin **AI Bookmark Organizer** from the extensions menu.
6. Open the popup and click **Scan & Organize Bookmarks**.
7. Review the suggested folders, then click **Apply Changes**.

## Enable Chrome Built-in AI if Needed

Chrome Built-in AI availability depends on Chrome version, device capability,
region, and enabled flags. If the popup shows `Fallback`, the extension still
works, but every bookmark will be placed in `Uncategorized` until local AI is
available.

Try the following in Chrome:

1. Use a recent Chrome, Chrome Beta, Chrome Dev, or Chrome Canary build.
2. Visit `chrome://flags/#optimization-guide-on-device-model`.
3. Set **Optimization Guide On Device Model** to **Enabled** if the flag exists.
4. If available, also enable the Prompt API / Built-in AI related flags shown by
   Chrome for your version.
5. Restart Chrome.
6. Reopen the extension popup and scan again.

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

## Notes

- The extension does not delete bookmarks.
- If a bookmark is managed by Chrome policy or removed before applying, it may be
  skipped and the popup will report that.
- The extension stores the latest scan preview in `chrome.storage.local` so the
  popup can recover it if closed before applying.
