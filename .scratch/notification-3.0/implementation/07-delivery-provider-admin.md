# Operate deliveries and providers from the admin console

Type: implementation / AFK
Status: blocked
Label: needs-triage
Blocked by: [05](05-smtp-retry-fallback.md)

## What to build

Turn the approved admin prototype into a working Delivery Log and read-only Provider console. Operators must be able to locate a delivery, inspect its redacted ledger, test a Provider connection, and explicitly retry failed or uncertain work.

## Acceptance criteria

- [ ] Delivery list supports only the approved indexed filters, fixed ordering, page/pageSize pagination, and redacted summaries.
- [ ] Delivery detail displays validated content, Provider Chain, Attempts, StatusEvents, source, revisions, and redacted diagnostics.
- [ ] Provider list shows configuration state without secrets; connection test validates SMTP connection/TLS/auth without sending mail.
- [ ] Failed retry requires a reason; submission-unknown retry additionally requires duplicate-risk acknowledgement.
- [ ] Concurrent retry requests are resolved by Delivery CAS and return stable 409 errors when not retryable.
- [ ] All authenticated Portal users can temporarily use the management functions; cookie mutations enforce CSRF and the TEMPORARY access boundary is visible.
- [ ] Browser and API tests cover filters, detail drill-down, connection testing, ordinary retry, risky retry, and redaction.
