# @nocobase/app-plugin-mail

## 0.0.1

### Patch Changes

- Add authenticated mail sending with persisted idempotency and explicit
  indeterminate submission results.
- Add resumable, bounded mailbox synchronization through a transactional
  Outbox, Queue Job adapter, and initial-sync catch-up watermark.
- Add the Mail database schema, runtime service wiring, and Provider contracts.
- Add one-time PKCE OAuth orchestration and encrypted credential storage for
  concrete Provider plugins.
- Add Mail settings and development pages for account authorization, bounded
  synchronization, test sending, and synchronized-message inspection.
