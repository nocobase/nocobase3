# PROTOTYPE — Notification admin console

This throwaway prototype answers one question: what should be visible on the
first screen of the reduced Notification 3.0 administration surface, and what
should require drilling into a Delivery, Attempt, or Provider Instance?

It is not production code and must not be imported by the Portal application.

## Review

Open [`index.html`](index.html) directly in a browser. No build, server, or
network access is required.

Use the role selector in the upper-right corner to preview:

- Operator: Delivery Log, filters, Attempt history, and manual redelivery.
- Admin: Operator capabilities plus read-only Provider configuration and
  connection tests.
- User: no access to the administration surface.
- ACL unavailable: the phase-one fail-closed state before the dedicated ACL
  adapter is connected.

Try these paths:

1. Select the `submission_unknown` Delivery and review its uncertainty warning.
2. Start a redelivery and confirm the explicit duplicate-send acknowledgement.
3. Select a failed Delivery, inspect all Attempts, and redeliver with a reason.
4. As Admin, open Providers, inspect the fixed SMTP chain, and run a connection
   test.

## Prototype conclusions

- Navigation needs only `Delivery log` and `Providers`; Overview, Templates,
  manual send, and Queue pages add no value in the reduced scope.
- Delivery status, masked Recipient, Channel, active/last Provider, Attempt
  count, last failure, source, and update time belong on the first screen.
- Full identifiers, immutable snapshot metadata, configuration revision,
  individual Attempt timing, normalized error details, and state history belong
  in the Delivery drawer.
- `submission_unknown` must be visually distinct from ordinary failure and
  require a stronger acknowledgement before redelivery.
- Provider configuration is a read-only projection of
  `registry/notification/config/providers.ts`; the UI never suggests that
  masked credentials or chain order can be edited in the browser.
- Role-based hiding is only a usability feature. The server-side
  AuthorizationPolicy remains authoritative and defaults to denial while no ACL
  adapter is installed.

## Non-goals

- No API requests, authentication, persistent state, real SMTP checks, or
  production component code.
- No Overview, Template management, manual notification sending, Queue
  management, delayed scheduling, or Provider editing.
