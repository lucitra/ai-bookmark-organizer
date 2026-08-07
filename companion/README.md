# Lucitra Bookmark Agent Companion

The optional local companion for
[AI Bookmark Organizer](https://github.com/lucitra/ai-bookmark-organizer). It
connects an explicitly approved Chrome extension to MCP clients such as Codex
and Claude Code through Chrome Native Messaging.

The Chrome extension works without this package. Install the companion only
when you want a local agent client to search bookmark metadata or prepare
reviewable bookmark changes.

The MCP surface includes a non-writing plan analysis tool that flags oversized
and tiny proposed folders before a client stores an expiring organization plan.
Plans support up to 2,000 bookmark assignments and 40 two-level leaf folders.

## Requirements

- macOS
- Node.js 20 or newer
- AI Bookmark Organizer installed in Google Chrome

## Setup

Copy the 32-character ID from the extension card at `chrome://extensions`, then
run:

```bash
npx --yes @lucitra/bookmark-agent-companion@1.3.6 setup \
  --extension-id YOUR_EXTENSION_ID
```

Restart Chrome, open the extension's Settings, and enable **Agent Access**.
Agent Access is read-only by default.

Register the MCP server with Codex:

```bash
codex mcp add lucitra-bookmarks -- \
  npx --yes @lucitra/bookmark-agent-companion@1.3.6 \
  mcp --client codex
```

Or with Claude Code:

```bash
claude mcp add --transport stdio --scope user \
  lucitra-bookmarks -- \
  npx --yes @lucitra/bookmark-agent-companion@1.3.6 \
  mcp --client claude
```

Check the local registration:

```bash
npx --yes @lucitra/bookmark-agent-companion@1.3.6 doctor
```

See the complete
[installation and troubleshooting guide](https://lucitra.github.io/ai-bookmark-organizer/installation.html).

## Security and privacy

- No runtime dependencies, install hooks, public server, or inbound network
  port.
- Setup copies the allowlisted runtime into an owner-only local directory and
  creates a random local authentication token.
- Chrome accepts the native host only from the extension ID supplied during
  setup.
- The extension enforces folder scope, provider consent, and write policy.
- Bookmark writes require an unexpired prepared plan and remain undoable.
- Plan analysis and preparation do not move bookmarks; apply is a separate tool.
- The tools cannot fetch bookmarked pages or delete bookmarks.

Codex, Claude, or another MCP client may use a remote model. Bookmark metadata
leaves the device only after that provider is explicitly enabled in extension
Settings.

## Remove

Disable and revoke Agent Access in extension Settings, then run:

```bash
npx --yes @lucitra/bookmark-agent-companion@1.3.6 uninstall
```

The package is MIT licensed. Security issues can be reported through the
[repository's security policy](https://github.com/lucitra/ai-bookmark-organizer/security/policy).
