# @nocobase/app-plugin-mail

## 0.0.1

### Patch Changes

- Add authenticated mail sending with persisted idempotency and explicit
  indeterminate submission results.
- Add resumable, bounded mailbox synchronization through a transactional
  Outbox, Queue Job adapter, and initial-sync catch-up watermark.
- Add the Mail database schema, runtime service wiring, and Provider contracts.
- Add one-time PKCE OAuth orchestration and a replaceable database credential
  store for concrete Provider plugins.
- Add `/dev/mail/center` for mailbox-style inspection, `/dev/mail/management`
  for the complete synchronized message table, and `/dev/mail/send` for test
  sending.
- Add a development Mail workspace with account and folder navigation, indexed
  folder filtering, and Provider-native conversation detail.
- Recover interrupted pending sends, terminal OAuth failures, and expired sync
  cursors; paginate folder discovery and renew long-running sync leases.
- Add Server error translations, local shadcn UI primitives, and an App-facing
  Mail Plugin Skill.
- Add a permission-protected Mail account management page under Settings with
  explicit account-type selection and OAuth association.
- Keep account management in Mail settings and expose synchronization and send logs from the Mail development pages.
- Add a Settings send-log page backed by authenticated submission history.
- Show all users' connected mailboxes in Mail Settings while preserving
  account-owner synchronization boundaries.
- Remove account association controls from the all-user Mail account page.
- Move initial-sync limits and mailbox synchronization actions from Settings
  to the development Mail accounts page.
