# Local Development

AI Bookmark Organizer has no build-time or runtime dependencies. The files in
the repository root are the unpacked extension.

## Safe Chrome setup

Use a dedicated Chrome profile for organizer development. Do not test apply or
undo against a personal bookmark collection.

1. Create a Chrome profile named `AI Bookmark Organizer QA`.
2. In that profile, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository root:
   `/Users/ibraheem/Documents/AI Bookmark Manager`.
6. Pin the extension.
7. Create a test folder with at least five bookmarks across distinct topics.

After source changes, select **Reload** on the extension card. Opening files
directly with `file://` does not provide the Chrome extension APIs and is not a
functional test.

## Fast iteration loop

1. Make one focused change.
2. Run:

   ```bash
   node --check shared.js
   node --check popup.js
   node --check workspace.js
   node --test test/*.test.cjs
   node scripts/validate-extension.mjs
   ```

3. Reload the unpacked extension.
4. Exercise the changed flow using only the QA bookmark folder.
5. Inspect popup/workspace errors from the extension card’s developer links.
6. Run `./scripts/validate-release.sh` before committing.

## Manual acceptance checks

- Quick save reads only the current tab title and URL, suggests a category, and
  creates the bookmark in the selected destination.
- A folder-scoped scan never includes bookmarks outside the chosen folder.
- Closing the workspace after a completed batch preserves the checkpoint;
  reopening marks the job paused and Resume continues from it.
- Pause, Resume, and Cancel leave a coherent saved state.
- Preview category edits and selections survive reopening.
- Apply moves only selected bookmarks.
- Undo restores moved bookmarks to their recorded parent folders.
- Ask Bookmarks returns metadata-grounded results with safe source links.
- Fallback mode remains useful when Chrome Built-in AI is unavailable.

## Package policy

`release-files.txt` is the complete package allowlist. The validator rejects:

- background pages or service workers;
- host or optional permissions;
- remote runtime resources or inline scripts;
- network APIs, dynamic imports, `eval`, or `new Function`;
- missing, extra, traversing, or symlinked package paths;
- icon dimension mismatches.

Adding a permission, dependency, remote resource, or background execution model
requires an explicit product/privacy review before implementation.

## Release artifact

```bash
./scripts/build-release.sh
unzip -Z1 dist/ai-bookmark-organizer-1.1.0.zip
shasum -a 256 dist/ai-bookmark-organizer-1.1.0.zip
```

Never load `dist/` itself as an unpacked extension. Unzip the versioned archive
and select the directory containing its `manifest.json`.
