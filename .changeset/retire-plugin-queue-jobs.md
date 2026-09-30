---
'@nocobase/app-server': major
---

Retire the plugin `queue.jobs` contribution. A plugin that still declares it keeps loading so the application starts, but its job directories are no longer discovered and their jobs no longer run: the Application logs one warning per such plugin when it starts, and `inspectResolvedAppServerPlugins` reports it as a `SERVER_QUEUE_JOBS_RETIRED` warning. The `queue` field remains in the plugin definition types only as a deprecated, ignored property. Register job classes on a `JobExecutor` from `@nocobase/jobs`, or QueueService handlers, in a service provider instead.
