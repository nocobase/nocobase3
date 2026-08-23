# Invocation and Service API

## Contents

- [Choose the correct entry](#choose-the-correct-entry)
- [Internal service access](#internal-service-access)
- [Service method map](#service-method-map)
- [Authenticated management HTTP API](#authenticated-management-http-api)
- [Invocation verification](#invocation-verification)
- [Implementation references](#implementation-references)

## Choose the correct entry

| Intent                                                   | Contract                        | Identifier                | Result                                                         |
| -------------------------------------------------------- | ------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Business/domain event starts an enabled current workflow | `WorkflowService.trigger()`     | workflow key              | immediate `{ eventKey }` receipt; run creation is asynchronous |
| Authorized administrator manually executes a definition  | `WorkflowService.run()`         | definition id             | persisted run list item                                        |
| Manage/inspect workflows and runs                        | other `WorkflowService` methods | mostly definition/run ids | typed view/list/detail                                         |
| Browser/admin client                                     | authenticated `/api` routes     | definition/run ids        | `{ data }` or paged response                                   |

There is intentionally no generic public `POST /workflows/:key/trigger`. A cron, webhook, route, or domain module authenticates and validates its own event, constructs the declared context, then calls the internal service.

## Internal service access

The plugin bootstrap registers the service as `services.plugins.workflow`. Its public interface is `WorkflowService`.

Business invocation:

```ts
const workflow = services.plugins.workflow as WorkflowService;
const receipt = await workflow.trigger(
  'quotation-decision',
  { quotationId: 'Q-100', amount: 150000 },
  { eventKey: 'quotation-submitted:Q-100' },
);
```

`trigger(key, context, options?)`:

- Resolves the current version by stable key.
- Rejects missing or disabled workflows.
- Requires a JSON object and validates it against that version's Context Schema.
- Rejects context over 65,536 UTF-8 bytes.
- Resolves administrator defaults/overrides into an immutable run input snapshot.
- Accepts optional `eventKey` and `parentRunId`; parent linkage is used for nested calls and stack-limit checks.
- Enqueues work and immediately returns `{ eventKey }`; the Workflow Run may not exist yet.
- Uses event key for idempotency. Reusing it must represent the same business event.

Possible invocation codes include `WORKFLOW_NOT_FOUND`, `WORKFLOW_DISABLED`, `INVALID_CONTEXT`, `CONTEXT_TOO_LARGE`, `PARENT_RUN_NOT_FOUND`, and `STACK_LIMIT_EXCEEDED`.

Manual management invocation:

```ts
const run = await workflow.run(
  definitionId,
  { quotationId: 'Q-100', amount: 150000 },
  'operator-request-42',
);
```

`run(id, context, idempotencyKey?)` resolves a specific definition id and uses event key `manual-<idempotencyKey>` when provided. It is independent of the configured trigger source and is intended for an authorized management path. Do not use it as a substitute for business `trigger()` merely because it returns a run record.

## Service method map

| Method                              | Purpose                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `list()`                            | Current definitions with enabled/current flags, version/hash, executed/active counts, latest run |
| `getWorkflow(id)`                   | One definition and its materialized nodes/context/input settings                                 |
| `revisions(id)`                     | All revisions sharing the selected definition's key                                              |
| `enable(id)`                        | Activate the selected revision and enable it                                                     |
| `disable(id)`                       | Disable the current definition                                                                   |
| `setStatus(id, enabled)`            | Change enabled state on a current definition                                                     |
| `getInputs(id)`                     | Read administrator input schema and explicit override values                                     |
| `updateInputs(id, values)`          | Replace validated override values on a current definition                                        |
| `runs()`                            | Latest 50 runs across workflows                                                                  |
| `runsForWorkflow(id)`               | Latest 50 runs for the selected definition's workflow key                                        |
| `getRun(id)`                        | Run context, version identity, timing/reason, and latest attempt per node key                    |
| `nodeRuns(id, nodeKey?)`            | All node attempts, optionally filtered by node key                                               |
| `nodeRunPayload(runId, nodeRunId)`  | Redacted/truncated result, error, and log for one attempt                                        |
| `trigger(key, context, options?)`   | Internal asynchronous business invocation                                                        |
| `run(id, context, idempotencyKey?)` | Authorized manual execution                                                                      |

Input override updates accept only declared scalar values with exact types and enum membership. The stored map contains explicit overrides, not resolved defaults. Read back after changing it.

## Authenticated management HTTP API

All current routes are below `/api`, require authentication, and may apply the listed permission:

| Method and path                                          | Permission                                                      | Purpose/body                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /workflows`                                         | `workflow:list`                                                 | filters `q`, `enabled`; paged with `page`, `pageSize`           |
| `GET /workflows/:id`                                     | `workflow:view`                                                 | definition detail                                               |
| `GET /workflows/:id/revisions`                           | `workflow:view`                                                 | revision list                                                   |
| `PATCH /workflows/:id/status`                            | `workflow:updateStatus`                                         | `{ "enabled": boolean }`                                        |
| `POST /workflows/:id/enable`                             | `workflow:updateStatus`                                         | activate and enable revision                                    |
| `POST /workflows/:id/disable`                            | `workflow:updateStatus`                                         | disable current revision                                        |
| `GET /workflows/:id/inputs`                              | `workflow:view`                                                 | input settings                                                  |
| `PUT /workflows/:id/inputs`                              | `workflow:updateInputs`                                         | raw override object                                             |
| `PUT /workflows/:id/input-values`                        | `workflow:updateInputs`                                         | raw overrides or `{ inputValues }`; audited route               |
| `POST /workflows/:id/run`                                | `workflow:run`                                                  | raw context or `{ context }`; optional `Idempotency-Key` header |
| `GET /workflows/:id/runs`                                | `workflowRun:list`                                              | runs for workflow key                                           |
| `GET /workflow-runs`                                     | `workflowRun:list`                                              | filters key/title/status; paged                                 |
| `GET /workflow-runs/:id`                                 | `workflowRun:view`                                              | run detail                                                      |
| `GET /workflow-runs/:id/node-runs`                       | `workflowRun:view`                                              | optional `nodeKey` query                                        |
| `GET /workflow-runs/:runId/node-runs/:nodeRunId/payload` | `workflowRun:viewPayload`; log also needs `workflowRun:viewLog` | node result/error/log                                           |

The run endpoint's idempotency header is not a runtime options object. Do not allow clients to inject `parentRunId` or disabled-workflow bypass flags through arbitrary bodies.

## Invocation verification

1. Resolve the intended current definition and record its id, version, hash, enabled flag, and input settings.
2. Validate the exact context locally against the declared schema, including extra fields and byte size.
3. Choose/reuse a stable event key for the same source event.
4. Call `trigger()` for business logic or authorized `run()` for manual management.
5. Record the returned event key. For asynchronous trigger, allow for queue delay before looking up a run.
6. Once persisted, verify its workflow id/key, version, hash, context, event key, status, and timestamps.
7. Verify side-effecting run scripts by their business idempotency evidence, not merely a resolved workflow status.

## Implementation references

- [Workflow service](../../../server/services/workflow.ts)
- [Authenticated HTTP routes](../../../server/routes/api/workflows.ts)
- [Invocation contract](../../../engine/server/invocation-contract.ts)
- [Plugin bootstrap registration](../../../server/bootstrap.ts)
