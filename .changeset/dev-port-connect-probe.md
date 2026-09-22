---
"@nocobase/app-tools": patch
---

Choose a development port that nothing already answers on, not merely one that can be bound. macOS lets a wildcard listener and a specific-address listener share a port, so binding loopback succeeds while the other process receives the loopback traffic — and readiness, which is probed over loopback, then observes a service that is not ours and waits forever. The port probe now connects before accepting a candidate, so `pnpm dev` moves to the next port instead of hanging.

