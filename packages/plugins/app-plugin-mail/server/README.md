# Mail server implementation

`service.ts` composes the application services behind `MailService`. `store.ts` composes database persistence behind `MailStore`. Both retain their existing constructors and method contracts; the modules below them are internal implementation details and are not package subpath exports. App integrations continue to resolve the public service tokens.

## Services

`services/` groups account authorization and lifecycle, mailbox operations, drafts, attachments, synchronization requests, delivery, management, and user preferences. `access.ts` owns the shared account and message ownership checks. Personal and management operations retain their distinct access policies; HTTP routes still enforce their authentication and permissions. `dependencies.ts` defines the facade's construction contract, and each internal service selects the dependencies it needs.

`views.ts` projects API-safe account, synchronization, and submission responses without importing the database implementation. `provider-lifecycle.ts` owns adapter cleanup, including deferred cleanup for attachment streams. `draft-content.ts` owns local and remote draft conversion. The existing `operations/` modules continue to implement sending and bounded mailbox synchronization; services do not duplicate those workflows.

## Persistence and transactions

`store/` groups accounts, authorization states, attachments, templates, mailbox metadata, messages, push subscriptions, synchronization, submissions, and Outbox delivery. `rows.ts` defines stored records, `mappers.ts` handles record conversion, and the message query and cursor modules own relation loading and pagination. Store modules depend on database contracts and small account-reader interfaces, not on application services or the store facade.

Transaction-owning methods stay together. `store/sync.ts` commits mailbox changes, leases, checkpoints, pending push requests, and the next Outbox task in one transaction. `store/submissions.ts` creates a scheduled submission and its Outbox task in one transaction. `store/accounts.ts` owns account removal and authorized-account persistence, including their related records. The `*-writes.ts` functions accept the owning transaction's `QueryAdapter`; they must not open independent transactions or obtain a fresh query connection.

Tests exercise the existing service and store entry points. `tests/mail-runtime.test.ts` covers end-to-end behavior against SQLite, and `tests/store-transactions.test.ts` verifies rollback when a sync lease is lost or an Outbox write fails.

## Shared operations and lifecycle

`operations/message-mutations.ts` owns read/star changes, moving, and deletion for both personal and management services, including local draft cleanup. Each caller authorizes and resolves its target before invoking the operation. Management methods are trusted server entry points: HTTP routes enforce the `mail.management` or `mail.admin` permission, and other integrations must enforce the equivalent permission before calling these methods. An actor ID alone does not grant administrative access.

`operations/schedule-sync.ts` owns synchronization mode, initial date, and active-run reuse for manual requests, automatic sweeps, and push delivery. `runtime/push-subscriptions.ts` maintains remote subscriptions and leases; `runtime/outbox-relay.ts` delivers committed tasks. `runtime.ts` composes them and owns worker lifecycle. `runtime/background-tasks.ts` closes admission and waits for admitted work before shutdown completes. Push requests persisted during shutdown remain recoverable even if activation has not started.

## Contracts

`shared/mail.ts` owns browser-safe data contracts and constants. `contracts/provider.ts`, `contracts/service.ts`, and `contracts/persistence.ts` own adapter, application service, and persistence/queue interfaces respectively. `types.ts` preserves the existing public exports; internal implementations import from the owning contract. Services declare only the persistence methods they use through `MailServiceDependencies`. Keep transaction-owning store methods intact when narrowing these contracts.

## Client state

`client/hooks/use-mail-workspace-data.ts` owns message and conversation requests, pagination, selection, and stale-response rejection. Realtime invalidations share the subscription protocol used by the unread indicator, coalesce bursts, and refresh the current page without remounting the composer. `use-mail-composer.ts` owns draft recovery and remote-conflict transitions, including save fingerprints and session guards; the editor invokes actions instead of editing those internal references.
