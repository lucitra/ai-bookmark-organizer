# Gmail Integration Patterns for a Lucitra AI Workspace

Research date: July 29, 2026

## Scope

This research describes a future Gmail product surface and the backend
capabilities it would require. It does not add Gmail access, network calls,
accounts, or permissions to AI Bookmark Organizer. The bookmark extension
should remain a standalone, local-first product.

## Executive conclusion

Lucitra should begin with a separate **Google Workspace Add-on** that performs
explicit, user-invoked actions on the message or draft currently open in Gmail.
Its card UI should call authenticated Lucitra HTTPS endpoints, while the richer
workspace lives in Lucitra's own web application.

Do not begin with:

- a Chrome extension that injects controls into Gmail's DOM;
- continuous synchronization of a user's entire mailbox;
- automatic contact creation, message logging, or email sending;
- tracking pixels or link tracking;
- Gmail permissions inside AI Bookmark Organizer.

The initial product should help a person understand and act on one conversation:

1. identify the people and organizations involved;
2. summarize the selected thread;
3. associate it with existing Lucitra records;
4. extract follow-up tasks or save useful resources;
5. prepare a reply draft for the user to review and send.

This gives Lucitra a credible email surface without making broad mailbox access
the price of trying the product.

## Choose the right integration surface

| Surface | Best use | Access profile | Main tradeoff | Recommendation |
| --- | --- | --- | --- | --- |
| Google Workspace Add-on | Contextual actions on an open message or draft | Add-on-specific current-message scopes | Card UI does not support custom HTML/CSS | **Build first** |
| Full Gmail API connection | Background sync, historical search, inbox-wide workflows | Usually restricted mailbox scopes | OAuth review and potentially annual security assessment | Defer |
| Chrome extension injection | Custom UI inside Gmail's web DOM | Gmail host access and content scripts | Desktop-only, brittle against Gmail UI changes | Avoid |
| BCC or forwarding address | Explicitly log selected outbound/inbound messages | No mailbox read access | Weak context and discoverability | Optional bridge |

Google Workspace Add-ons use a constrained card-and-widget interface instead of
arbitrary HTML, CSS, or client-side JavaScript. That limits brand expression,
but gives Lucitra an officially supported Gmail surface that can work in the
desktop Gmail sidebar and, for contextual message reading, in the Gmail mobile
app.

Sources:
[Workspace Add-on restrictions](https://developers.google.com/workspace/add-ons/guides/workspace-restrictions),
[Cards](https://developers.google.com/workspace/add-ons/concepts/cards)

## Recommended product boundary

### The Gmail add-on is a context surface

The add-on should answer: **What can I do with this conversation right now?**

Good initial actions:

- **Save interaction** — create a timeline activity with the selected
  conversation's participants, subject, date, and an explicit message reference.
- **Find or associate records** — match people by normalized email and
  organizations by normalized domain, then let the user confirm associations.
- **Summarize conversation** — produce a concise summary grounded only in the
  selected thread.
- **Extract follow-ups** — propose tasks with owners and due dates for review.
- **Save links** — turn URLs explicitly selected from a message into Resource
  records compatible with the bookmark-native model.
- **Draft reply** — place an editable draft in Gmail; never send automatically.

Bad initial actions:

- silently create contacts for every participant;
- crawl the full inbox to "build the CRM";
- log every email by default;
- infer sensitive personal attributes;
- automatically enroll people in outreach sequences;
- treat model-generated summaries as source records;
- send, delete, archive, or relabel messages without a separate confirmation.

### The Lucitra web app is the system of work

The add-on's narrow sidebar should not become a miniature CRM. The Lucitra web
application should own:

- record search and editing;
- relationship maps;
- saved views;
- deduplication review;
- timeline history;
- workflow configuration;
- consent, retention, and exclusion settings;
- audit logs and integration health.

The Gmail surface should link directly to the relevant Lucitra record or
conversation after an action succeeds.

## What HubSpot's Gmail product gets right

### Logging and tracking are different features

HubSpot treats **logging** an email into the CRM separately from **tracking**
opens and clicks. Users and administrators can configure them independently.

Source:
[Track and log emails with the HubSpot Sales Chrome extension](https://knowledge.hubspot.com/connected-email/track-and-log-emails-with-the-hubspot-sales-chrome-extension)

**Implication for Lucitra:** build explicit interaction logging first. Open and
click tracking has a different privacy, consent, reliability, and product value
profile and should not be included in the initial Gmail product.

### Users control record associations

HubSpot can log an email to contacts and associated companies or deals, with
account defaults and per-inbox preferences. It also supports manually logging a
past sent or received message to selected CRM records.

Sources:
[Customize extension settings](https://knowledge.hubspot.com/connected-email/customize-your-hubspot-sales-chrome-extension-default-configuration-options),
[Log sent and received emails](https://knowledge.hubspot.com/connected-email/log-your-sent-emails-to-the-crm)

**Implication for Lucitra:** show suggested associations, but require a person
to confirm them. Store one Interaction and associate it with multiple records;
do not copy the email into every record.

### Exclusions are a first-class control

HubSpot provides "never log" email and domain lists at individual and
account-wide levels.

**Implication for Lucitra:** exclusions must be enforced before content reaches
storage or an AI model. Ship personal and organization-wide exclusion rules
before offering default or background logging.

### A connected inbox is not required for every feature

HubSpot distinguishes browser-surface features such as contact profiles and
templates from connected-inbox features such as reply logging, sending from the
CRM, and sequences.

Source:
[Connected email feature requirements](https://knowledge.hubspot.com/connected-email/what-features-are-supported-by-my-email-provider-and-require-a-connected-inbox)

**Implication for Lucitra:** do not make continuous mailbox access a prerequisite
for useful contextual actions.

## Google access levels and review consequences

### Start with current-message scopes

Google provides add-on-specific scopes that operate only while the user is
interacting with the add-on:

| Capability | Scope | Classification |
| --- | --- | --- |
| Perform an action on the current message | `gmail.addons.current.message.action` | Non-sensitive |
| Read current-message metadata | `gmail.addons.current.message.metadata` | Sensitive |
| Read the current message | `gmail.addons.current.message.readonly` | Sensitive |
| Create or update a draft during an add-on action | `gmail.addons.current.action.compose` | Non-sensitive |

Source:
[Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

An initial metadata-only record lookup can use the metadata scope. Summarizing
the selected message or thread requires current-message read access and must be
implemented, disclosed, and demonstrated before requesting that scope. Google
explicitly prohibits requesting access for hypothetical future features.

### Avoid restricted mailbox scopes until justified

Inbox-wide access such as `gmail.readonly`, `gmail.metadata`, or `gmail.modify`
is classified as restricted. If restricted data is transmitted to or stored on
servers, Google requires restricted-scope verification and a security
assessment. Restricted-scope applications are revalidated annually.

Sources:
[Choose Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[Security assessment](https://support.google.com/cloud/answer/13465431),
[Request minimum scopes](https://support.google.com/cloud/answer/13807380)

This makes full inbox sync a product and compliance commitment, not a convenient
technical shortcut.

## Proposed backend model

The Gmail integration should use the same record-and-association foundation
recommended in the HubSpot research.

```text
Workspace
  User
  IntegrationConnection
  Person
  Organization
  Resource
  Interaction
  Task
  Opportunity (optional, future)
```

### Gmail connection

```text
IntegrationConnection
  id
  workspaceId
  userId
  provider                  "google"
  externalAccountId         stable Google subject, not display email
  grantedScopes
  status
  connectedAt
  lastAuthorizedAt
  revokedAt
  tokenKeyVersion
```

OAuth refresh tokens must be encrypted with a managed key, inaccessible to
application logs, rotated when appropriate, and deleted on disconnect.

### Interaction

```text
Interaction
  id
  workspaceId
  type                      "email"
  direction                 "inbound" | "outbound" | "mixed"
  occurredAt
  subject
  summary                   optional derived field
  sourceProvider            "gmail"
  sourceThreadId
  sourceMessageIds
  sourceAccountId
  contentRetentionMode      "reference" | "selected_content"
  createdBy
  createdAt
```

The default should be `reference`: keep stable identifiers and normalized
metadata, not a permanent copy of the raw body. Store selected content only when
the feature requires it and the user confirms the action.

### Associations and provenance

```text
InteractionAssociation
  interactionId
  recordType
  recordId
  role                      participant | mentioned | regarding
  source                    user | deterministic | model
  confidence
  confirmedBy
  confirmedAt
```

Model suggestions and user-confirmed associations must remain distinguishable.
AI output should never overwrite source email fields.

### Idempotency

Use the tuple below to prevent duplicate activity records:

```text
workspaceId + sourceAccountId + sourceThreadId + actionType
```

If a user saves the same thread twice, show and update the existing Interaction
instead of silently creating a duplicate.

## Recommended request flow

1. Gmail invokes the add-on's HTTPS endpoint with a contextual event.
2. Lucitra validates the Google-issued identity token, issuer, audience, expiry,
   and deployment identity.
3. The endpoint checks which scopes the user actually granted.
4. The add-on retrieves only the current message data needed for the selected
   action.
5. Exclusion rules run before persistence or AI processing.
6. Email text is treated as untrusted input and separated from system
   instructions.
7. The model returns structured proposals: summary, participants, associations,
   resources, tasks, or a draft.
8. The add-on renders a preview and requires explicit confirmation.
9. The backend writes normalized records plus provenance and an audit event.
10. A reply action creates an editable Gmail draft; the user sends it from
    Gmail.

Google supports HTTP add-ons in any server language and recommends Cloud Run
when hosting on Google Cloud. Add-on requests and responses use authenticated
JSON and card definitions.

Source:
[Build a Workspace Add-on with HTTP endpoints](https://developers.google.com/workspace/add-ons/guides/alternate-runtimes)

## AI and data-handling rules

Email bodies are both sensitive data and untrusted instructions. The AI layer
must enforce:

- no training of shared or general-purpose models on Gmail-derived data;
- no use beyond the visible, user-facing feature that requested the data;
- no human review without the user's affirmative agreement for specific data,
  except narrow security or legal cases;
- encryption in transit and at rest;
- tenant and user authorization checks on every record;
- redaction of quoted history and signatures when they are not needed;
- bounded retention for raw input and model traces;
- no email content in logs, analytics, error trackers, or support tools;
- model-provider contracts and settings that prevent training and unnecessary
  retention;
- prompt-injection defenses that treat message content as data, never as tool
  instructions;
- previews before record creation, task creation, association, or draft update;
- no autonomous sending, deleting, archiving, labeling, or external actions.

Google's Limited Use requirements apply to raw, aggregated, anonymized, and
derived data. Use must serve prominent user-facing features, transfers are
limited, and human access is restricted.

Source:
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

## Background synchronization, if it becomes necessary

A future connected-inbox product could use Gmail `watch` notifications through
Cloud Pub/Sub and retrieve changes using `history.list`. Notifications contain
the mailbox identity and a new history ID, not the changed email content.

Important operational constraints:

- a mailbox watch must be renewed at least every seven days; Google recommends
  daily renewal;
- notifications can be delayed or dropped;
- the backend needs periodic reconciliation;
- an expired history ID can require a full resynchronization;
- processing must be idempotent;
- notification loops and the per-user rate limit must be handled.

Sources:
[Configure Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push),
[Gmail history](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)

Do not build this infrastructure for the first add-on release. Current-message
actions provide a smaller and safer way to test whether email context actually
improves the product.

## Phased product sequence

### Phase 0 — Architecture and policy

- finalize the shared Resource, Person, Organization, Interaction, Task, and
  association schemas;
- choose retention modes and deletion guarantees;
- build tenant isolation, audit events, token encryption, and revocation;
- create separate development, staging, and production Google Cloud projects;
- write Gmail-specific privacy disclosures and a data deletion procedure.

### Phase 1 — Contextual Gmail add-on

- identify or create a Person from the selected participant, with confirmation;
- associate the selected thread with existing records;
- save an Interaction reference;
- save selected links as Resources;
- open the linked Lucitra record.

Request metadata access only. Do not store message bodies.

### Phase 2 — Selected-message AI

- summarize the current thread;
- extract follow-up tasks;
- suggest associations;
- prepare a reply draft.

Add current-message read access only when these features are complete. Process
the selected thread on demand and retain the minimum required data.

### Phase 3 — Team workflow

- organization-wide exclusion lists;
- association defaults;
- review queues for deduplication and uncertain matches;
- role-based access;
- retention policies;
- integration health and audit views.

### Phase 4 — Optional connected inbox

Only after demonstrated customer demand and security readiness:

- explicit opt-in historical import;
- incremental sync through Pub/Sub and Gmail history;
- reply logging;
- inbox-wide relationship views;
- complete restricted-scope verification and recurring security assessment.

## Publishing strategy

The Gmail add-on is a separate Google Workspace Marketplace product from the
Chrome bookmark extension.

For a public listing, Google requires:

- a Google Cloud project;
- OAuth consent configuration and any required verification;
- the Workspace Marketplace SDK and add-on deployment;
- an accurate product listing, website, privacy policy, support information,
  icons, and real screenshots;
- a fully functional review account if Lucitra authentication is required;
- Marketplace app review.

Public and private Marketplace audiences cannot be switched after publication.
Use separate development or staging projects for internal pilots rather than
publishing the eventual production listing as private.

Sources:
[Publish to the Workspace Marketplace](https://developers.google.com/workspace/marketplace/how-to-publish),
[Marketplace app review](https://developers.google.com/workspace/marketplace/about-app-review)

## Recommended next product decision

Before implementation, define one narrow Phase 1 workflow and its exact data
contract:

> From an open Gmail thread, let the user associate the conversation with a
> Person or Organization, save selected links as Resources, and create reviewed
> follow-up Tasks—without retaining the raw email body.

That workflow connects email, bookmarks, and a future relationship workspace
without turning Lucitra into an inbox crawler or making fundraising the
universal product model.

