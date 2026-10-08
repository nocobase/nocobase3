---
title: 'Execution records and diagnosis'
description: 'Inspect status, actual paths, node attempts, results, errors, and logs.'
keywords: 'NocoBase,workflow,Agent'
---

# Execution records and diagnosis

Execution records answer “What happened in this run?” Each run is associated with a version and stores input snapshots, status, times, and node execution evidence.

## View execution records

Open “Settings → Automation → Workflow runs”. Filter by workflow title and status; rows show run ID, title, trigger time, status, and duration. The current status filter offers Running, Completed, Failed, and Error. Queued and Aborted appear in the unfiltered list but have no separate filter choices.

You can also click the run count in workflow lists or details to see recent records. Record the run ID first to avoid confusing runs at similar times.

## Understand run status

| UI status | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| Queued    | Created, but background execution has not started.              |
| Running   | Background execution is in progress.                            |
| Completed | The selected path ended normally.                               |
| Failed    | The process or node reached a failure conclusion.               |
| Error     | Node code, modules, or infrastructure encountered an exception. |
| Aborted   | Execution was stopped, possibly because of a timeout.           |

Brief queuing is normal. If status stays unchanged, give the developer the run ID and time to inspect background execution.

“Completed” means the workflow state machine ended normally; it does not prove every external system achieved the business goal. Verify important side effects against domain data.

## View run details

Details show:

- Workflow title and the version used by this run.
- Trigger time, total duration, and overall status.
- A diagram with execution status overlays.
- Input snapshot.
- Nodes actually reached.

Interpret details using the run’s own version. Later releases do not change its path or input.

## Inspect node attempts and payloads

Click an executed node to inspect:

- Title and developer description.
- The displayed attempt.
- Results.
- Errors.
- Node logs.
- Truncation indicators for oversized content.

Common secret fields and log fragments are redacted, and oversized results, errors, or logs are truncated. These protections do not mean the original business value was empty. Give the developer the run ID, node, and time to correlate server logs; do not disable redaction.

A node can have multiple attempts. Inspect the latest first when diagnosing its current result, then compare statuses over time.

## Recommended diagnosis order

1. Confirm overall status and the actual version.
2. Inspect the actual path.
3. Find the first failed leaf node.
4. Inspect its latest attempt’s results, errors, and logs.
5. Note redaction and truncation.
6. Give the evidence to the developer to decide recovery.

A parent Condition can fail because a Run inside its branch failed. Inspect the deepest failing node first rather than treating propagated state as the root cause.

## What to report to the application developer

Provide at least:

- Workflow name.
- Run ID.
- Workflow version.
- Trigger time.
- Whether it was run manually.
- Overall status and reason.
- First failed node and attempt.
- Error summary.
- Redaction or truncation of results or logs.

Do not paste passwords, tokens, cookies, or complete sensitive input into chats or tickets.

## Ask the agent to diagnose

Provide a run ID or a workflow, time, and event that uniquely identify it:

```text
Diagnose workflow run <run ID>. Confirm its actual version and path, find the first failed leaf node, and inspect that node’s latest attempt errors and logs. Separate the root cause from errors propagated to parent nodes.
Only read evidence. Do not rerun, change parameters, or modify data.
```

Check that the report includes run ID, version, status, failed node and attempt, error evidence, redaction or truncation, and a proposed recovery. Diagnosis and recovery are separate tasks. Confirm impact and explicitly authorize new runs, enablement, or parameter changes.

## Recovery principles

- Parameter errors: correct settings, then have the business owner decide whether to create a new run.
- Input errors: historical input cannot change; confirm side effects before creating a run with corrected input.
- Code errors: the developer fixes, tests, and publishes a new version.
- Temporary faults: repeating an eventKey does not replay an existing failed run. Confirm side effects before deciding on a new run, and use business unique keys to prevent duplicate writes.
- Partial side effects: perform explicit compensation rather than deleting history.

A diagnosis request should not automatically rerun, enable or disable, or modify data. Confirm the impact of those recovery actions separately.

## Common questions

### Does a long queue always indicate a fault?

No. Brief waiting is normal. For persistent queuing, provide the run ID and time to the developer to inspect background execution and queues.

### How do failure, error, and abort differ?

Failure is usually a business or instruction failure; error is an exception; abort means execution stopped, often due to timeout. Use node errors, the run reason, and logs to decide.

### Why is a parent failed when the error is in a child?

A branch failure propagates to the parent Condition and the run. The first failing leaf is usually closest to the cause.

### Why does a node have multiple attempts?

Re-execution or recovery can create multiple attempts. Inspect them chronologically; the first is not necessarily the current result.

### Why are results or logs incomplete?

Secret redaction or size truncation may apply. The UI indicates truncation; the developer can correlate structured logs.

### Why are some nodes still Pending after the process ends?

A Terminate inside a Condition branch can end the workflow before the parent’s normal resume completes. Use the Terminate and overall terminal status to assess it, not the parent status alone.
