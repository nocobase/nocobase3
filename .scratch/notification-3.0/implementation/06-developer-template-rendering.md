# Render developer templates per recipient

Type: implementation / AFK
Status: completed
Label: implemented
Blocked by: [02](02-notification-store-schema-contract.md), [03](03-in-app-end-to-end.md)

## What to build

Implement the code/config-owned Template Registry and safe Liquid rendering path so trusted application developers can trigger recipient-personalized In-app and Email content without exposing template management to business users.

## Acceptance criteria

- [x] Startup validates unique template key/version, variable Schemas, allowed Channels, AST, tags, filters, and resource limits.
- [x] Trigger supports mutually exclusive direct-content and template modes with explicit common and per-recipient variables.
- [x] Every recipient/channel is validated and rendered before persistence; one failure rejects the entire Trigger.
- [x] Liquid strict settings, limited expressions, output limits, and approved Email HTML sanitization are enforced.
- [x] Delivery stores immutable content plus template key/version/hash; Worker, retry, and fallback never rerender.
- [x] Different recipients can receive distinct snapshots from the same Notification.
- [x] No template CRUD, database template, business-user UI, locale selection, loop, include, or arbitrary JavaScript is introduced.
- [x] Unit and end-to-end tests cover valid personalization, missing/unknown variables, unsafe output, limits, and template changes after Trigger.
