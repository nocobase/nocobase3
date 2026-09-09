---
'@nocobase/app-plugin-mail': minor
'@nocobase/app-plugin-mail-provider-gmail': minor
'@nocobase/app-plugin-mail-provider-microsoft': minor
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
---

Add the Mail workspace with account lifecycle management, automatic and manual mailbox synchronization, message notes and todo markers, Gmail custom-label management, inbound and outbound attachments, sending identities and selectable signatures, reusable templates with current-record variables, rich-text composition, automatic draft saving and recovery, private per-recipient bulk delivery, replies, forwards, draft creation and editing, scheduled delivery, push webhooks with automatic subscription renewal, a global unread indicator, and filterable operation logs with synchronization retry and cancellation. Keep folder membership and signatures in dedicated sources of truth, enforce account and identity defaults in the database, cascade account-owned records, and clean up temporary OAuth credentials and published outbox records. Provide Gmail and Microsoft 365 adapters, and enable the Mail plugins in both application templates.

Persist Mail Provider credentials as plain JSON in the core credential store; encryption will be supplied by a separate plugin.
