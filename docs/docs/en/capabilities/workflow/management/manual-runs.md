---
title: 'Manual workflow runs'
description: 'Select a version, provide input, and start a real workflow execution.'
keywords: 'NocoBase,workflow,Agent'
---

# Manual workflow runs

Logged-in users with workflow management access can manually execute a selected version. This supports controlled testing or explicit business operations; it does not replace integration with real business events.

## When to run manually

Typical uses include:

- Testing a newly deployed version with identifiable data.
- A business operation explicitly allowed to be initiated by an administrator.
- A newly authorized operation after the developer fixes a fault.

Manual runs are not previews without side effects or unrestricted retry buttons.

## Check before running

1. The title and description match the business operation.
2. You are viewing the expected version, including any historical or disabled version.
3. Input references the correct business records.
4. You understand writes, messages, stock deductions, and external calls.
5. You have checked whether a run for this business operation already exists.
6. Production execution is authorized.

The system generates a call identifier, but this does not guarantee business writes or external calls will not repeat. If the result is unclear, inspect records before submitting again.

## Enter input and submit

Open “More actions → Run manually” in workflow details. A custom input form is shown if provided; otherwise, the default form uses the version’s input Schema:

- Booleans use checkboxes.
- Numbers and integers use numeric inputs.
- Strings use text inputs.
- Labels and descriptions come from the developer.

Only simple top-level fields are supported by default. For objects or arrays, ask for a custom input form or use the business entry point. JSON text in a plain text field is not automatically parsed.

Submission opens the run details. Invalid input, missing required fields, or undeclared fields are rejected by the server.

You can explicitly authorize the agent in development or testing:

```text
In <development / testing>, manually run <target version> of <workflow business name or directory> once with <input>.
Report its run ID, actual version, final status, and node results, and verify the expected business data.
```

Check the environment, version, and input, terminal status, actual path, and business data. Manual execution does not automatically enable the selected version.

## Inspect the result

Execution is asynchronous; details can initially show “Queued” or “Running”. Observe until a terminal state: success, failure, error, or aborted.

Inspect actual paths and results, not just HTTP success. Confirm domain records or external-system evidence when business correctness matters.

## Common questions

### How does manual execution differ from a business trigger?

Business code handles authentication, validation, input construction, and deduplication. Manual execution lets an administrator select a revision and submit input. Both execute real node code.

### Why can disabled or historical versions still run manually?

Manual execution deliberately selects a revision; it need not be current or enabled. Reconfirm its version and impact first.

### Does a manual run enable the version?

No. Execution and enablement are separate operations.

### Does successful submission mean the business process is complete?

No. It means a run was created. Check execution details and business data for the outcome.

### Can input be changed after a run is created?

No. Existing input snapshots cannot be edited. If no side effects occurred and business rules allow it, create a new run with corrected input. Contact the developer if uncertain.
