# @nocobase/app-plugin-queue-example

Queue example using the App's shared `queueServiceToken`. Register the core `QueueServiceProvider` before this plugin's providers. The plugin registers its handler during `boot()`; the App owns queue setup during `start()` and final service shutdown. The plugin awaits its own handler's unregistration during shutdown without closing the shared queue or stopping other plugins' handlers. No job-directory scanning or global job registry is required.

Send an authenticated `GET /api/queue-example` request to publish a message on the `default` queue with channel `QueueExample`. The response contains `{ jobId, channel, queue }`: this is a publish receipt, not proof of execution. The handler ignores unrelated channels. The Route owns a path-scoped authentication boundary, so it does not depend on contribution order and does not affect Routes mounted later. This demonstration permits any authenticated user; it does not perform a privileged business operation.

Resolve `queueExampleServiceToken` from the App container and call `listExecutions()` to observe asynchronous results. Tests wait for these results instead of assuming the HTTP response means the handler has finished. Execution history is isolated per App, returned as a snapshot, and held only in memory for demonstration; it is not a durable ledger or an idempotency mechanism. Applications requiring durable outcomes should persist them in their business services.

Stop sending this plugin's messages before unloading it. Other handlers can continue consuming the shared queue after unregistration; if all remaining handlers skip a message, that message still completes. Do not await the plugin's shutdown from inside its own handler.
