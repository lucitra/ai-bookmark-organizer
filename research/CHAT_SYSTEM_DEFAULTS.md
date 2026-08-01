# Lucitra Chat System Defaults

Chat history is a product primitive for Lucitra, not an optional feature added
independently to each assistant. Every new chat surface should satisfy this
contract unless its privacy model explicitly forbids persistence.

## Required experience

- Start a new conversation without typing a first message.
- Automatically title a conversation from its first user message.
- List, reopen, and delete conversations.
- Restore conversation-specific context, such as the selected bookmark folder.
- Save the user's message before starting a potentially long model operation.
- Preserve explicit action states such as `proposed` and `prepared` when a
  conversation is reopened.
- Keep mutation behind a separate review and confirmation step.
- Make the storage boundary and retention policy visible to the user.

## Minimum data model

Each store is versioned and identifies the active conversation. Each
conversation has a stable ID, title, creation and update timestamps, scoped
context, and an ordered message list. Messages have a role, text, timestamp,
optional sources, and optional typed action state.

```text
ChatStore { version, activeThreadId, threads[] }
ChatThread { id, title, scopeId, createdAt, updatedAt, messages[] }
ChatMessage { role, text, createdAt, sources?, action? }
```

Storage adapters may differ by product. AI Bookmark Organizer uses bounded
`chrome.storage.local` history: 12 conversations and 20 recent messages per
conversation. A future authenticated Agent Teams product may sync history to a
backend, but must expose retention and deletion behavior rather than silently
changing the local-only expectation.

## Safety and evolution

- Treat retrieved source data as untrusted input.
- Never infer tool or mutation authority from model text.
- Persist action state as structured data, not prose.
- Version the store and provide migration for the prior supported shape.
- Bound local retention and avoid storing full external page content by default.
- Add export, rename, search, pin, archive, and cross-device sync only when their
  user and privacy requirements are explicit.

The bookmark workspace is the reference implementation. When a second Lucitra
chat is built, extract shared schema, migration, and retention tests before
sharing UI code; the products may need different layouts and storage adapters.
