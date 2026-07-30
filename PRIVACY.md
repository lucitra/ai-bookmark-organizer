# AI Bookmark Organizer Privacy Policy

Effective date: July 29, 2026

The canonical, current policy is published at
https://lucitra.ai/tools/ai-bookmark-organizer/privacy/.

## Summary

AI Bookmark Organizer processes data locally in Chrome. Lucitra does not receive,
collect, sell, share, or use extension data for advertising or profiling.

## Data accessed on the device

The extension can access:

- The active tab’s title and URL after the user opens the extension, solely to
  let the user save that page as a bookmark.
- Chrome bookmark titles, URLs, folder structure, and bookmark identifiers,
  solely to save, organize, move, undo, and answer questions about bookmarks.
- User-entered organization instructions and bookmark questions.

The extension does not read page content, browsing history, cookies, form data,
passwords, or data from other tabs.

## Local processing and storage

Chrome Built-in AI processes prompts on the device when available. The packaged
extension makes no network requests and does not use a remote AI service.

Scan checkpoints, category plans, editable previews, recent bookmark questions
and answers, and the last undo record are stored in `chrome.storage.local`.
Chrome controls that local extension storage. Removing the extension normally
removes its local storage.

## Bookmark changes

The extension creates bookmarks and folders only at the user’s request. It moves
bookmarks only after the user reviews and applies selected changes. It never
deletes bookmarks. The last applied set of moves can be undone from the
workspace; empty folders may remain after an undo.

## Data sharing and retention

Lucitra receives no extension data, so Lucitra does not retain or share it.
Local extension data remains on the device until it is replaced, cleared, or the
extension is removed.

## Permissions

- `activeTab` provides temporary access to the current tab’s title and URL after
  the user opens the extension.
- `bookmarks` provides access required to read bookmark metadata and create or
  move user-approved bookmarks and folders.
- `storage` preserves local checkpoints, previews, Q&A history, and undo state.

The extension requests no host permissions.

## Contact

Questions or privacy requests can be sent to
[privacy@lucitra.ai](mailto:privacy@lucitra.ai).
