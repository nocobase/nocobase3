---
'@nocobase/app-plugin-ai-employee': minor
---

Add a usage statistics page under the AI settings group, reporting token consumption and call volume from the events `aiUsageEvents` already records.

The page shows range totals against the same window one period earlier — today against the same hours yesterday, not against the stretch that just ended, which a range ending midway through a day would otherwise be measured against — a trend chart of input and output tokens, and a breakdown by model, AI employee, or user that exports to CSV. Cached tokens are already counted inside the input tokens, so the chart splits the input bar into its uncached and cached halves instead of adding a segment that would count them twice. Filters cover the time range, AI employee, and model, and they live in the URL so a view can be shared. It reuses the `ai.settings` page grant rather than introducing a permission of its own.

The four backing actions — `aiUsage:summary`, `aiUsage:series`, `aiUsage:breakdown` and `aiUsage:filterOptions` — aggregate in SQL rather than reading events into memory. Grouping by period needs a column to group by: `occurredAt` is an epoch-millisecond bigint, and the portable query builder exposes no date function, so a migration adds `aiUsageEvents.occurredHour`, a UTC hour index, backfills it from the existing rows, and indexes it. Day, week, and month buckets are folded from those hours in the service, which is also what lets the day boundary follow the viewer's timezone instead of being fixed to UTC; offsets are rounded to whole hours, so a half-hour zone such as +05:30 places its bucket edge up to 30 minutes from local midnight.
