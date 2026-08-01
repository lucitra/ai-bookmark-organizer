# Product UI Patterns for AI Bookmark Organizer

This review combines the bookmark behaviors already observed in the product
(large mixed collections, companies and investors, AI and developer tools,
research, loose bookmarks, and duplicates) with official interaction patterns
from Superhuman, Grammarly, Notion, and Linear.

## Product position

AI Bookmark Organizer should be opinionated about the workflow while remaining
open-ended about the user's subject matter:

1. **Save** the current page into a useful place.
2. **Organize** an existing collection through a reversible proposal.
3. **Ask** questions and prepare actions from bookmark metadata.

These are stable product modes, not promotional feature cards. Future CRM
capabilities should attach properties and actions to the same saved records
rather than add another competing home screen.

## Patterns to adopt

### Superhuman: one task, universal actions

Superhuman emphasizes a clutter-free current view and makes broader capability
discoverable through commands and shortcuts. For this product, the active mode
should dominate, while other modes recede into a small stable switcher. Every
important action should eventually have a command and keyboard route.

Sources:

- https://help.superhuman.com/hc/en-us/articles/46005789591693-Speed-Up-With-Shortcuts
- https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/

### Grammarly: contextual proposals, explicit acceptance

Grammarly presents suggestions in the context where they matter and requires the
user to accept or dismiss them. Bookmark AI should propose categories, cleanup,
and organization actions where the user is already working; AI text should never
be treated as mutation authority.

Sources:

- https://support.grammarly.com/hc/en-us/articles/115000091592-How-does-Grammarly-s-browser-extension-work-
- https://support.grammarly.com/hc/en-us/articles/4412816078349-Grammarly-for-Windows-and-Grammarly-for-Mac-user-guide

### Notion: records, properties, and progressive disclosure

Notion treats each item as a record with properties and allows unused properties
to be hidden. A bookmark should likewise have a stable record model: title and
source now; folder and category as current properties; optional CRM properties
later. The save surface should show only the properties needed for the current
decision.

Sources:

- https://www.notion.com/help/intro-to-databases
- https://www.notion.com/help/guides/database-properties-help-organize-your-teams-information

### Linear: purpose-built defaults and earned visual weight

Linear argues for purpose-built workflows, "simple first, then powerful," and
visual hierarchy where supporting navigation does not compete with the task.
The bookmark product should provide good defaults, reversible actions, focused
views, and advanced controls on demand instead of asking users to design their
own system before saving a link.

Sources:

- https://linear.app/method/introduction
- https://linear.app/now/behind-the-latest-design-refresh
- https://linear.app/docs/filters

## Reusable UI primitives

- **Mode switcher:** Save, Organize, Ask; later, Relationships or CRM can be
  added only when it represents a durable user mode.
- **Record header:** current object title and source.
- **Properties:** typed metadata shown only when useful.
- **Contextual proposal:** AI suggestion with evidence and explicit review.
- **Primary action:** one visually dominant action per surface.
- **Status line:** quiet, persistent feedback rather than a promotional card.
- **Command registry:** future shared source for menus, keyboard shortcuts, and
  agent actions.

Brand should frame the product at installation, documentation, and store-listing
surfaces. Inside the working UI, typography, spacing, state, and behavior should
communicate the product; the Lucitra name can remain as quiet provenance.
