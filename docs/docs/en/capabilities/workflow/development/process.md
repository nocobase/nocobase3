---
title: 'Development process'
description: 'Design, implement, test, and connect a business workflow with an agent, then review the evidence.'
keywords: 'NocoBase,workflow,Agent'
---

# Development process

This page is for developers implementing their own business workflows. It follows one development task and explains what to provide, how to ask the agent, and what to check. Complete [Overview and preparation](./index.md) first. Replace the `<...>` placeholders below; the main example is inventory replenishment.

## 1. Describe the requirements

Explain five things: the trigger, business rules, administrator settings, writes or external calls, and duplicate-event handling. You do not need to choose directory names, node keys, or a technical approach in advance.

```text
Add inventory replenishment to our application:
- After product stock changes, check in the background whether current stock is below target stock.
- Administrators configure the target stock; the default is 100.
- When stock is insufficient, create a replenishment record containing the product, current stock, and shortage quantity. Otherwise, only record the check result.
- Administrators must see the steps and results of each run.
- Duplicate notifications of the same stock change must not create duplicate replenishment records.
Summarize the rules and questions that need clarification first. Do not modify code yet.
```

Check that the agent understands the event, replenishment condition, default parameter, write content, and duplicate-event rule. It should identify missing information rather than invent business rules.

## 2. Decide whether a workflow is needed

Use a workflow when the business needs an independent, persistent, observable lifecycle. Queries or calculations within one request and atomic writes within one transaction usually belong in ordinary business code. Queues, multiple function calls, or conditional branches alone do not justify a workflow.

```text
Inspect the application data structures, Services, and installed nodes. Decide whether inventory replenishment should use a workflow, ordinary business code, or both.
Explain the reasons, reusable capabilities, and gaps. Do not modify code yet.
```

Check that the recommendation follows the needs for observability, background execution, versions, or parameters; identifies actions that stay in Services; and lists the structures and plugins actually inspected. Waiting or human approval requires checking installed capabilities, not inventing nodes.

## 3. Review the plan

A plan must cover business stages, input and parameters, event identity, and side effects. A diagram alone is not enough to start implementation.

```text
Propose the inventory replenishment implementation: include a flow diagram, node responsibilities, per-run input, administrator parameters, stable event identity, write idempotency, and failure recovery.
Identify any tables, Services, or node capabilities that need adding or changing. Present the plan for review first.
```

### Nodes represent business stages

A useful breakdown is “Calculate shortage → Replenishment needed? → Create replenishment / Record sufficient stock”. Keep queries, calculations, and writes inside handlers or Services. Do not turn “Read one row → Read a field → Subtract → Assemble an object” into individual nodes, or hide the entire multistage process in one Run module.

The built-in Run, Condition, and Terminate nodes perform business actions, choose boolean branches, and end the process early. Persistent waiting, human approval, loops, and subflows require dedicated lifecycle support. Do not simulate waiting by keeping a Run module on a Worker for a long time. Check available capabilities before extending them; see [Custom nodes](../reference/custom-instructions.md).

### Separate input and administrator parameters

Input changes with the business event, such as a product ID and stock revision. Administrator parameters are small settings adjustable after deployment, such as target stock. Both are snapshotted when a run starts; later changes do not affect existing runs. Keep credentials in application configuration or secret management, not input or parameters.

### Confirm event identity and side effects

For example, `stock-changed:<productId>:<revision>` identifies a committed stock change. Redeliver the same event with the same eventKey; a new change gets a new identity. eventKey is deduplicated across the application, and repeating it does not replay an existing failed run.

Event deduplication does not replace business idempotency. Constrain replenishment writes with a business unique key such as the stock-change ID. If a run fails after partial side effects, decide whether to create a new run or perform explicit compensation. Workflows do not automatically roll back external side effects.

Check that nodes have business meaning, input and parameters are distinct, and node types are available. Each write, message, or external call needs an idempotency strategy and a recovery boundary. Confirm any new data structures.

## 4. Implement the workflow and business code

After confirming the plan, ask the agent to write definitions, handlers, and relevant tests. See the [Workflow definition DSL](../reference/dsl.md) and [Nodes](../reference/nodes/index.md) for syntax.

```text
Implement the confirmed inventory replenishment plan using existing Services. Add tests for insufficient stock, sufficient stock, and duplicate events.
Use the actual application scripts and node types to run applicable definition checks, type checks, relevant tests, and lint. Report each command, result, and reason for skipping a check.
Provide the workflow directory, node responsibilities, test data, input, expected path, and cleanup instructions.
```

Check the directory and key, and whether node descriptions explain business rules and side effects to administrators. Require actual check and test results, with unverified database or external-system behavior stated explicitly.

## 5. Test in development

`pnpm dev` compiles workflow source on demand. Save changes, refresh management, enable the target version, configure parameters, and run manually. Use identifiable data you can clean up. Manual runs execute real business code; they are not previews.

See [Parameters, enablement, and versions](../management/parameters-and-versions.md) for configuration and [Manual workflow runs](../management/manual-runs.md) for input submission. You can also explicitly authorize the agent:

```text
In development, enable <target version> of the inventory replenishment workflow. Use your proposed test data to run insufficient-stock and sufficient-stock cases.
Report each run ID, actual version, final status, path, and node results, and verify the replenishment records. Do not operate in production.
```

With target stock 100, stock 20 should create a replenishment record for 80, and stock 120 should create none. Check that both runs reach terminal states and that paths, results, and business data match expectations. If submission is unclear, inspect execution records before submitting again.

For errors, see [Execution records and diagnosis](../management/run-inspection.md#ask-the-agent-to-diagnose). Keep diagnosis and recovery separate: gather evidence first, then confirm the impact of recovery actions.

## 6. Connect real triggers

Writing a workflow does not automatically subscribe to business events. After manual testing, connect it to the real business operation or a schedule.

### Business event triggers

```text
Connect inventory replenishment to the actual stock-change logic.
Use the same event identity for duplicate deliveries of one stock change. Handle accepted and skipped receipts, and prevent duplicate replenishment writes.
Add tests and report the operation that triggers it, how eventKey is built, and how skipped triggers are handled. Do not add a generic public trigger endpoint.
```

Check the trigger file and business entry point, eventKey construction, `skipped` handling, and duplicate-delivery test results. `accepted` can refer to a new or existing run and does not mean business success; execution records determine the final outcome. See [Trigger workflows](../reference/service-api.md) for API semantics.

### Scheduled triggers

If the business instead checks daily, ask the agent to configure scheduling:

```text
Run <workflow business name or directory> every day at <time> (<timezone>) with input <input>.
Use the built-in workflow schedule target. After synchronization, tell me how to confirm the execution records in the UI.
```

Check the schedule key, Cron, timezone, workflow, and input; require synchronization results and the locations of schedule and workflow execution records. See [Scheduler](../../scheduler.md) for schedule operations.

## 7. Validate and publish

After testing and integration, follow [Validation, builds, and publishing](./verification-and-diagnostics.md) to validate, build, and deploy. An administrator then reviews and enables the new version; deployment does not enable it automatically.

## Modify an existing workflow

Changes also require impact analysis, implementation, testing, and publishing. Supply the business name or directory and the new rule:

```text
Change <workflow business name or directory> to follow <new rules>.
Locate its workflow and Services first. Explain the impact on input, parameters, node results, and published versions, then modify and test.
```

Check that the directory is correct, compatibility impact is explained, and tests and trial runs cover the changed rules. If several workflows match, the agent should list candidates for you to choose, not guess a database ID. Historical runs retain their versions; enable the new version after deployment.

## Review checklist

This is the shared checklist for agent development tasks. Other pages add checks specific to their topics.

**Plan**

- Why a workflow is or is not appropriate, and which actions stay in Services.
- Whether nodes represent business stages rather than individual queries.
- Whether per-run input and administrator parameters are distinct and contain no credentials.
- Whether node types are registered; whether approval or waiting requirements exceed available capabilities.
- How writes, messages, and external calls remain idempotent, and how failures are recovered or compensated.

**Delivery**

- Data structures, Services, and plugin capabilities actually inspected.
- Workflow directory, trigger entry point, test input, expected path and results, and trial run IDs.
- Definition checks, type checks, relevant tests, lint, and build commands actually run for the application scripts and node types, including results and skip reasons.
- Business event integration and `skipped` handling.
- Database, external-system, or runtime behavior not yet verified.

“Done” or “the code looks correct” is not evidence.

## Common questions

### The agent did not use a workflow

Review its reasons first. Atomic, synchronous operations that need no run records are better suited to ordinary code. If persistence, path inspection, or administrator parameters are essential, add those requirements and ask it to reconsider.

### The agent used a node that is not installed

Ask it to inspect installed plugin public exports and confirm registration in source validation, Artifact builds, and runtime. Use existing capabilities, implement a reusable custom node, or redesign the process; a plausible node name is not enough.

### The agent reported success without evidence

Require the actual commands, exit results, and skip reasons. At minimum, distinguish definition validation, application handler type checks, tests, and the complete build.
