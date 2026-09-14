---
'@nocobase/app-plugin-scheduler': patch
'@nocobase/queue': patch
---

Stop carrying per-firing detail through the queue, and use `@boringnode/queue` unmodified

A scheduled task recorded a rising trigger count while its execution list stayed
empty. `ScheduleDispatchJob` read `scheduledFor` and `scheduleRunNumber` from the
job context and threw before writing any history when either was missing. On
SQLite they were always missing: `queue_schedules.next_run_at` has TEXT affinity,
so the adapter read back the string `"1789312560000.0"` and `new Date()` produced
an Invalid Date, which serialized to `null` on its way into the job. Every
dispatch then failed, and because the job sets `maxRetries: 0` the failed row was
removed, leaving no trace anywhere.

Both fields only ever existed because a schedule's queue payload is static per
schedule and cannot carry per-firing data, so the information was taken from the
transport instead. Neither was consumed: `runNumber` was never rendered, and
`scheduledFor` filled a single "Scheduled for" column. They are removed, along
with the patch against `@boringnode/queue` that added them, and an occurrence is
now identified by the queue's job id alone — which upstream already provides.
