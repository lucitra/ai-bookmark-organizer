# Chrome Web Store Submission — v1.1.0

Work down this page in order. Values below match `STORE_LISTING.md`.

## Release gate

- **Package:** `dist/ai-bookmark-organizer-1.1.0.zip`
- **Manifest version:** `1.1.0`
- **Visibility:** Public
- **BLOCKED — privacy page content:** The URL returns HTTP 200, but the live
  policy still describes v1.0. Update it to match `PRIVACY.md`, including
  `activeTab`, current-page capture, checkpoints, Q&A history, and undo state.
- **BLOCKED — screenshots:** `store-assets/screenshot-1.png` is a real v1.0
  capture. Replace it with real v1.1 captures of the quick-save popup,
  populated organizer preview, Ask Bookmarks with sources, and resulting
  `chrome://bookmarks` folder structure.

Do not upload the package until both BLOCKED items are cleared and isolated
Chrome QA passes.

## Store listing

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

- Save and categorize the current page
- Organize all bookmarks or one selected folder
- Guide organization with a plain-language instruction
- Pause and resume checkpointed scans
- Edit every category before applying selected moves
- Undo the last set of bookmark moves
- Ask metadata-grounded questions with bookmark source links
- No account, API key, subscription, analytics, or cloud AI service
- Never delete bookmarks

Chrome Built-in AI requires Chrome 138 or newer and a supported desktop or
Chromebook Plus device. If local AI is unavailable, the extension clearly shows
Fallback and uses deterministic metadata rules.

## URLs

**Homepage URL**

https://lucitra.github.io/ai-bookmark-organizer/

**Support URL**

https://github.com/lucitra/ai-bookmark-organizer/issues

**Privacy policy URL**

https://lucitra.ai/tools/ai-bookmark-organizer/privacy/

## Privacy practices

**Single purpose**

Save, categorize, reorganize, and search a user's Chrome bookmarks locally,
while keeping the user in control of every bookmark change.

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

**Remote code**

No, I am not using remote code.

**Data collected**

No user data is collected by the developer.

**Data-use certifications**

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to the extension's
  single purpose.
- Data is not used or transferred to determine creditworthiness or for lending.
- The extension complies with the Chrome Web Store Limited Use requirements.

## Distribution

**Visibility**

Public

**Regions**

All regions offered by the Chrome Web Store.

**Pricing**

Free

## Graphic assets

| Dashboard field | File | Dimensions | Status |
| --- | --- | ---: | --- |
| Store icon | `store-assets/icon-128.png` | 128×128 PNG | Ready |
| Screenshot 1 | `store-assets/screenshot-1.png` | 1280×800 PNG | BLOCKED — v1.0 UI |
| Small promo tile | `store-assets/small-promo.png` | 440×280 PNG | Ready |
| Marquee promo tile | `store-assets/marquee.png` | 1400×560 PNG | Ready, optional |

Capture replacement screenshots at exactly 1280×800 with square corners and
full bleed. Do not fabricate or composite product UI.

## Reviewer test instructions

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

If the review device does not support Chrome Built-in AI, the badge shows
Fallback. Quick-save and organization use deterministic local metadata rules,
and Ask Bookmarks returns the strongest metadata matches. This is expected and
is disclosed in the listing.
