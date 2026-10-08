---
title: 'Overview'
description: 'Understand workflow use cases, capability boundaries, and the responsibilities of people and agents.'
keywords: 'NocoBase,workflow,Agent'
---

# Overview

NocoBase 3 workflows implement business processes with independent lifecycles. Business events produce run records; the system executes versioned processes in the background and stores each step’s results, errors, and logs.

Use an application agent to write workflows in source code. Describe the business in natural language and review its plan and evidence. Administrators enable workflows, adjust parameters, run them manually, and inspect execution records in the UI.

To try one immediately, see [Quick start](./quick-start.md).

## When to use a workflow

Ask one question: **Does this business process need an independent, persistent, observable lifecycle?** Common signals include:

- Administrators need to see the path taken and where processing stopped.
- The process has meaningful business stages and chooses paths based on results.
- Reliable background execution, duplicate-event handling, or an overall timeout is required.
- Version history matters, and historical runs must be interpreted against their original definitions.
- Administrators need to adjust a few settings, such as thresholds, without changing code.

Examples include order fulfillment, customer onboarding review, inventory replenishment, quotation risk assessment, and scheduled business reports.

Ordinary typed code is more appropriate for:

- Queries or calculations completed within one request.
- Atomic writes that must share a database transaction.
- Algorithms or transformations that need no independent run records.
- Failures that only need an error returned to the caller rather than continued observation.

Code length, multiple function calls, asynchronous execution, and branches alone do not justify a workflow. If unsure, ask the agent to assess the business and explain its decision.

## Workflows and business code

| Workflow responsibility                                          | Business code responsibility                    |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| Business stages, ordering, and branches                          | Data validation, queries, and writes            |
| Process status, versions, and run records                        | Calculations, transformations, and domain rules |
| Background scheduling, event deduplication, and overall timeouts | Transactions and uniqueness constraints         |
| Coordination of meaningful business actions                      | External clients and specific integrations      |

For replenishment, the workflow owns “Calculate shortage → Replenishment needed? → Create replenishment or record sufficient stock”. Application Services still read stock, calculate shortages, and write replenishment records.

## People and agents

An “application agent” is a coding agent working in the application directory, such as Claude Code or Codex. The plugin ships the `nocobase-app-plugin-workflow` Skill, synchronized into `.agents/skills/`, to guide syntax and operations for the installed version.

| Role                   | Responsibility                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Application developer  | Explain goals, rules, and side effects; review approach, stages, and risks; accept validation, test, and execution evidence.     |
| Application agent      | Inspect structures, Services, and plugin capabilities; implement workflows and business code; validate, test, build, and report. |
| Business administrator | Enable, disable, or switch versions; set exposed parameters; run manually; inspect records and report errors.                    |

You do not need to learn the DSL before describing requirements. Use its reference when reviewing code; the Skill guides agent implementation.

## Current capabilities and boundaries

The plugin includes three node types:

- **Run**: perform a business action, such as a calculation, data operation, or Service call.
- **Condition**: use a boolean decision to enter the Yes or No branch.
- **Terminate**: end the whole process early, from the main path or a branch.

It also provides asynchronous queue execution, event-identity deduplication, overall timeouts, versions and run records, node diagnostics, and optional custom input and parameter forms.

There are three trigger options: application code calls the Workflow Service, a schedule uses the built-in `workflow` target, or an administrator runs manually. See [Trigger workflows](./reference/service-api.md).

The following are not provided by default:

- **Persistent pause and resume**: approval, external callbacks, or continuing after more information arrives require a plugin with suitable nodes or a reusable custom implementation.
- **Loops, subflows, and arbitrary connections**: definitions use a tree of sequences and conditional branches.
- **UI designer**: the management diagram is read-only; structure changes happen in source code.

## Terms

| Term                     | Meaning                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Workflow package         | A directory under application `workflows/`, containing `workflow.ts` and its handler modules.   |
| Workflow key             | The package directory name; a stable identifier used by business triggers.                      |
| Node                     | A concrete step with its own key, configuration, and execution records.                         |
| Instruction              | The implementation of a node type, such as Run or Condition; one type can serve multiple nodes. |
| Handler                  | A server module referenced by Run or Condition, exporting a named `run` function.               |
| Input                    | Per-trigger data, such as a product ID.                                                         |
| Administrator parameters | A few adjustable settings, such as target stock.                                                |
| Version                  | A revision of the definition; a run retains the version selected at its start.                  |
| Artifact                 | An immutable build output loaded by the runtime after deployment.                               |
| Run (execution)          | One workflow invocation storing input, status, and node records.                                |
| eventKey                 | Business event identity; repeating the same key produces only one run.                          |

## Next steps

- [Quick start](./quick-start.md): enable an example, run it, and inspect the results.
- [Develop with an agent](./development/index.md): preparation, development steps, and publishing validation.
- [Management overview](./management/index.md): daily administration.
- [Reference](./reference/dsl.md): DSL, nodes, and trigger API details for code review.
