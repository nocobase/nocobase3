---
'@nocobase/app-plugin-scheduler': patch
---

Update the Scheduler Plugin Skill for asynchronous targets: business work is submitted as a `@nocobase/jobs` job on the owning Provider's executor, with the occurrence ID as reference and idempotency key, instead of a `@nocobase/queue` Job discovered through `queue.jobs` and dispatched with `queueManagerToken`.
