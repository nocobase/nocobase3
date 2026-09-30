---
'@nocobase/create-plugin': patch
---

Generate `@nocobase/jobs` code for the `server.jobs` capability instead of Job subclasses discovered through `queue.jobs`: a `Job` subclass with a stable `jobName` and a submit function in `server/jobs/<name>.ts`, and a Provider that takes the plugin's own `JobExecutor` under its package name, registers the class before `setup()` in `start()` and awaits `shutdown()`. Generated plugins declare `@nocobase/jobs` as a runtime peer in place of `@nocobase/queue`, and their tests run on a real memory jobs service. Verify generated jobs-only and combined service plugins by linting, compiling and executing their tests.
