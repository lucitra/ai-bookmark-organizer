# Chrome Web Store Listing

## Product Details

**Name:** AI Bookmark Organizer

**Summary:** Save, organize, and search Chrome bookmarks locally with Chrome Built-in AI.

**Category:** Productivity

**Language:** English

**Detailed description:**

AI Bookmark Organizer is a local-first workspace for saving pages, organizing
bookmark collections, and finding useful links again.

Save the current page into a chosen folder with an optional category suggestion.
For an existing collection, choose all bookmarks or one folder, describe the
organization you want, and generate a collection-aware plan. Review an editable
category and a metadata-grounded reason for every proposed move before applying
anything.

Automatic detail scales with the selected collection. Large libraries can use
two-level folder paths so broad themes stay navigable without forcing hundreds
of bookmarks into one flat category. Broad AI and investing themes expand into
more specific leaf folders instead of one catch-all. The organizer makes a
best-effort folder assignment for every bookmark and clearly holds any unresolved
item for review.

The organizer writes regular checkpoints, so a closed or interrupted workspace
can resume from its latest checkpoint. Apply only selected changes, and use Undo
last apply to move bookmarks back to their recorded folders.

Ask Bookmarks answers questions from saved titles, URLs, folder paths, and
organizer categories, with links back to relevant bookmarks. It does not fetch
or read the linked webpages.

The standalone organizer is local by default. Advanced users can optionally
install the open-source Lucitra companion and enable Agent Access for bounded
bookmark tools in MCP clients. Agent Access is scoped, revocable, read-only by
default, and requires a prepared review plan before an approved client can apply
bookmark moves. External model providers remain blocked until the user selects
and separately authorizes each provider in Settings.

- Save and categorize the current page
- Organize all bookmarks or one selected folder
- Choose Bookmarks Bar or Other Bookmarks while reusing an existing organized library
- Scale automatically from a small flat plan to two-level folders for large libraries
- Expand broad AI and investing themes into granular leaf folders
- Automatically refine oversized folders and safely merge tiny folders before review
- Make a best-effort folder assignment for every bookmark
- Guide organization with a plain-language instruction
- Pause and resume checkpointed scans
- Edit every category before applying selected moves
- Undo the last set of bookmark moves
- Ask metadata-grounded questions with bookmark source links
- No Lucitra account, API key, subscription, analytics, or required cloud AI
  service
- Optional, explicitly approved local-agent bridge
- Never delete bookmarks

Chrome Built-in AI requires Chrome 138 or newer and a supported desktop or
Chromebook Plus device. If local AI is unavailable, the extension clearly shows
Local rules and uses deterministic metadata rules.

## URLs

**Homepage:** https://lucitra.github.io/ai-bookmark-organizer/

**Support:** https://github.com/lucitra/ai-bookmark-organizer/issues

**Privacy policy:** https://lucitra.ai/tools/ai-bookmark-organizer/privacy/

## Single Purpose

Save, categorize, reorganize, and search a user's Chrome bookmarks while keeping
the user in control of every bookmark change.

## Permission Justifications

**activeTab**

Temporarily reads the title and URL of the current tab after the user opens the
extension, so the page can be saved as a bookmark. Access is limited to that
user gesture; the extension does not read page content.

**bookmarks**

Reads bookmark titles, URLs, and folder structure to build category suggestions
and answer metadata-based questions. Creates bookmarks and organizer folders,
and moves bookmarks only after the user reviews and approves the selected
changes. The extension never deletes bookmarks.

**storage**

Stores scan checkpoints, category plans, editable previews, recent bookmark
questions and answers, and the last apply record in `chrome.storage.local`.
This lets the user resume interrupted work and undo the most recent bookmark
moves. The data remains on the device.

**nativeMessaging (optional)**

Connects the extension to the separately installed open-source Lucitra companion
on the same computer so a user-approved MCP client can search bookmark metadata
or prepare and apply reviewed bookmark changes. Chrome requests this permission
only after the user selects Enable Agent Access, and the user can revoke it from
Settings. The companion exposes no public server or inbound network port.

## Privacy Practices

- The extension does not contain remote code.
- The extension does not request host permissions.
- The extension does not fetch or read bookmarked webpages.
- Standalone bookmark processing remains on the device.
- Agent Access is off by default and uses an optional Chrome permission.
- A separately approved external MCP client may send bookmark titles, URLs,
  folder paths, organizer categories, and user instructions from the approved
  scope to the provider selected by the user.
- Lucitra does not operate an intermediary cloud service or receive that data.
- The developer does not collect user data through the extension.
- Bookmark and active-tab data are used only for the extension's stated single
  purpose.
- Data is not sold, shared, or used for advertising, profiling, credit, or
  lending decisions.
- The extension complies with the Chrome Web Store Limited Use requirements.

The dashboard's user-data category selections must accurately disclose the
optional user-directed transfer to an approved external model provider even
though Lucitra does not receive the data. Confirm the current Chrome Web Store
category mapping before submission; do not rely only on the developer-collection
question.

## Distribution

Recommended release: **Public**.

Use the ZIP produced by the tagged GitHub release. The published GitHub release
is immutable and contains the same versioned package, checksums, and build
provenance used for the Chrome Web Store submission.

## Reviewer Test Instructions

1. Install the extension in Chrome 138 or newer.
2. Open an ordinary HTTPS page, open AI Bookmark Organizer, and confirm its
   title and URL appear in the quick-save popup.
3. Select a destination and save the page. Confirm the bookmark was created.
4. Add a test folder containing three bookmarks with distinct subjects.
5. Open the organizer workspace and select only that test folder as the scope.
6. Add an optional organization instruction, then select Plan and scan.
7. Confirm all test bookmarks appear with editable categories and reasons.
8. Close and reopen the workspace, then resume if the scan was not complete.
9. Select Apply selected and confirm the bookmarks move into
   `AI Organized Bookmarks/<Category>` under the chosen destination.
10. Select Undo last apply and confirm the bookmarks return to their previous
    folder.
11. Open Ask Bookmarks, scope it to the test folder, and ask about a topic in the
    saved titles. Confirm the answer includes bookmark source links.
12. Open Settings and confirm Agent Access is Off by default. Select Enable
    Agent Access, decline the optional Chrome permission, and confirm the local
    organizer remains available.

If the review device does not support Chrome Built-in AI, the badge shows
Local rules. Quick-save and organization use deterministic local metadata rules,
and Ask Bookmarks returns the strongest metadata matches. This is expected and
is disclosed in the listing.
