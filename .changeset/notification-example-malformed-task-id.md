---
'@nocobase/app-plugin-notification-example': patch
---

A task route given an id that is not a UUID, such as `/tasks/missing`, answers 403 `TASK_ACCESS_DENIED` like a task the caller cannot see, instead of 500 on PostgreSQL, which rejects comparing a malformed value with the `uuid` column where other dialects match nothing.
