# Local Development

The packaged extension has no build-time or runtime dependencies. The files in
the repository root are the unpacked extension. The optional companion is a
separate dependency-free Node.js package under `companion/`.

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
   node --check service-worker.js
   node --test test/*.test.cjs
   node scripts/validate-extension.mjs
   node scripts/validate-site.mjs
   (cd companion && npm ci --ignore-scripts && npm run check && npm test)
   ```

3. Reload the unpacked extension.
4. Exercise the changed flow using only the QA bookmark folder.
5. Inspect popup/workspace errors from the extension card’s developer links.
6. Run `./scripts/validate-release.sh` before committing.

## Manual acceptance checks

- Quick save reads only the current tab title and URL, pre-fills a local category,
  and creates the bookmark in the selected destination without editable title or
  URL fields.
- A folder-scoped scan never includes bookmarks outside the chosen folder.
- Organizer instruction presets fill the editable instruction without starting
  a scan; Draft from scope uses only local bookmark metadata and has a useful
  deterministic fallback when Chrome local AI is unavailable.
- Closing the workspace after a completed batch preserves the checkpoint;
  reopening marks the job paused and Resume continues from it.
- Pause, Resume, and Cancel leave a coherent saved state.
- Preview category edits and selections survive reopening.
- Apply moves only selected bookmarks.
- Undo restores moved bookmarks to their recorded parent folders.
- Ask Bookmarks returns metadata-grounded results with safe source links.
- Chat history migrates the previous single transcript, creates automatic
  titles, restores each conversation's bookmark scope, switches without mixing
  messages, and deletes only the selected local conversation.
- A blank active conversation is reused instead of creating repeated empty
  threads; retention stays capped at 12 conversations and 20 messages each.
- Every starter preset submits on selection, and the preset set includes normal
  questions, duplicate review, and organization setup paths.
- Bracketed answer citations open the matching source and source numbering stays
  aligned when the model cites only a subset of the supplied context.
- An explicit organization request in chat offers a review action that prefills
  organizer setup without starting a scan or moving bookmarks.
- Exact-duplicate questions offer a review action that prepares reversible moves
  into `Duplicate Review`; distinct query URLs are not treated as duplicates.
- Fallback mode remains useful when Chrome Built-in AI is unavailable.
- Agent Access is Off and read-only by default; declining the optional Native
  Messaging permission does not affect standalone organizer behavior.
- Enabling Agent Access connects only to the installed `ai.lucitra.bookmarks`
  native host, and disabling it revokes the optional Chrome permission.
- Folder scope is enforced in Chrome for summary, search, duplicate review, and
  organization plans.
- Codex and Claude requests remain blocked until the matching provider has
  current explicit consent.
- An agent cannot apply arbitrary moves: it must apply an unexpired prepared
  plan, each bookmark must still be in its recorded original folder, and the
  resulting transaction is undoable.
- Agent tools never fetch linked webpages or delete bookmarks.

## Package policy

`release-files.txt` is the complete packaged-extension allowlist. The validator
rejects:

- any background entry other than the local policy-enforcing service worker;
- host permissions or optional permissions other than `nativeMessaging`;
- remote runtime resources or inline scripts;
- network APIs, dynamic imports, `eval`, or `new Function`;
- missing, extra, traversing, or symlinked package paths;
- icon dimension mismatches.

`lucitra.css` is the packaged design-system foundation. `docs/lucitra.css`
mirrors those tokens for GitHub Pages, and `scripts/validate-site.mjs` rejects
token drift, remote runtime assets, duplicate IDs, missing product links, and
key text-color combinations below WCAG AA contrast.

Adding another permission, dependency, remote resource, network API, native
method, or background execution model requires an explicit product/privacy
review before implementation.

## Companion development

The companion supports macOS and Node.js 20 or newer. Do not test installation
against the real Chrome profile in automated tests. The installer honors
`LUCITRA_BOOKMARKS_HOME`; tests use an isolated temporary home and verify file
permissions, allowed extension origins, token authentication, message framing,
the complete MCP tool registry, and an end-to-end socket/native-host round trip.

```bash
cd companion
npm ci --ignore-scripts
npm run check
npm test
```

For a manual QA profile, copy its 32-character extension ID from
`chrome://extensions` and run:

```bash
node companion/scripts/install-host.mjs --extension-id EXTENSION_ID
```

This creates `~/.lucitra-bookmarks/` with owner-only configuration and registers
`ai.lucitra.bookmarks` in Chrome's per-user Native Messaging host directory. The
installer copies the allowlisted runtime into `~/.lucitra-bookmarks/app/`; it
does not execute from the repository after installation. Restart Chrome after
installing. Remove it with:

```bash
node companion/scripts/uninstall-host.mjs
```

## Companion publishing

`@lucitra/bookmark-agent-companion` is published independently from the Chrome
ZIP, but its version must match `manifest.json`. `scripts/validate-release.sh`
enforces the match and inspects the npm tarball before either artifact ships.

Automated publishing uses npm trusted publishing in
`.github/workflows/publish-npm.yml`; no npm token belongs in GitHub Secrets. The
workflow is pinned to a specific Node.js runtime and immutable action commits,
runs the complete release validation, requires the `npm` GitHub environment,
and receives only `contents: read` and `id-token: write` permissions.

The npm package must exist before npm lets a maintainer configure a trusted
publisher. For the first release only:

1. Confirm the release commit is on `main` and all validation is green.
2. From `companion/`, run `npm login --auth-type=web`, then
   `npm publish --access public`. Complete npm's browser/2FA prompt. Do not create
   or store a classic automation token.
3. In the npm package settings, add the GitHub Actions trusted publisher with
   organization or user `lucitra`, repository `ai-bookmark-organizer`, workflow
   filename `publish-npm.yml`, and environment `npm`.
4. Create a protected GitHub environment named `npm` and require a reviewer.
5. Set the repository variable `NPM_PUBLISH_ENABLED` to `true` for later tagged
   releases.

The first manual publish is the only unautomated exception. Later `vX.Y.Z` tags
publish the matching extension release and npm companion from GitHub Actions;
npm generates provenance for the trusted publication.

The cross-product chat contract lives in
[`research/CHAT_SYSTEM_DEFAULTS.md`](./research/CHAT_SYSTEM_DEFAULTS.md). Keep
the data model and user controls consistent when another Lucitra chat surface is
introduced; share code only once a second implementation proves the common API.

## Release artifact

```bash
./scripts/build-release.sh
unzip -Z1 dist/ai-bookmark-organizer-1.2.0.zip
shasum -a 256 dist/ai-bookmark-organizer-1.2.0.zip
```

Never load `dist/` itself as an unpacked extension. Unzip the versioned archive
and select the directory containing its `manifest.json`.
