# Invocation and Service API

## Contents

- [Choose the correct entry](#choose-the-correct-entry)
- [Internal service access](#internal-service-access)
- [Service method map](#service-method-map)
- [Authenticated management HTTP API](#authenticated-management-http-api)
- [Invocation verification](#invocation-verification)
- [Implementation references](#implementation-references)

## Choose the correct entry

| Intent                                                   | Contract                        | Identifier                | Result                                                                        |
| -------------------------------------------------------- | ------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Business/domain event starts an enabled current workflow | `WorkflowService.trigger()`     | workflow key              | immediate `accepted`/`skipped` receipt; accepted run creation is asynchronous |
| Authorized administrator manually executes a definition  | `WorkflowService.run()`         | definition id             | persisted run list item                                                       |
| Manage/inspect workflows and runs                        | other `WorkflowService` methods | mostly definition/run ids | typed view/list/detail                                                        |
| Browser/admin client                                     | authenticated `/api` routes     | definition/run ids        | `{ data }` or paged response                                                  |

There is intentionally no generic public `POST /workflows/:key/trigger`. A cron, webhook, route, or domain module authenticates and validates its own event, constructs the declared context, then calls the internal service.

## Internal service access

The plugin bootstrap registers the service as `services.plugins.workflow`. Its public interface is `WorkflowService`.

`services` below is the application/plugin bootstrap context's service container; it is not a module-level global. Import the public type from the server export when needed.

Business invocation:

```ts
import type { WorkflowService } from '@nocobase/app-plugin-workflow/server';

const workflow = services.plugins.workflow as WorkflowService;
const receipt = await workflow.trigger(
  'quotation-decision',
  { quotationId: 'Q-100', amount: 150000 },
  { eventKey: 'quotation-submitted:Q-100' },
);
if (receipt.status === 'skipped') {
  return receipt; // caller handles not-found or disabled; do not poll for a run
}
const { eventKey } = receipt;
```

`trigger(key, context, options?)`:

- Resolves the current version by stable key.
- Returns `{ status: 'skipped', reason: 'not-found' }` when no current definition exists, and `{ status: 'skipped', reason: 'disabled' }` when it is disabled. These normal service outcomes have no `eventKey` and create no run to poll.
- Requires a JSON object and validates it against that version's Context Schema.
- Rejects context over 65,536 UTF-8 bytes.
- Resolves administrator defaults/overrides into an immutable run input snapshot.
- Accepts optional `eventKey` and `parentRunId`; parent linkage is used for nested calls and stack-limit checks.
- Enqueues work and immediately returns `{ status: 'accepted', eventKey }`; the Workflow Run may not exist yet.
- Uses event key for idempotency. Reusing it must represent the same business event.

After the service accepts a current enabled workflow, validation/dispatch can still throw `INVALID_CONTEXT`, `CONTEXT_TOO_LARGE`, `PARENT_RUN_NOT_FOUND`, or `STACK_LIMIT_EXCEEDED`. `WORKFLOW_NOT_FOUND` and `WORKFLOW_DISABLED` belong to the lower-level `WorkflowRuntime.trigger()` contract; do not document them as the missing/disabled outcome of `DatabaseWorkflowService.trigger()`.

Manual management invocation:

```ts
const run = await workflow.run(
  definitionId,
  { quotationId: 'Q-100', amount: 150000 },
  { eventKey: 'operator-request-42' },
);
```

`run(definitionId, context, options?)` resolves the exact materialized database definition/version identified by `definitionId`. It does not require that revision to be `current` or `enabled`, so an authorized administrator can run a historical revision. The Run is marked manual and preserves that definition's version, hash, Context Schema, and input snapshot. `options.eventKey` is used directly by the same event-key idempotency mechanism as `trigger()`; the service generates an event key when it is omitted. This privileged management operation must be protected by `workflow:run` when fine-grained authorization is wired. The current DSL has no top-level trigger-source field.

## Service method map

| Method                                 | Purpose                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `list()`                               | Current definitions with enabled/current flags, version/hash, executed/active counts, latest run    |
| `getWorkflow(id)`                      | One definition and its materialized nodes/context/input settings                                    |
| `revisions(id)`                        | All revisions sharing the selected definition's key                                                 |
| `enable(id, expectedDeployedHash?)`    | Publish current deployed Artifact if present, activate the selected/current revision, and enable it |
| `disable(id)`                          | Disable the current definition                                                                      |
| `setStatus(id, enabled)`               | Change enabled state on a current definition                                                        |
| `getInputs(id)`                        | Read administrator input schema and explicit override values                                        |
| `updateInputs(id, values)`             | Replace validated override values on a current definition                                           |
| `runs(options?)`                       | Paged runs across workflows; default page size is 20                                                |
| `runsForWorkflow(id)`                  | Latest 50 runs for the selected definition's workflow key                                           |
| `getRun(id)`                           | Run context, version identity, timing/reason, and latest attempt per node key                       |
| `nodeRuns(id, nodeKey?)`               | All node attempts, optionally filtered by node key                                                  |
| `nodeRunPayload(runId, nodeRunId)`     | Redacted/truncated result, error, and log for one attempt                                           |
| `trigger(key, context, options?)`      | Internal asynchronous business invocation                                                           |
| `run(definitionId, context, options?)` | Authorized manual execution of the selected revision; accepts the common `eventKey` option          |

Input override updates accept only declared scalar values with exact types and enum membership. The stored map contains explicit overrides, not resolved defaults. Read back after changing it.

### Enable with deployed-hash concurrency control

Read before writing. `list()` exposes `registered`, `deployedHash`, `currentHash`, and `canEnable`.

- For a discovered but unregistered Artifact, call `enable(key, deployedHash)`. Omitting the hash fails with `deployedHash is required.`
- If a supplied expected hash no longer equals the discovered deployment, enable fails with conflict `deployment-changed`; refresh the list and obtain authorization for the new digest.
- For an already registered workflow, `enable(id)` selects and enables the current revision; supplying the last-read deployed hash adds deployment-change protection.
- After enable, read back id/key, `enabled`, `current`, version, and hash before configuring inputs or running it.

## Authenticated management HTTP API

All current routes are below `/api` and require authentication. The route factory declares the permission identifiers below, but only enforces them when the application passes its optional `authorize` hook. The default plugin registration currently calls `createWorkflowRoutes({ workflow })`, so it does not wire fine-grained authorization or audit hooks. Authentication is not equivalent to ACL enforcement; verify target-app wiring before relying on these identifiers.

| Method and path                                          | Permission                                                      | Purpose/body                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /workflows`                                         | `workflow:list`                                                 | filters `q`, `enabled`; paged with `page`, `pageSize`                                             |
| `GET /workflows/:id`                                     | `workflow:view`                                                 | definition detail                                                                                 |
| `GET /workflows/:id/revisions`                           | `workflow:view`                                                 | revision list                                                                                     |
| `PATCH /workflows/:id/status`                            | `workflow:updateStatus`                                         | `{ "enabled": boolean }`                                                                          |
| `POST /workflows/:id/enable`                             | `workflow:updateStatus`                                         | optional `{ "deployedHash": string }`; required for first enable of discovered Artifact           |
| `POST /workflows/:id/disable`                            | `workflow:updateStatus`                                         | disable current revision                                                                          |
| `GET /workflows/:id/inputs`                              | `workflow:view`                                                 | input settings                                                                                    |
| `PUT /workflows/:id/inputs`                              | `workflow:updateInputs`                                         | raw override object                                                                               |
| `PUT /workflows/:id/input-values`                        | `workflow:updateInputs`                                         | raw overrides or `{ inputValues }`; audited route                                                 |
| `POST /workflows/:id/run`                                | `workflow:run`                                                  | raw context or `{ context }`; optional `Event-Key` header; id is the selected definition revision |
| `GET /workflows/:id/runs`                                | `workflowRun:list`                                              | runs for workflow key                                                                             |
| `GET /workflow-runs`                                     | `workflowRun:list`                                              | filters key/title/status; paged                                                                   |
| `GET /workflow-runs/:id`                                 | `workflowRun:view`                                              | run detail                                                                                        |
| `GET /workflow-runs/:id/node-runs`                       | `workflowRun:view`                                              | optional `nodeKey` query                                                                          |
| `GET /workflow-runs/:runId/node-runs/:nodeRunId/payload` | `workflowRun:viewPayload`; log also needs `workflowRun:viewLog` | node result/error/log                                                                             |

The run endpoint maps the `Event-Key` header to `{ eventKey }`; it must not accept arbitrary runtime options from the request body. Do not allow clients to inject `parentRunId` or bypass authorization through arbitrary bodies.

Example authenticated management calls (replace the base URL, credentials, ids, and last-read digest):

```bash
curl --fail-with-body \
  -H 'Authorization: Bearer <session-token>' \
  -H 'Content-Type: application/json' \
  -d '{"deployedHash":"<last-read-deployed-hash>"}' \
  https://app.example/api/workflows/quotation-decision/enable

curl --fail-with-body \
  -H 'Authorization: Bearer <session-token>' \
  -H 'Content-Type: application/json' \
  -H 'Event-Key: operator-request-42' \
  -d '{"context":{"quotationId":"Q-100","amount":150000}}' \
  https://app.example/api/workflows/<definition-id>/run

curl --fail-with-body \
  -H 'Authorization: Bearer <session-token>' \
  https://app.example/api/workflow-runs/<run-id>
```

The first discovered item uses its workflow key as the temporary management id. After enable, use the persisted definition id returned/read back by the API. These are management routes only; business modules still call the internal service and handle its `accepted`/`skipped` receipt.

## Invocation verification

1. Resolve the intended definition id/revision and record its version, hash, current/enabled flags, and input settings. `trigger()` requires current+enabled; manual `run()` may intentionally select a historical/disabled revision.
2. Validate the exact context locally against the declared schema, including extra fields and byte size.
3. Choose/reuse a stable event key for the same source event.
4. Call `trigger()` for business logic or authorized `run()` for manual management.
5. Discriminate the receipt. For `skipped`, record the reason and stop; there is no event key or run. For `accepted`, record its event key and allow for queue delay before looking up a run.
6. Once persisted, verify its workflow id/key, version, hash, context, event key, status, and timestamps.
7. Verify side-effecting run scripts by their business idempotency evidence, not merely a resolved workflow status.

## Installed implementation discovery

Resolve `@nocobase/app-plugin-workflow/server` through the project's package manager and inspect its installed declarations when verifying the current `WorkflowService`, server bootstrap, or route exports. Keep application calls on public package exports rather than importing plugin-internal file paths.
