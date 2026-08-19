# Email providers

Email delivery separates domain orchestration from provider adapters.

- `providers/types.ts` defines the stable `EmailProvider` result contract and ordered instance registry.
- `providers/smtp.ts` maps an injected SMTP client response or error into `accepted`, `failed`, or `submission_unknown` without owning retries.
- `providers/fake.ts` provides deterministic development and test outcomes.
- `server/email-dispatcher.ts` owns Delivery claiming, Attempts, retry delays, fixed-order fallback, and terminal state transitions.

SMTP acceptance means only that the SMTP server accepted the message submission. It is never recorded as `delivered`.

Each instance is identified by a stable non-secret ID such as `email/smtp/primary` and a redacted `configRevision`. Credentials belong to the SMTP client factory and must not be placed in Delivery snapshots, Provider results, errors, logs, or Live events.

## Automatic decision matrix

| Result | Automatic behavior |
| --- | --- |
| `accepted` | Delivery becomes `accepted`; an associated user Email item becomes visible. |
| Retryable `failed` | Retry the same instance after 30 seconds and then 2 minutes; after the third failed Attempt, use the next enabled instance. |
| Authentication/authorization `failed` | Skip same-instance retry and use the next enabled instance. |
| Invalid request/recipient `failed` | Delivery becomes `failed`; do not retry or fallback. |
| `submission_unknown` | Delivery becomes `submission_unknown`; stop all automatic processing. |

The Fake Provider is an explicit development/test adapter. Production configuration and secret resolution are added at the App composition boundary rather than inside Provider adapters.
