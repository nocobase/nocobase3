---
'@nocobase/jobs': patch
'@nocobase/app-host': patch
'@nocobase/app-plugin-scheduler': patch
'@nocobase/app-plugin-users': patch
'@nocobase/app-plugin-api-keys': patch
'@nocobase/app-plugin-authz-default-access': patch
'@nocobase/app-plugin-authz-restriction-rules': patch
'@nocobase/app-plugin-authz-sharing-rules': patch
'@nocobase/app-plugin-database-explorer': patch
'@nocobase/app-plugin-authorization-example': patch
'@nocobase/app-plugin-departments-example': patch
'@nocobase/app-plugin-file-example': patch
'@nocobase/app-plugin-jobs-example': patch
'@nocobase/app-plugin-repository-example': patch
---

Describe the rebuilt `@nocobase/queue` in plugin guidance

The plugins' `AGENTS.md` now list `@nocobase/queue` as a host-owned contract — the application's queue service — rather than a job registry. The Scheduler Skill publishes asynchronous target work with `producer(queue).publish()` and a job ID derived from the occurrence instead of dispatching a Queue Job class. The jobs README and the jobs example compare themselves with the new queue API, and the departments example no longer composes the removed `QueueProvider` in its tests.
