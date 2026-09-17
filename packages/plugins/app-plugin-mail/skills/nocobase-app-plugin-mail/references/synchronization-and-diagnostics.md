# Synchronization and diagnostics

## Start and observe synchronization

Use `MailService.startSync()` or `POST /api/mail/accounts/:accountId/sync`. The workspace's all-mailbox action targets active accounts supporting incremental synchronization; selecting an account narrows the scope. Observe history through `GET /api/mail/sync-runs`, a run through `/api/mail/sync-runs/:syncRunId`, or `/dev/mail/logs/sync`.

Automatic synchronization is configured globally through `mail.automaticSyncIntervalMs` or `MAIL_AUTOMATIC_SYNC_INTERVAL_MS`. It defaults to `300000` milliseconds, minimum `60000`, and applies to both existing and new accounts. The runtime checks due accounts every minute. Account forms and account-update APIs do not set independent automatic intervals.

`mail.syncBatchSize` or `MAIL_SYNC_BATCH_SIZE` defaults to 100, with an integer range of 1–200. This bounds each provider request, not the total imported history. `receivedAfter` bounds the history date range; without a date, all history is eligible. The legacy `maxMessages` request field no longer caps the import.

## Recovery and correctness

Mail captures a provider baseline before scanning history, then alternates history and incremental pages with separate persisted cursors. It serializes account writes and commits messages, checkpoints and the next outbox task together. The outbox relay publishes queue work; each job advances a bounded step. Application code should not enqueue independent sync jobs or write checkpoints directly.

Startup and periodic maintenance recover expired workers and published queue deliveries without progress. Recovery uses task revisions and leases so old workers cannot advance newer state. Pending delayed retries retain their schedule. An idle-looking run is not evidence that a replacement run should be created; inspect its public progress and the queue first.

A provider cursor error starts a fresh scan of the configured history range with a new baseline. Never set a failed cursor to “current” and report completion without scanning, because that loses unseen changes. Existing messages and local metadata remain available; history must not overwrite newer synchronized state or resurrect a message deleted during the scan. A rescan does not reconcile deletions that have already disappeared from provider history.

The owner can cancel an active run through `POST /api/mail/sync-runs/:syncRunId/cancel` and retry a failed or cancelled run through `/retry`. Keep retry and cancellation behind the service/API transitions rather than editing run status.

## Incomplete content

Keep visible records with `contentStatus: deferred` or `failed`. IMAP defers bodies larger than 16 MiB while retaining envelope and attachment metadata; parsing failures retain a durable message identity rather than blocking the whole mailbox.

The owner can load or retry content through the message detail action or `POST /api/mail/accounts/:accountId/messages/:messageId/content/retry`. This fetch is independent of the background size limit and can use memory proportional to the full message. Preserve current read/starred state, labels, notes and follow-up markers during a content retry.

Logs expose `recovering` and `historyComplete` to distinguish recovery from unfinished history import. A sync run can finish as `partial` when content remains unresolved. Its `pendingMessages` count describes the completion snapshot; loading content later does not rewrite historical log totals. Later synchronization refreshes those counts. Distinguish this from a `failed` batch caused by a network or authentication error.

## Diagnostic order

| Symptom                      | Check and response                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mail capability absent       | Client/Server registration, migrations and enabled provider configuration; inspectors cover composition only        |
| Account cannot send or sync  | Account status, provider availability and ownership; `reauthorizationRequired` requires reconnecting                |
| Task remains pending         | Application queue, Mail runtime, migration state and server logs; page refresh cannot execute queued work           |
| Progress stops after restart | Lease/delivery recovery and pending retry schedule, using the same application database                             |
| History appears incomplete   | Configured start date, ongoing history progress and incomplete-content records; do not introduce a total import cap |
| Cursor fails repeatedly      | Provider authorization and cursor recovery; preserve the date-scoped rescan instead of skipping to now              |
| IMAP external state differs  | New-UID sync does not fully reconcile external flags, deletions or moves                                            |
| Sent mail missing            | Provider visibility and sent-copy mode; delivery outcome is authoritative for whether to resend                     |

Personal diagnostics require workspace permission and ownership. Cross-user operation history is available at `GET /api/mail/settings/operation-logs` under admin permission, with API-safe account metadata. It has no built-in settings page. Keep credential references, cursors, leases and internal provider errors out of application diagnostics.

## Verify this path

For synchronization integration, verify multiple history pages and a message arriving during history import, not merely one successful list request. For recovery changes, verify restart with retained progress, rejection of stale worker writes and invalid-cursor rescan without skipped changes. For incomplete-content UI, verify continued visibility, independent retry and metadata preservation. Confirm local NocoBase labels/notes survive resync. Run only the scenarios relevant to the requested change; provider and queue mocks do not prove a deployment's live connectivity.
