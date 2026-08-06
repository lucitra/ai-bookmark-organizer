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
    <a href="https://lucitra.github.io/ai-bookmark-organizer/installation.html">Installation</a>
    ·
    <a href="https://lucitra.ai/tools/ai-bookmark-organizer/privacy/">Privacy</a>
    ·
    <a href="https://github.com/lucitra/ai-bookmark-organizer/issues">Support</a>
  </p>
  <p><code>local by default / no account / explicit agent consent / reversible</code></p>
</div>

A local-first Manifest V3 Chrome extension for saving, organizing, and asking
questions about Chrome bookmarks. Chrome Built-in AI runs on the device when
available; deterministic local rules keep the core organizer useful without a
cloud service.

> [!IMPORTANT]
> This is a Chrome extension, not a bookmark or bookmarklet. It never reorganizes
> bookmarks until you review the proposed moves and select **Apply selected**.

## What It Does

- Recognizes the active page automatically, proposes a local category, and saves
  it without asking you to re-enter its title or URL.
- Organizes all bookmarks or one selected folder using a collection-aware
  category plan.
- Automatically scales organization detail with collection size and supports
  safe two-level folder paths for large libraries. Broad AI and investing
  themes expand into more specific leaf folders instead of one catch-all.
- Makes a best-effort folder assignment for every bookmark and prevents selected
  unresolved items from being applied until they are edited or deselected.
- Accepts a plain-language organization instruction, such as “separate AI
  infrastructure from design tools and learning resources.”
- Provides one-click organization presets and can draft an editable instruction
  from the selected scope using Chrome local AI or deterministic metadata rules.
- Writes regular checkpoints so an interrupted scan can resume without starting
  over.
- Shows an editable category and a metadata-grounded reason for every proposed
  move.
- Moves only selected bookmarks and provides an undo action for the last apply.
- Answers follow-up questions using saved titles, URLs, folder paths, organizer
  categories, and recent conversation, with clickable citations and links back
  to relevant bookmarks.
- Keeps up to 12 local conversations with automatic titles, remembered bookmark
  scopes, and up to 20 recent messages per conversation. Conversations can be
  created, reopened, and deleted without an account.
- Includes one-click starter presets for themes, largest topics, VC and investor
  links, AI and developer tools, filing gaps, duplicate review, and two
  organization strategies, so the first result requires no typing.
- Recognizes explicit organization requests in chat and turns them into a
  reviewable organizer setup. It never starts the scan or moves bookmarks from
  the conversation alone.
- Turns exact-duplicate questions into a reversible review: extra copies can be
  moved into `Duplicate Review` only after you inspect the proposal and apply it.

In its default standalone mode, the extension does not fetch bookmarked pages,
use a cloud AI API, require an account, or need an API key. Chrome may download
its on-device model the first time AI is used, but bookmark processing stays on
the device.

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
3. Review the detected page and proposed filing.
4. Optionally expand **Change** to choose another destination, edit the category,
   or improve it with local AI.
5. Select **Save bookmark**.

The extension reads only the active tab’s title and URL after you open the
popup. It does not read the page body.

### Organize a collection

1. Open the popup and select **Open organizer workspace**.
2. Choose all bookmarks or one folder as the scan scope.
3. Choose the destination root and maximum number of categories. New libraries
   default to **Bookmarks Bar**; **Other Bookmarks** remains available for a
   quieter bar. If an organized library already exists, the organizer reuses
   its current root by default and labels it **Existing library**. To change
   roots, use **Move existing library here** so a parallel library is not
   created. Existing folders are never deleted.
4. Choose an instruction preset, draft one from the selected scope, or describe
   the organization you want in your own words.
5. Select **Plan and scan**. Large scopes require confirmation.
6. Pause or close the workspace if needed. Reopening it offers the latest
   completed checkpoint for resumption.
7. Review the before-and-after tree and every proposed move. The tree shows
   how many selected bookmarks leave each current folder and the exact proposed
   hierarchy under the destination. Before review, the organizer automatically
   refines supported oversized folders and safely merges tiny folders in the
   proposal. The plan health panel explains any broad folders that remain and
   offers another manual refinement when bookmark metadata supports one. You
   can also edit categories and deselect anything you do not want moved.
8. Select **Apply selected** only when the revised plan looks right.

Applied bookmarks move into
`<destination root>/AI Organized Bookmarks/<Category>`. The extension never
deletes bookmarks. **Undo last apply** moves bookmarks back to their recorded
folders and leaves empty organizer folders in place.

### Ask your bookmarks

Open **Ask Bookmarks**, choose a scope, and ask questions such as:

- “What NVIDIA developer resources have I saved?”
- “What are the largest themes in this collection?”
- “Which bookmarks appear to be duplicates?”

New users can instead choose any starter preset. Presets submit immediately
against the selected scope; cleanup and organization presets still stop at a
reviewable proposal.

Use **New** to start another conversation. The history rail automatically names
each conversation from its first question and remembers its bookmark scope.
Select a prior conversation to continue it, or **Delete conversation** to remove
the active one. History is stored only in Chrome on this device and is bounded
to the 12 most recent conversations and 20 recent messages in each.

Answers are grounded in bookmark metadata only. The extension does not claim to
have read linked pages. Bracketed citations open the referenced bookmark, and a
collapsible source list exposes the complete supporting set.

Explicit requests such as “Organize my bookmarks into fundraising, AI
infrastructure, and design” produce a **Review setup** action. That action only
prefills the normal organizer scope and instruction. You must still select
**Plan and scan**, review the proposed moves, and select **Apply selected**.

For duplicate questions, **Review cleanup** prepares a normal organizer preview
that moves extra canonical-URL copies into `Duplicate Review`. It never deletes
them, and the resulting moves use the same undo path as other organizer changes.

## Agent Access

Agent Access is an optional local bridge for MCP clients such as Codex and
Claude Code. It does not replace the standalone extension and is off by default.
The extension requests Chrome's optional `nativeMessaging` permission only when
you select **Enable Agent Access** in Settings.

The bridge exposes nine bounded bookmark tools: status, summary, folder list,
metadata search, exact-duplicate review, non-writing plan analysis, prepare
organization, apply a prepared plan, and undo. Plan analysis identifies
oversized and tiny proposed folders before the client prepares anything. It
cannot fetch linked webpages or delete bookmarks. Agent writes remain disabled
unless you choose **Allow reviewed changes**; an agent must prepare an expiring
plan before it can apply moves.

### Install the macOS companion

The first companion release supports macOS and Node.js 20 or newer. Find the
extension ID on its `chrome://extensions` card, then run:

```bash
npx --yes @lucitra/bookmark-agent-companion@1.3.6 setup \
  --extension-id YOUR_32_CHARACTER_EXTENSION_ID
```

The installer copies the audited dependency-free runtime into an owner-only
local application directory, so moving or deleting the checkout afterward does
not break Chrome's native host.

Restart Chrome, open the extension's **Settings**, and select **Enable Agent
Access**. Choose a bookmark scope and leave the access mode at **Read-only**
until you intentionally want an agent to prepare and apply reversible moves.

Register the MCP command with Codex:

```bash
codex mcp add lucitra-bookmarks -- \
  npx --yes @lucitra/bookmark-agent-companion@1.3.6 \
  mcp --client codex
```

Or register it with Claude Code:

```bash
claude mcp add --transport stdio --scope user lucitra-bookmarks -- \
  npx --yes @lucitra/bookmark-agent-companion@1.3.6 \
  mcp --client claude
```

Codex and Claude may use remote models even though the MCP process and Chrome
bridge run locally. Before either client receives bookmark metadata, select that
provider in Settings and affirm the disclosure. The approved provider may
receive titles, URLs, folder paths, organizer categories, and instructions from
the selected scope. Lucitra does not operate an intermediary cloud service.

To revoke access, select **Disable and revoke** in Settings. To remove the native
host registration and its local token completely, run:

```bash
npx --yes @lucitra/bookmark-agent-companion@1.3.6 uninstall
```

The full [installation guide](https://lucitra.github.io/ai-bookmark-organizer/installation.html)
includes verification, update, privacy-boundary, and troubleshooting steps.

## Local AI and fallback behavior

AI Bookmark Organizer checks Chrome’s local AI APIs in this order:

1. `LanguageModel`
2. `window.ai.languageModel`
3. `chrome.aiOriginTrial.languageModel`

Chrome 138 or newer and supported hardware are required for the Prompt API.
Chrome documents current requirements in
[Get started with built-in AI](https://developer.chrome.com/docs/ai/get-started).

If local AI is unavailable, the extension clearly shows **Local rules**. Quick-save
and organization then use deterministic metadata rules. Bookmark Q&A returns
the strongest metadata matches and category summary instead of a generated
answer.

## Privacy and permissions

The packaged extension requires only:

- `activeTab` — temporarily reads the current tab’s title and URL after the user
  opens the extension so that page can be saved.
- `bookmarks` — reads bookmark metadata, creates bookmarks and organizer
  folders, and moves only user-approved bookmarks.
- `storage` — saves scan checkpoints, editable previews, bounded bookmark chat
  history, and the last undo record on the device.

It optionally requests:

- `nativeMessaging` — connects to the separately installed companion on the
  same computer after the user explicitly enables Agent Access.

There are no host permissions, remote resources, remote code, analytics,
accounts, or network APIs in the packaged extension. A small service worker is
used only to maintain the opt-in Chrome Native Messaging connection and enforce
the saved access policy. External processing occurs only when the user separately
connects and authorizes a provider such as Codex or Claude.

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
- [Chat system defaults](./research/CHAT_SYSTEM_DEFAULTS.md) — the durable
  conversation-history, action-safety, retention, and privacy contract for this
  extension and future Lucitra chat surfaces.
- [Product UI patterns](./research/PRODUCT_UI_PATTERNS.md) — the task-first mode,
  record, property, proposal, and command primitives used to keep the product
  simple as bookmark and future CRM capabilities expand.

To run the complete automated verification:

```bash
node --test test/*.test.cjs
node scripts/validate-extension.mjs
cd companion && npm ci --ignore-scripts && npm test && cd ..
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
   git tag -a v1.3.6 -m "AI Bookmark Organizer v1.3.6"
   git push origin v1.3.6
   ```

6. Approve and verify the npm companion publication, then re-run the Pages
   workflow. Pages intentionally refuses to deploy an installation guide until
   its pinned companion version is public.

The release workflow publishes the exact allowlisted package, checksums, and
build provenance. The npm workflow requires the protected `npm` environment and
the repository variable `NPM_PUBLISH_ENABLED=true`. Do not move an existing
version tag.

## Project files

- `manifest.json` — Manifest V3 configuration and minimal permissions.
- `lucitra.css` — shared Lucitra design foundations used by both extension
  surfaces.
- `shared.js` — local AI adapters, prompt boundaries, bookmark helpers, parsing,
  and deterministic fallback logic.
- `agent-core.js` and `service-worker.js` — access policy, bounded agent methods,
  native bridge lifecycle, reviewed plans, apply, and undo.
- `popup.*` — quick-save current-page experience.
- `workspace.*` — persistent organizer and metadata-only bookmark Q&A.
- `settings.*` — explicit Agent Access, scope, write-policy, and external-provider
  consent controls.
- `companion/` — dependency-free MCP server, authenticated local socket bridge,
  macOS Native Messaging installer, and isolated tests.
- `test/` — deterministic bookmark-tree fixtures and core tests.
- `scripts/` — package policy validation and reproducible release build.
- `research/` — source-backed future product research, outside the current
  extension scope.
