# Invocation and Service API

## Contents

- [Choose the correct entry](#choose-the-correct-entry)
- [Internal service access](#internal-service-access)
- [Service method map](#service-method-map)
- [Authenticated management HTTP API](#authenticated-management-http-api)
- [Invocation verification](#invocation-verification)
- [Implementation references](#implementation-references)

## Choose the correct entry

| Intent                                                   | Contract                                   | Identifier                | Result                                                                        |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------- |
| Business/domain event starts an enabled current workflow | `trigger(runtime, key, context, options?)` | workflow key              | immediate `accepted`/`skipped` receipt; accepted run creation is asynchronous |
| Authorized administrator manually executes a definition  | authenticated management HTTP API          | definition id             | persisted run list item                                                       |
| Manage/inspect workflows and runs                        | authenticated management HTTP API          | mostly definition/run ids | typed view/list/detail                                                        |
| Browser/admin client                                     | authenticated `/api` routes                | definition/run ids        | `{ data }` or paged response                                                  |

There is intentionally no generic public `POST /workflows/:key/trigger`. A cron, webhook, route, or domain module authenticates and validates its own event, constructs the declared context, then calls the internal service.

## Internal service access

The public server entry exports `trigger(runtime, key, context, options?)`. Obtain
the runtime from the application/plugin context with the plugin's runtime
binding; do not assume a `services.plugins.workflow` service exists.

Business invocation:

```ts
import {
  getRuntimeWorkflow,
  trigger,
} from '@nocobase/app-plugin-workflow/server';

const runtime = getRuntimeWorkflow(appRuntime);
if (!runtime) throw new Error('Workflow runtime is not configured.');
const receipt = await trigger(
  runtime,
  'quotation-decision',
  { quotationId: 'Q-100', amount: 150000 },
  { eventKey: 'quotation-submitted:Q-100' },
);
if (receipt.status === 'skipped') {
  return receipt; // caller handles not-found or disabled; do not poll for a run
}
const { eventKey } = receipt;
```

`trigger(runtime, key, context, options?)`:

- Resolves the current version by stable key.
- Returns `{ status: 'skipped', reason: 'not-found' }` when no current definition exists, and `{ status: 'skipped', reason: 'disabled' }` when it is disabled. These normal service outcomes have no `eventKey` and create no run to poll.
- Requires a JSON object and validates it against that version's Context Schema.
- Rejects context over 65,536 UTF-8 bytes.
- Resolves administrator defaults/overrides into an immutable run input snapshot.
- Accepts optional `eventKey` and `parentRunId`; parent linkage is used for nested calls and stack-limit checks.
- Enqueues work and immediately returns `{ status: 'accepted', eventKey }`; the Workflow Run may not exist yet.
- Uses event key for idempotency. Reusing it must represent the same business event.

After the runtime accepts a current enabled workflow, validation/dispatch can still throw `INVALID_CONTEXT`, `CONTEXT_TOO_LARGE`, `PARENT_RUN_NOT_FOUND`, or `STACK_LIMIT_EXCEEDED`.

The management run endpoint resolves the exact materialized database definition/version identified by `definitionId`. It does not require that revision to be `current` or `enabled`, so an authenticated operator can run a historical revision. The Run is marked manual and preserves that definition's version, hash, Context Schema, and input snapshot. The optional event key uses the same idempotency mechanism as `trigger()`; the server generates one when it is omitted. The current DSL has no top-level trigger-source field.

## Management operation map

These names describe the repository behavior behind the authenticated routes;
they are not additional package-root service exports.

| Method                                 | Purpose                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `list()`                               | Current definitions with enabled/current flags, version/hash, executed/active counts, latest run |
| `getWorkflow(id)`                      | One definition and its materialized nodes/context/input settings                                 |
| `revisions(id)`                        | All revisions sharing the selected definition's key                                              |
| `enable(idOrArtifactHash)`             | Enable a synchronized definition by id or publish/enable an unsynchronized Artifact by hash      |
| `disable(id)`                          | Disable the current definition                                                                   |
| `setStatus(id, enabled)`               | Change enabled state on a current definition                                                     |
| `getInputs(id)`                        | Read administrator input schema and explicit override values                                     |
| `updateInputs(id, values)`             | Replace validated override values on a current definition                                        |
| `runs(options?)`                       | Paged runs across workflows; default page size is 20                                             |
| `runsForWorkflow(id)`                  | Latest 50 runs for the selected definition's workflow key                                        |
| `getRun(id)`                           | Run context, version identity, timing/reason, and latest attempt per node key                    |
| `nodeRuns(id, nodeKey?)`               | All node attempts, optionally filtered by node key                                               |
| `nodeRunPayload(runId, nodeRunId)`     | Redacted/truncated result, error, and log for one attempt                                        |
| `run(definitionId, context, options?)` | Authorized manual execution of the selected revision; accepts the common `eventKey` option       |

Input override updates accept only declared scalar values with exact types and enum membership. The stored map contains explicit overrides, not resolved defaults. Read back after changing it.

### Enable by synchronized id or Artifact hash

Read before writing. A synchronized item has a database `id`; an unsynchronized
Artifact has no id and is identified by its deployed `hash`.

- For an unsynchronized Artifact, call `enable(hash)` or `POST /api/workflows/<hash>/enable`.
- For a synchronized workflow, call `enable(id)` or `POST /api/workflows/<id>/enable`.
- After enable, read back id/key, `enabled`, `current`, version, and hash before configuring inputs or running it.

## Authenticated management HTTP API

All current routes are below `/api` and require authentication. The current
implementation does not provide per-action ACL or audit hooks; do not claim
finer-grained enforcement than authentication.

| Method and path                                          | Purpose/body                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /workflows`                                         | filters `q`, `enabled`; paged with `page`, `pageSize`                                             |
| `GET /workflows/:id`                                     | definition detail; id may be an unsynchronized Artifact hash                                      |
| `GET /workflows/:id/revisions`                           | revision list                                                                                     |
| `PATCH /workflows/:id/status`                            | `{ "enabled": boolean }` for a synchronized definition                                            |
| `POST /workflows/:id/enable`                             | id is a synchronized definition id or an unsynchronized Artifact hash                             |
| `POST /workflows/:id/disable`                            | disable current revision                                                                          |
| `GET /workflows/:id/inputs`                              | input settings                                                                                    |
| `PUT /workflows/:id/inputs`                              | raw override object                                                                               |
| `PUT /workflows/:id/input-values`                        | raw overrides or `{ inputValues }`                                                                |
| `POST /workflows/:id/run`                                | raw context or `{ context }`; optional `Event-Key` header; id is the selected definition revision |
| `GET /workflows/:id/runs`                                | runs for workflow key                                                                             |
| `GET /workflow-runs`                                     | filters key/title/status; paged                                                                   |
| `GET /workflow-runs/:id`                                 | run detail                                                                                        |
| `GET /workflow-runs/:id/node-runs`                       | optional `nodeKey` query                                                                          |
| `GET /workflow-runs/:runId/node-runs/:nodeRunId/payload` | node result/error/log                                                                             |

The run endpoint maps the `Event-Key` header to `{ eventKey }`; it must not accept arbitrary runtime options from the request body. Do not allow clients to inject `parentRunId` or bypass authorization through arbitrary bodies.

Example authenticated management calls (replace the base URL, credentials, ids, and last-read digest):

```bash
curl --fail-with-body \
  -H 'Authorization: Bearer <session-token>' \
  -H 'Content-Type: application/json' \
  https://app.example/api/workflows/<artifact-hash>/enable

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

An unsynchronized Artifact is addressed by its hash; after enable, use the persisted definition id returned/read back by the API. These are management routes only; business modules call the public `trigger` export and handle its `accepted`/`skipped` receipt.

## Invocation verification

1. Resolve the intended definition id/revision and record its version, hash, current/enabled flags, and input settings. `trigger()` requires current+enabled; manual `run()` may intentionally select a historical/disabled revision.
2. Validate the exact context locally against the declared schema, including extra fields and byte size.
3. Choose/reuse a stable event key for the same source event.
4. Call the public `trigger(runtime, key, context, options)` for business logic or the authenticated `run` route for manual management.
5. Discriminate the receipt. For `skipped`, record the reason and stop; there is no event key or run. For `accepted`, record its event key and allow for queue delay before looking up a run.
6. Once persisted, verify its workflow id/key, version, hash, context, event key, status, and timestamps.
7. Verify side-effecting run scripts by their business idempotency evidence, not merely a resolved workflow status.

## Installed implementation discovery

Resolve `@nocobase/app-plugin-workflow/server` through the project's package manager and inspect its installed declarations when verifying the runtime and route exports. Keep application calls on public package exports rather than importing plugin-internal file paths.
