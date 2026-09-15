---
'@nocobase/app-host': patch
---

Report which deployment phase failed, and why, instead of a bare summary

A failed deployment told an operator what went wrong without saying where. Reporting went through `rootErrorMessage`, which walks an error's `cause` chain to the innermost failure and discards every wrapper along the way, so `Cannot find package 'hono'` was the whole of it — with nothing to say whether the package was missing while the artifact was being installed or when the application started, which are different faults with different fixes.

Artifact installation now records each phase as it completes, and a failure reports the phase it died in together with the phases that had already succeeded: `Deployment failed during discovery after artifact download 1.2s, extract 3.4s: ...`. `AppCreateFailedError` and `AppReloadFailedError` fold their cause into their own message, so the reason survives the Host IPC boundary, which serialises an error to its message alone. An `AggregateError` is unfolded rather than summarised, so a failed replacement reports both the activation failure and the failed restore.

Deployment status reporting uses those messages instead of digging out the innermost cause. `rootErrorMessage` remains for matching an underlying failure, alongside a new `fullErrorMessage` for anything an operator reads.

Only phase names, durations, and error messages are included. Subprocess output is deliberately left out, because a dependency install prints registry URLs and authentication traces, and this string is stored and shown wherever a deployment is.
