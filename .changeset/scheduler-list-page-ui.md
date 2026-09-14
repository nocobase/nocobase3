---
'@nocobase/app-plugin-scheduler': minor
---

Report completed trigger counts on the scheduled task list and tighten that list: trigger count and last trigger share one column, the current status sits beside the task name instead of in a column of its own, an execution target is named by kind instead of by name, and the list paginates once it outgrows a page. The page shell matches other settings pages, timestamps no longer carry a timezone label, and the developer-facing read-only description and badge are gone.
