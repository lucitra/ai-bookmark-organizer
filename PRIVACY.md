# AI Bookmark Organizer Privacy Policy

Effective date: August 1, 2026

The canonical, current policy is published at
https://lucitra.ai/tools/ai-bookmark-organizer/privacy/.

## Summary

AI Bookmark Organizer is local by default. Lucitra does not receive, collect,
sell, or use extension data for advertising or profiling. Optional Agent Access
lets a user connect a separately installed local companion and approved MCP
clients. A client that uses an external model may process the bookmark metadata
the user has explicitly authorized for that provider.

## Data accessed on the device

The extension can access:

- The active tab's title and URL after the user opens the extension, solely to
  let the user save that page as a bookmark.
- Chrome bookmark titles, URLs, folder structure, and bookmark identifiers,
  solely to save, organize, move, undo, and answer questions about bookmarks.
- User-entered organization instructions and bookmark questions.

The extension does not read linked webpage content, general browsing history,
cookies, form data, passwords, or data from other tabs.

## Local processing and storage

Chrome Built-in AI processes prompts on the device when available. In the
default standalone mode, the packaged extension makes no network requests and
does not use a remote AI service.

Scan checkpoints, category plans, editable previews, recent bookmark questions
and answers, agent access policy, and undo records are stored in
`chrome.storage.local`. Chrome controls that local extension storage. Removing
the extension normally removes its local storage.

## Optional Agent Access

Agent Access is off by default. If the user selects **Enable Agent Access**, the
extension requests Chrome's optional `nativeMessaging` permission and can
connect to the open-source Lucitra companion installed on the same computer.
Native Messaging does not expose a public server or inbound network port.

The companion uses an authenticated local socket to make a bounded set of
bookmark tools available to an MCP client. The user chooses the bookmark folder
scope and whether access is read-only or permits reviewed changes. Agent Access
cannot read linked page content or delete bookmarks. Write-capable clients must
prepare an expiring plan before applying moves, and applied moves are recorded
for undo.

Local MCP clients can process approved bookmark metadata on the device. Codex,
Claude, and other clients may use external models even when their applications
run locally. Before Codex or Claude can access bookmark data, the user must
select that provider and affirm a separate disclosure in extension Settings.
The approved provider may receive bookmark titles, URLs, folder paths, organizer
categories, and user instructions from the approved scope. The extension does
not send linked webpage content, cookies, passwords, or data from other tabs.

Lucitra does not operate an intermediary cloud service for Agent Access. Data
sent by an approved MCP client to an external provider is handled under the
user's account and the provider's applicable terms and privacy policy.

The user can revoke the Chrome permission and disconnect all clients by
selecting **Disable and revoke** in Settings. The companion can be uninstalled
separately to remove its native host registration and local authentication
token.

## Bookmark changes

The extension creates bookmarks and folders only at the user's request. It moves
bookmarks only after the user reviews and applies selected changes, either in the
organizer workspace or through a prepared Agent Access plan under the reviewed
change policy. It never deletes bookmarks. Recorded moves can be undone; empty
folders may remain after an undo.

## Data sharing and retention

Lucitra receives no extension data and therefore does not retain it. Local
extension data remains on the device until it is replaced, cleared, or the
extension is removed. Companion configuration remains until the companion is
uninstalled.

If the user explicitly authorizes an external provider, the provider may retain
or process the selected data according to the user's provider account,
configuration, terms, and privacy policy. Lucitra does not control that external
retention.

## Permissions

- `activeTab` provides temporary access to the current tab's title and URL after
  the user opens the extension.
- `bookmarks` provides access required to read bookmark metadata and create or
  move user-approved bookmarks and folders.
- `storage` preserves local checkpoints, previews, Q&A history, agent policy,
  prepared plans, and undo state.
- `nativeMessaging` is optional and is requested only when the user enables
  Agent Access so the extension can communicate with the installed local
  companion.

The extension requests no host permissions.

## Contact

Questions or privacy requests can be sent to
[privacy@lucitra.ai](mailto:privacy@lucitra.ai).
