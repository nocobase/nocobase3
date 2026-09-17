---
'@nocobase/app-plugin-mail': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-examples': patch
'@nocobase/app-template-hub': patch
---

Add the Mail plugin with built-in Gmail, Microsoft 365, and IMAP/SMTP adapters, automatic provider registration, and extension contracts for third-party providers. Register Mail in all three application templates, replace the separate provider packages, and restore the Hub composition without unrelated examples, workflow, or end-user notification registrations.

Provide account connection and lifecycle management, sending identities, reusable templates with current-record variables, rich-text signatures, inbound and outbound attachments, automatic draft saving and recovery, replies, forwards, scheduled delivery, and separate per-recipient bulk sending. Use a shared composer in the Mail center and development send page, preserve each account's message, attachments, and signature when switching senders, and keep the inline composer ready after sending or saving a draft. Preserve forwarded content, formatting, and attachments without duplicating the original body. Confirm account deactivation and template or signature deletion, and explain template placeholder requirements.

Add automatic and manual mailbox synchronization, push webhooks with subscription renewal, synchronization retry and cancellation, and a global unread indicator. Configure automatic synchronization through server configuration. Preserve IMAP folder pagination and mailbox selection, handle missing UIDNEXT metadata, retain Gmail recovery checkpoints, load Microsoft inline attachments, and prevent implicit permanent IMAP deletion. Refresh mailboxes after accepted sends and support configurable IMAP sent-copy archiving without retrying confirmed deliveries. Consolidate the unreleased schema into one initial migration, including synchronization recovery state, incomplete message metadata, and synchronization deletion records.

Preserve request identity after lost send responses, distinguish temporary and permanent SMTP failures from unknown delivery outcomes, and report partially accepted deliveries with accepted and rejected recipients without retrying accepted recipients. Keep attachment preparation failures classified as unsent. Add persistent delivery histories with recipient details, expandable batch totals, safe retry and pending-delivery cancellation, and pagination that keeps complete batches together.

Improve the responsive Mail center and conversation reading layout with isolated, script-disabled HTML rendering that preserves email styles and authenticated inline images. Resize message bodies as content loads, mark opened messages as read, preserve conversation expansion choices, keep single messages expanded, and show labels, notes, to-do controls, and localized action tooltips. Improve rich-text heading and font-size controls, paragraph spacing, form spacing, management selection, and signature ordering. Exclude drafts from non-draft lists before pagination and hide draft read-state controls.

Unify account, management, and log table pagination with server-side totals, numbered pages, direct page entry, and page-size selection while retaining the Mail center's cursor pagination. Show account owner names and provide permission-protected management detail drawers and attachment downloads. Remove the unsafe cross-account move control, provider message ID column, standalone Mail application route, and administration operation-log page. Keep the development Mail center, account management, and consolidated send, bulk, and synchronization logs available, with redirects from the previous send tabs.

Keep folder membership and signatures in dedicated sources of truth, enforce account and identity defaults, cascade account-owned records, and clean up temporary OAuth credentials and published outbox records. Preserve local draft attachment contents, scope the client to its application container, expose supported server integration and background-runtime contracts, and retain translation metadata in HTTP errors. Store provider credentials as plain JSON in the core credential store; encryption is left to a separate plugin. Expand persistence, ownership, provider, API, and UI regression coverage, enforce coverage thresholds, and update integration documentation and plugin guidance.

Hide suspended accounts and their messages from the Mail center and unread count while preserving management access to synchronized mail. Explain this behavior in the deactivation confirmation.

Fix Microsoft Graph attachment metadata queries by qualifying the fileAttachment contentId property, allowing draft and forwarded messages to send without HTTP 400 errors while preserving inline image metadata.

Import all date-scoped mail history in resumable batches, interleave new-mail synchronization, recover abandoned queue tasks, and rescan expired cursors without skipping mail. Preserve incomplete message metadata, expose independent content retries, and display recovery and partial-content progress.

Preserve mail error details in application logs, route cleanup and realtime failures through the shared logger, and record sending, synchronization, and retry outcomes with correlation fields without changing delivery behavior when logging fails.

Show accepted messages with provider IDs in the known Sent folder immediately, reconcile them with later mailbox synchronization, and prevent stale provider drafts from reverting accepted messages. Hide synchronized duplicates of editable local drafts before pagination and preserve confirmed delivery when local cleanup fails.

Reorganize the Mail application Skill into focused configuration, client integration, sending, and synchronization references. Clarify production OAuth return handling, provider capabilities, delivery retry boundaries, and resumable synchronization without a total history cap.

Unify personal and management message mutations, including local draft deletion; refresh mailbox data on realtime changes while preserving reading and composing state; drain background synchronization work on shutdown. Separate shared contracts, scheduling, delivery, and composer state responsibilities while preserving existing public exports.
