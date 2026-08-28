# Invocation and Service API

## Contents

- [Choose the correct entry](#choose-the-correct-entry)
- [Find a workflow to trigger](#find-a-workflow-to-trigger)
- [Internal service access](#internal-service-access)
- [Service method map](#service-method-map)
- [Authenticated management HTTP API](#authenticated-management-http-api)
- [Invocation verification](#invocation-verification)
- [Implementation references](#implementation-references)

## Choose the correct entry

| Intent                                                  | Contract                                        | Identifier                | Result                                                                        |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Business/domain event starts a workflow                 | `workflowRuntime.trigger(key, input, options?)` | workflow key              | immediate `accepted`/`skipped` receipt; accepted run creation is asynchronous |
| Authorized administrator manually executes a definition | authenticated management HTTP API               | definition id             | persisted run list item                                                       |
| Manage/inspect workflows and runs                       | authenticated management HTTP API               | mostly definition/run ids | typed view/list/detail                                                        |
| Browser/admin client                                    | authenticated `/api` routes                     | definition/run ids        | `{ data }` or paged response                                                  |

There is intentionally no generic public `POST /workflows/:key/trigger`. A cron, webhook, route, or domain module authenticates and validates its own event, constructs the declared input, then calls the internal service.

## Find a workflow to trigger

Discover a workflow for business invocation from the DSL package list, not from
the database or an HTTP API. In the configured Workflow source root, each
direct child directory is one workflow package; the directory name is the
stable `workflowKey`, and `workflow.ts` contains its input schema and node
definition. In the default application this is `server/workflows/<key>`.
Enumerate these directories (for example with `rg --files server/workflows`)
and read each `workflow.ts` top-level `title` and optional `description`. If the
request names an exact key, locate that directory directly. Otherwise compare
the business requirement with those human-facing fields and select the best
matching workflow; inspect its nodes when title and description are not enough
to distinguish candidates. If multiple candidates remain materially plausible,
present their key/title/description and ask which one to use. After selection,
the chosen directory name—not its title or description—is the key passed to
`workflowRuntime.trigger()`.

The trigger input must be a JSON object that conforms exactly to that file's
declared `inputSchema`. Use `title` and `description` to select a workflow,
but use `inputSchema` alone as the contract for constructing its invocation
input; database records and administrator input settings are not substitutes.
This discovery works while offline and does not require a running application,
database, or management API. The runtime remains the authority at execution
time, so a missing package/deployment can still produce a `not-found` receipt.

Do not use `enabled`, `current`, database ids, or management API results to
discover a business trigger. Titles and descriptions are discovery metadata;
the final trigger identifier is always the selected DSL directory key.

## Internal service access

The public server entry exports `getRuntimeWorkflow(appRuntime)`. It retrieves
the workflow runtime bound to that exact application runtime instance during
Workflow plugin bootstrap. The binding does not add a `workflow` property or a
`trigger` method to `AppRuntime`, and there is no
`services.plugins.workflow` service yet.

Business invocation:

```ts
import { getRuntimeWorkflow } from '@nocobase/app-plugin-workflow/server';

const workflowRuntime = getRuntimeWorkflow(appRuntime);
if (!workflowRuntime) throw new Error('Workflow runtime is not configured.');
const receipt = await workflowRuntime.trigger(
  'quotation-decision',
  { quotationId: 'Q-100', amount: 150000 },
  { eventKey: 'quotation-submitted:Q-100' },
);
if (receipt.status === 'skipped') {
  return receipt; // caller handles the runtime result; do not poll for a run
}
const { eventKey } = receipt;
```

`workflowRuntime.trigger(key, input, options?)`:

- Resolves the workflow by stable key at runtime.
- May return a `skipped` receipt. It has no `eventKey` and creates no run to poll; handle the receipt after calling rather than pre-filtering DSL keys through runtime management state.
- Requires a JSON object and validates it against the `inputSchema` declared by the selected DSL package's `workflow.ts`. Read and obey that schema before writing the trigger call; `input` is not the workflow's administrator `parameters` object.
- Rejects input over 65,536 UTF-8 bytes.
- Resolves administrator defaults/overrides into an immutable run input snapshot.
- Accepts optional `eventKey` and `parentRunId`; parent linkage is used for nested calls and stack-limit checks.
- Enqueues work and immediately returns `{ status: 'accepted', eventKey }`; the Workflow Run may not exist yet.
- Uses event key for idempotency. Reusing it must represent the same business event.

After the runtime accepts a workflow, validation/dispatch can still throw `INVALID_INPUT`, `INPUT_TOO_LARGE`, `PARENT_RUN_NOT_FOUND`, or `STACK_LIMIT_EXCEEDED`.

The management run endpoint resolves the exact materialized database definition/version identified by `definitionId`. It does not require that revision to be `current` or `enabled`, so an authenticated operator can run a historical revision. The Run is marked manual and preserves that definition's version, hash, Input Schema, and input snapshot. The optional event key uses the same idempotency mechanism as `trigger()`; the server generates one when it is omitted. The current DSL has no top-level trigger-source field.

## Management operation map

These names describe the repository behavior behind the authenticated routes;
they are not additional package-root service exports.

| Method                               | Purpose                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `list()`                             | Current definitions with enabled/current flags, version/hash, executed/active counts, latest run |
| `getWorkflow(id)`                    | One definition and its materialized nodes/input/input settings                                   |
| `revisions(id)`                      | All revisions sharing the selected definition's key                                              |
| `enable(idOrArtifactHash)`           | Enable a synchronized definition by id or publish/enable an unsynchronized Artifact by hash      |
| `disable(id)`                        | Disable the current definition                                                                   |
| `setStatus(id, enabled)`             | Change enabled state on a current definition                                                     |
| `getParameters(id)`                  | Read administrator input schema and explicit override values                                     |
| `updateParameters(id, values)`       | Replace validated override values on a current definition                                        |
| `runs(options?)`                     | Paged runs across workflows; default page size is 20                                             |
| `runsForWorkflow(id)`                | Latest 50 runs for the selected definition's workflow key                                        |
| `getRun(id)`                         | Run input, version identity, timing/reason, and latest attempt per node key                      |
| `nodeRuns(id, nodeKey?)`             | All node attempts, optionally filtered by node key                                               |
| `nodeRunPayload(runId, nodeRunId)`   | Redacted/truncated result, error, and log for one attempt                                        |
| `run(definitionId, input, options?)` | Authorized manual execution of the selected revision; accepts the common `eventKey` option       |

Input override updates accept only declared scalar values with exact types and enum membership. The stored map contains explicit overrides, not resolved defaults. Read back after changing it.

### Enable by synchronized id or Artifact hash

Read before writing. A synchronized item has a database `id`; an unsynchronized
Artifact has no id and is identified by its deployed `hash`.

- For an unsynchronized Artifact, call `enable(hash)` or `POST /api/workflows/<hash>/enable`.
- For a synchronized workflow, call `enable(id)` or `POST /api/workflows/<id>/enable`.
- After enable, read back id/key, `enabled`, `current`, version, and hash before configuring parameters or running it.

## Authenticated management HTTP API

All current routes are below `/api` and require authentication. The current
implementation does not provide per-action ACL or audit hooks; do not claim
finer-grained enforcement than authentication.

| Method and path                                          | Purpose/body                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /workflows`                                         | filters `q`, `enabled`; paged with `page`, `pageSize`                                         |
| `GET /workflows/:id`                                     | definition detail; id may be an unsynchronized Artifact hash                                  |
| `GET /workflows/:id/revisions`                           | revision list                                                                                 |
| `PATCH /workflows/:id/status`                            | `{ "enabled": boolean }` for a synchronized definition                                        |
| `POST /workflows/:id/enable`                             | id is a synchronized definition id or an unsynchronized Artifact hash                         |
| `POST /workflows/:id/disable`                            | disable current revision                                                                      |
| `GET /workflows/:id/parameters`                          | input settings                                                                                |
| `PUT /workflows/:id/parameters`                          | raw override object                                                                           |
| `PUT /workflows/:id/input-values`                        | raw overrides or `{ parameterValues }`                                                        |
| `POST /workflows/:id/run`                                | raw input or `{ input }`; optional `Event-Key` header; id is the selected definition revision |
| `GET /workflows/:id/runs`                                | runs for workflow key                                                                         |
| `GET /workflow-runs`                                     | filters key/title/status; paged                                                               |
| `GET /workflow-runs/:id`                                 | run detail                                                                                    |
| `GET /workflow-runs/:id/node-runs`                       | optional `nodeKey` query                                                                      |
| `GET /workflow-runs/:runId/node-runs/:nodeRunId/payload` | node result/error/log                                                                         |

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
  -d '{"input":{"quotationId":"Q-100","amount":150000}}' \
  https://app.example/api/workflows/<definition-id>/run

curl --fail-with-body \
  -H 'Authorization: Bearer <session-token>' \
  https://app.example/api/workflow-runs/<run-id>
```

An unsynchronized Artifact is addressed by its hash; after enable, use the persisted definition id returned/read back by the API. These are management routes only; business modules obtain the bound runtime through `getRuntimeWorkflow(appRuntime)`, call its `trigger()` method, and handle the `accepted`/`skipped` receipt.

## Invocation verification

1. Enumerate the configured Workflow DSL source root. Use an explicit key when supplied; otherwise match the business requirement against each `workflow.ts` title and description, inspect nodes to resolve close candidates, and ask when ambiguity remains. Use the selected directory name as the key; do not query the API or database for discovery.
2. Validate the exact input locally against the declared schema, including extra fields and byte size.
3. Choose/reuse a stable event key for the same source event.
4. Call `getRuntimeWorkflow(appRuntime)`, fail explicitly if no runtime is bound, then call `workflowRuntime.trigger(key, input, options)` for business logic. Use the authenticated management routes only for explicit inspection or manual management.
5. Discriminate the receipt. For `skipped`, record the reason and stop; there is no event key or run. For `accepted`, record its event key and allow for queue delay before looking up a run.
6. Once persisted, verify its workflow id/key, version, hash, input, event key, status, and timestamps.
7. Verify side-effecting run scripts by their business idempotency evidence, not merely a resolved workflow status.

## Installed implementation discovery

Resolve `@nocobase/app-plugin-workflow/server` through the project's package manager and inspect its installed declarations when verifying the runtime and route exports. Keep application calls on public package exports rather than importing plugin-internal file paths.
