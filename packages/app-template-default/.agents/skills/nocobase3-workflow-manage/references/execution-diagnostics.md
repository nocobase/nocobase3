# Execution Diagnostics

## Contents

- [Status model](#status-model)
- [Diagnostic sequence](#diagnostic-sequence)
- [Definition and version checks](#definition-and-version-checks)
- [Run and node-run checks](#run-and-node-run-checks)
- [Payload and log handling](#payload-and-log-handling)
- [Common symptoms](#common-symptoms)
- [Diagnostic report](#diagnostic-report)

## Status model

Workflow Run status:

| Stored value | Name       | Meaning                                        |
| -----------: | ---------- | ---------------------------------------------- |
|       `null` | `QUEUEING` | Accepted/persisted but not started by a worker |
|          `0` | `STARTED`  | Active execution                               |
|          `1` | `RESOLVED` | Completed successfully                         |
|         `-1` | `FAILED`   | Business/instruction failure state             |
|         `-2` | `ERROR`    | Execution/infrastructure error                 |
|         `-3` | `ABORTED`  | Aborted, including timeout handling            |

Node Run status uses `0 PENDING`, `1 RESOLVED`, `-1 FAILED`, `-2 ERROR`, and `-3 ABORTED`. Run reason `timeout` indicates timeout termination.

Do not infer success from HTTP 200 alone: `trigger()` only confirms scheduling and returns an event key. Do not infer the current attempt from the first matching node run: reruns create multiple attempts.

## Diagnostic sequence

Follow this order so evidence remains tied to the executed revision:

1. Resolve the workflow key/definition and list revisions.
2. Inspect the run, capturing workflow id/key, workflow version, artifact hash, event key, context, timestamps, manual flag, parent relationship where available, status, and reason.
3. Use the run's definition id/hash, not merely the current workflow, to understand its code and topology.
4. Inspect `getRun(id).nodeRuns` for the latest attempt per node key and reconstruct the visible executed path.
5. Call `nodeRuns(runId, nodeKey?)` when reruns or repeated attempts are possible; compare ids/timestamps/statuses in ascending order.
6. Fetch `nodeRunPayload(runId, nodeRunId)` only for relevant attempts. Record result, error, log, and `truncated`.
7. Correlate structured server logs by run/execution id, node id/key, artifact digest, and script. Run-node logs include duration and `success/error/aborted`.
8. Compare the failing node's config, resolved inputs/context, expected result contract, timeout, and artifact script path.
9. Separate root cause from propagated failure. A condition parent can fail because its selected branch child failed.
10. Recommend a source fix, setting fix, retry with the same event identity, new business invocation, or compensation. Do not erase history.

## Definition and version checks

Inspect:

- Is the requested key present and is a current revision selected?
- Is it enabled for normal `trigger()` calls?
- Does the run point to the expected definition id/version/hash?
- Was a new revision loaded but not activated, or activated but disabled?
- Did administrator input overrides change after this run? Remember the run uses the snapshot created at invocation.
- Is the artifact available on the configured private filesystem drive and does its digest match the run hash?

Use `list()`, `getWorkflow(id)`, `revisions(id)`, and `getInputs(id)`. Current definition nodes show materialized config and tree links (`upstreamKey`, `downstreamKey`, `branchKey`), but historical execution interpretation must follow the run's fixed version/hash.

## Run and node-run checks

For `QUEUEING`:

- Confirm the workflow runtime/worker and queue are started.
- Look for persisted queue job, retries, dead-letter/failure evidence, and event-key deduplication.
- A trigger receipt without a run can be normal briefly because scheduling is asynchronous.

For `STARTED`:

- Check latest node status and timestamps.
- `PENDING` may be valid for a branching/resumable instruction; `run` itself never intentionally stays pending.
- Compare node `options.timeout`, workflow timeout/reaper behavior, abort signal handling, and external I/O.
- Look for a crashed worker leaving stale started state and timeout-reaper recovery evidence.

For `FAILED` or `ERROR`:

- Fetch the failing leaf node attempt before its parent/ancestor propagation record.
- A thrown `run` script error is execution error; a returned `{ status: 'failed' }` is successful business data and will not fail the node.
- Check module resolution/artifact errors, invalid runtime result serialization, missing named `run` export, and business-service exceptions.
- For condition errors, verify JSON Logic returns a boolean and referenced data exists with the expected type.

For `ABORTED`:

- Check `reason === 'timeout'`, configured deadline, reaper logs, and whether the script honored `runtime.signal`.
- Distinguish an intended cancellation from timeout or shutdown.

For an unexpected path:

- Read the condition Node Run result (`true`/`false`) and exact expression.
- Compare persisted context and input snapshot, not current external records/settings.
- Confirm template typing: an exact template preserves number/boolean/object, while interpolation produces a string.
- Confirm the referenced node result was declared and actually returned the matching runtime shape. Result schemas are compile-time contracts, not a universal runtime validator.

## Payload and log handling

`nodeRunPayload()` returns `{ id, result, error, log, truncated }`.

- Result, error, and log are capped around 64 KiB; oversized content is truncated.
- Payloads/logs pass through redaction of common secret material, but callers still need `workflowRun:viewPayload`; logs additionally require `workflowRun:viewLog`.
- A `null` log can mean no captured log or insufficient log permission. Check authorization before concluding the script emitted nothing.
- If `truncated` is true, use correlated structured server logs or reproduce safely with smaller diagnostic data. Do not weaken redaction or copy secrets into a new log.
- Node Run summary currently reports `branchKey: null`; reconstruct branch topology from the definition and condition result rather than relying on that summary field.

## Common symptoms

| Symptom                          | Likely checks                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `WORKFLOW_NOT_FOUND`             | wrong directory-derived key, no current revision, source not loaded                     |
| `WORKFLOW_DISABLED`              | current revision disabled; use authorized management decision, not a bypass             |
| `INVALID_CONTEXT`                | root/field type, missing required field, undeclared extra field, unsupported assumption |
| `CONTEXT_TOO_LARGE`              | serialized UTF-8 context exceeds 65,536 bytes; pass identifiers rather than documents   |
| duplicate-looking trigger        | caller generated different event keys for the same event                                |
| no second run                    | same event key was intentionally deduplicated                                           |
| stuck queueing                   | worker/runtime/queue not started, queue failure, retry/dead letter                      |
| run node module error            | script omitted from artifact, bad relative path, missing named `run`, digest mismatch   |
| run node serialization error     | BigInt, model/class instance, circular reference, function/symbol, non-finite number    |
| condition type error             | expression produced non-boolean or mixed comparison types                               |
| unexpected empty arg             | missing path resolved to `undefined`; embedded template converted it to empty string    |
| node result not visible at check | reference is self/later/sibling-branch/branch-internal or node has no result schema     |
| apparent old settings            | run correctly uses its invocation-time input snapshot                                   |
| rerun disagreement               | inspected an old attempt; enumerate all node runs by node key                           |

## Diagnostic report

Report at least:

- Workflow key, definition id, version, artifact hash, and enabled/current state.
- Event key, run id, status name/value, reason, manual flag, and timestamps.
- Context/input facts relevant to the decision, with sensitive values omitted.
- Executed node keys in attempt order and the first failing leaf attempt.
- Node type, script or condition expression, status, duration/timestamps, error, and log availability.
- Whether any result/error/log was redacted or truncated.
- Root-cause category: source/compile, activation/config, invocation contract, queue/worker, artifact/module, business script, timeout/cancellation, or authorization/observability.
- Safest recovery: source revision, configuration correction, idempotent retry, new invocation, or explicit compensation.

## Installed implementation discovery

Resolve `@nocobase/app-plugin-workflow/server` and `@nocobase/app-plugin-workflow` through the project's package manager when current implementation details are needed. Inspect the installed declarations for status constants, service methods, route permissions, run-node logging, and timeout behavior; do not assume a monorepo sibling source path exists in an initialized project.
