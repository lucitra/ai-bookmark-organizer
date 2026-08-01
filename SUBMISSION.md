# Chrome Web Store Submission — v1.2.0

Work down this page in order. Listing values below are copied from
`STORE_LISTING.md`; do not reword permission justifications or the single-purpose
statement in the dashboard.

## 1. Release gate

- **Package:** `dist/ai-bookmark-organizer-1.2.0.zip`
- **Manifest version:** `1.2.0`
- **Visibility:** Public
- **BLOCKED — live privacy page is stale:**
  `https://lucitra.ai/tools/ai-bookmark-organizer/privacy/` returns HTTP 200 but
  still says all bookmark processing is local and does not disclose Agent
  Access, optional Native Messaging, external provider consent, or revocation.
  Publish the current `PRIVACY.md` before uploading this version.
- **BLOCKED — screenshots:** `store-assets/screenshot-1.png` shows an older UI.
  Replace it with real v1.2 captures of quick save, populated organizer preview,
  Ask Bookmarks with sources, Agent Access settings, and the resulting
  `chrome://bookmarks` folder structure.
- **BLOCKED — Privacy practices category mapping:** confirm the current Web Store
  user-data category selections for bookmark titles, URLs, folder paths,
  categories, and instructions that a user may direct to an approved external
  model provider. Lucitra does not receive the data, but the optional transfer
  must still be disclosed accurately.
- **BLOCKED — platform support copy:** the companion installer currently supports
  macOS only. Keep Agent Access described as optional; do not imply Windows or
  Linux companion support until installers exist.

Do not upload the package until the privacy page and screenshots are current,
the dashboard category mapping is resolved, and isolated Chrome QA passes.

## 2. Store listing

**Name**

AI Bookmark Organizer

**Summary**

Save, organize, and search Chrome bookmarks locally with Chrome Built-in AI.

**Category**

Productivity

**Language**

English

**Detailed description**

AI Bookmark Organizer is a local-first workspace for saving pages, organizing
bookmark collections, and finding useful links again.

Save the current page into a chosen folder with an optional category suggestion.
For an existing collection, choose all bookmarks or one folder, describe the
organization you want, and generate a collection-aware plan. Review an editable
category and a metadata-grounded reason for every proposed move before applying
anything.

The organizer checkpoints each completed batch, so a closed or interrupted
workspace can resume from its latest checkpoint. Apply only selected changes,
and use Undo last apply to move bookmarks back to their recorded folders.

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
Fallback and uses deterministic metadata rules.

## 3. URLs

**Homepage URL**

https://lucitra.github.io/ai-bookmark-organizer/

**Support URL**

https://github.com/lucitra/ai-bookmark-organizer/issues

**Privacy policy URL**

https://lucitra.ai/tools/ai-bookmark-organizer/privacy/

## 4. Privacy practices

**Single purpose**

Save, categorize, reorganize, and search a user's Chrome bookmarks while keeping
the user in control of every bookmark change.

**Permission justification — activeTab**

Temporarily reads the title and URL of the current tab after the user opens the
extension, so the page can be saved as a bookmark. Access is limited to that
user gesture; the extension does not read page content.

**Permission justification — bookmarks**

Reads bookmark titles, URLs, and folder structure to build category suggestions
and answer metadata-based questions. Creates bookmarks and organizer folders,
and moves bookmarks only after the user reviews and approves the selected
changes. The extension never deletes bookmarks.

**Permission justification — storage**

Stores scan checkpoints, category plans, editable previews, recent bookmark
questions and answers, and the last apply record in `chrome.storage.local`.
This lets the user resume interrupted work and undo the most recent bookmark
moves. The data remains on the device.

**Permission justification — nativeMessaging (optional)**

Connects the extension to the separately installed open-source Lucitra companion
on the same computer so a user-approved MCP client can search bookmark metadata
or prepare and apply reviewed bookmark changes. Chrome requests this permission
only after the user selects Enable Agent Access, and the user can revoke it from
Settings. The companion exposes no public server or inbound network port.

**Remote code**

No, I am not using remote code.

**Data collected by the developer**

No user data is collected by the developer.

**BLOCKED — user-data categories and disclosures**

Resolve the current dashboard category mapping before selecting answers. The
listing and privacy policy disclose that an approved external MCP client may
send bookmark titles, URLs, folder paths, organizer categories, and user
instructions from the approved scope to the provider selected by the user.
Lucitra does not operate an intermediary cloud service or receive that data.

**Data-use certifications**

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's
  single purpose.
- Data is not used or transferred to determine creditworthiness or for lending.
- The extension complies with the Chrome Web Store Limited Use requirements.

## 5. Distribution

**Visibility**

Public

**Regions**

All regions offered by the Chrome Web Store.

**Pricing**

Free

## 6. Graphic assets

| Dashboard field | File | Dimensions | Status |
| --- | --- | ---: | --- |
| Store icon | `store-assets/icon-128.png` | 128×128 PNG | Ready |
| Screenshot 1 | `store-assets/screenshot-1.png` | 1280×800 PNG | BLOCKED — older UI |
| Small promo tile | `store-assets/small-promo.png` | 440×280 PNG | Ready |
| Marquee promo tile | `store-assets/marquee.png` | 1400×560 PNG | Ready, optional |

Capture replacement screenshots at exactly 1280×800 with square corners and
full bleed. Do not fabricate or composite product UI.

## 7. Reviewer test instructions

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
Fallback. Quick-save and organization use deterministic local metadata rules,
and Ask Bookmarks returns the strongest metadata matches. This is expected and
is disclosed in the listing.
