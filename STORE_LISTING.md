# Chrome Web Store Listing

## Product Details

**Name:** AI Bookmark Organizer

**Summary:** Organize Chrome bookmarks locally with Chrome Built-in AI.

**Category:** Productivity

**Language:** English

**Detailed description:**

AI Bookmark Organizer turns an unstructured bookmark collection into clear,
general-purpose folders with Chrome's on-device language model.

Select Scan & Organize Bookmarks to generate a complete preview. Review the
suggested category beside every bookmark, then apply the changes only when they
look right. The extension creates an AI Organized Bookmarks folder with category
subfolders and moves the approved bookmarks into them.

- Preview every proposed change before it is applied
- Process bookmark titles and URLs locally on your device
- No account, API key, subscription, or cloud AI service
- Restore the latest completed preview if the popup is closed
- Never delete bookmarks

Chrome Built-in AI requires Chrome 138 or newer and a supported desktop or
Chromebook Plus device. If local AI is unavailable, the extension clearly shows
Fallback and labels scan results Uncategorized.

## URLs

**Homepage:** https://lucitra.github.io/ai-bookmark-organizer/

**Support:** https://github.com/lucitra/ai-bookmark-organizer/issues

**Privacy policy:** https://lucitra.ai/tools/ai-bookmark-organizer/privacy/

## Single Purpose

Categorize and reorganize a user's Chrome bookmarks with Chrome's on-device
language model, after showing a preview and receiving the user's approval.

## Permission Justifications

**bookmarks**

Reads bookmark titles, URLs, and folder structure to generate category
suggestions. Creates organizer folders and moves bookmarks only after the user
selects Apply Changes.

**storage**

Stores the latest completed scan preview in `chrome.storage.local` so the user
can close and reopen the popup before applying it. The preview is cleared after
the changes are applied or replaced by a later scan.

## Privacy Practices

- The extension does not contain remote code.
- The extension does not transmit bookmark data off the device.
- The developer does not collect user data through the extension.
- Bookmark data is used only for the extension's stated single purpose.
- Bookmark data is not sold, shared, or used for advertising or profiling.
- The extension complies with the Chrome Web Store Limited Use requirements.

When the dashboard distinguishes between local access and developer collection,
select **no data collected** for the current implementation and describe the
local bookmark access in the permission justifications and privacy policy.

## Distribution

Recommended first release: **Public**.

Use the ZIP produced by the tagged GitHub release. The published GitHub release
is immutable and contains the same versioned package, checksums, and build
provenance used for the Chrome Web Store submission.

## Reviewer Test Instructions

1. Install the extension in Chrome 138 or newer on a device that supports Chrome
   Built-in AI.
2. Add two test bookmarks with distinct subjects, such as a recipe and a
   technology article.
3. Open AI Bookmark Organizer and confirm the badge shows AI Ready. The first
   run may download Chrome's local model.
4. Select Scan & Organize Bookmarks and keep the popup open.
5. Confirm both bookmarks appear in Preview with suggested categories.
6. Select Apply Changes.
7. Confirm Chrome contains an AI Organized Bookmarks folder with category
   subfolders and the two test bookmarks.

If the review device does not support Chrome Built-in AI, the badge shows
Fallback and the scan uses Uncategorized. This is expected and is disclosed in
the listing.
