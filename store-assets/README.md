# Chrome Web Store Assets

These assets use the AI Bookmark Organizer product mark and the Lucitra brand
palette:

- `icon-128.png` is the 128×128 listing icon. It contains 96×96 artwork with
  16 px of transparent padding on each side and is not interchangeable with
  the packaged `icons/icon-128.png`.
- `screenshot-*.png` files are real 1280×800 product captures.
- `small-promo.png` is the 440×280 promotional tile.
- `marquee.png` is the optional 1400×560 marquee promotional tile.

The editable SVG sources are committed beside the exported PNG files.

The padded store icon source is `store-assets/icon.svg`. The extension's
production mark remains `brand/logo.svg`.

## Rebuilding product screenshots

The repository includes a project-specific real-Chrome capture harness at
`skills/capture-bookmark-marketing/`. It loads the actual unpacked extension in
an isolated Chrome for Testing profile, creates synthetic public bookmarks,
runs the real scan/chat/apply flows, and captures the resulting product UI. It
never opens the developer's normal Chrome profile.

From the repository root:

```bash
npm --prefix skills/capture-bookmark-marketing/scripts ci
npm --prefix skills/capture-bookmark-marketing/scripts run qa:large
npm --prefix skills/capture-bookmark-marketing/scripts run qa:ask-large
npm --prefix skills/capture-bookmark-marketing/scripts run capture
npm --prefix skills/capture-bookmark-marketing/scripts run verify
```

Review every file under `store-assets/generated/`. After visual approval,
promote the verified set into the submission filenames:

```bash
npm --prefix skills/capture-bookmark-marketing/scripts run promote
```

The required images show the populated organizer preview, a grounded duplicate
review in chat, Agent Access in its default Off state, and a successful apply.
When Chrome permits internal-page automation, the fifth image shows the real
resulting folder structure in `chrome://bookmarks`.

Never fabricate, composite, retouch, or populate screenshots with personal
bookmark data. The exact capture contract is documented in
`skills/capture-bookmark-marketing/references/capture-contract.md`.
