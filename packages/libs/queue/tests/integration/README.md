# Queue integration infrastructure

Run one target at a time from the repository root:

```sh
pnpm --filter @nocobase/queue test:integration inMemory
pnpm --filter @nocobase/queue test:integration redis
pnpm --filter @nocobase/queue test:integration:cluster
```

An optional positional test-file filter follows the target. Empty selections, failed tests, skipped tests, todos, missing services and unsupported target names fail the runner. Ordinary `pnpm test` excludes integration files; calling them directly requires explicit runner environment and fails without it. Do not use `--passWithNoTests` or backend-dependent skips to report an unexecuted contract as passing.

The Phase 1 `infrastructure.test.ts` is an infrastructure self-check, not the queue facade contract. Redis and Redis Cluster exercise official Queue/Worker against actual services. The inMemory self-check verifies that a real factory is required; it does not provide a dummy in-memory implementation. Later memory contract suites must supply the production BackendFactory to `createBackendHarness`.

Services use digest-pinned images, a unique Compose project and dynamically assigned loopback-only ports. Cluster starts three real masters inside one isolated container, covers all 16384 slots and maps announced ports through ioredis `natMap`; this is not a failover topology. No test reads application configuration or connects to business databases.

A machine-local temporary lock prevents simultaneous queue suites. If a process was forcibly killed, inspect the lock's `owner.json` and the named Compose project before manually cleaning up; never delete the lock of a live runner. Normal failures and SIGINT/SIGTERM print service logs, tear down containers and volumes, and verify no project containers remain. Redirect the runner's output to an evidence log when retaining an execution record. SIGKILL cannot run cleanup; the project name is always printed by Compose so an operator can remove that exact abandoned project.

Close Queue/Worker handles before the harness. `createTcpProxy` exposes a real bidirectional blackhole and transport disconnect, and waits for socket close events before reporting cleanup. Its unit self-check exercises forwarding, dropped traffic and actual close; it is not proof of production request cancellation.

TLS runtime testing is deferred pending an authorized isolated TLS fixture; non-TLS checks do not certify TLS cleanup.
