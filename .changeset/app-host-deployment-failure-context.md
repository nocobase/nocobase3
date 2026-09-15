---
'@nocobase/app-host': patch
---

Report which deployment phase failed, and why, instead of a bare summary

A failed deployment reached the operator as a single sentence that named neither the step that failed nor the reason it failed. `App "crm" failed to initialize` was the whole diagnosis: the underlying error was attached as `cause`, and the Hub IPC channel serialises an error to its `message` alone, so the cause was discarded before it reached the console, the API, or a job waiting on a deployment.

Artifact installation now records each phase as it completes, and a failure reports the phase it died in together with the phases that had already succeeded — `Deployment failed during discovery after artifact download 1.2s, extract 3.4s: ...`. `AppCreateFailedError` and `AppReloadFailedError` fold their cause into their own message for the same reason, unfolding an `AggregateError` so that a failed replacement reports both the activation failure and the failed restore rather than only the summary of the two.

Only phase names, durations, and error messages are included. Subprocess output is deliberately left out, because a dependency install prints registry URLs and authentication traces, and this string is stored and shown wherever a deployment is.
