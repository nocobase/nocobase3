---
name: nocobase-app-plugin-scheduler
description: Develop scheduled tasks in NocoBase 3 that business administrators need to view and track through the application UI. Define schedules in code, choose ordinary Jobs or Workflow Jobs, integrate execution status, and extend target types. Do not use Scheduler to manage tasks that do not need UI visibility.
metadata:
  short-description: Define scheduled tasks with administrator-facing execution history
---

# Develop Scheduled Tasks in an Application

Use the installed version's public exports, without importing plugin internals. The application owns business logic, schedule declarations, Providers, permissions, and deployment timing. Scheduler owns scheduling projections, trigger history, and execution state. The plugin's `skills/` directory is the source of truth; do not edit the synchronized application copy under `.agents/skills/`.

## Decide Whether to Use Scheduler

The primary reason to define tasks through Scheduler is **UI observability for business administrators**. Developers define schedules and execution logic in code. Business administrators use the application's task list and detail pages to view schedules, track individual executions, and enable or disable tasks when authorized.

Tasks that do not need to be viewed and tracked through the UI must not be managed by the Scheduler plugin. Use the application's Queue or existing background scheduling mechanism for those tasks. For administrator-visible tasks, deliver Client registration, access permissions, meaningful task names, and accurate final execution status together; successful server-side dispatch alone is incomplete.

## Then Choose the Execution Model

After deciding to use Scheduler, choose according to business complexity:

| Scenario                                                                                  | Choice             | Implementation boundary                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Periodic cleanup, cache refresh, a single report, or one business Service call            | Ordinary `job`     | Short operations may complete directly; dispatch lengthy, batch, or retryable work to a business Queue Job |
| Staged processing, branches, persisted node state, or node-level diagnostics              | `workflow`         | Scheduler determines when to trigger; Workflow orchestrates the process and nodes call typed business code |
| A simple operation that happens hourly                                                    | Ordinary `job`     | Cron alone is not a reason to introduce Workflow                                                           |
| Immediate asynchronous execution or a one-time delay                                      | Queue              | No Cron Schedule is needed                                                                                 |
| Another execution system with its own references, status queries, and completion protocol | Custom target type | Extend `ScheduleTargetRegistry`; a new business Job does not require a new target type                     |

Here, “Workflow Job” means `target.type: 'workflow'`, not an additional Queue Job wrapping a workflow. Ordinary Jobs do not depend on the Workflow plugin. Neither approach guarantees exactly-once external business effects; design business idempotency for both.

## Read by Task

- To create or change a schedule, read [Definitions, Registration, and Synchronization](references/definitions.md), including ordinary Job and Workflow declarations.
- To add a business Job, integrate Queue, or extend target types, read [Target Extensions and Execution Protocol](references/targets.md).
- To integrate the UI/API, verify behavior, or diagnose failures, read [Operations and Verification](references/operations.md).
- To author the workflow itself, use the installed Workflow plugin's `nocobase-app-plugin-workflow` skill. Confirm supported Instructions instead of inventing nodes from business terminology.

## Development Loop

1. Establish which tasks and execution records administrators need to see. Check Server/Client/CLI registration, page permissions, Database Queue configuration, and target availability, then choose `job` or `workflow`.
2. Implement business logic and Providers in application source, declare a `defineSchedule()` array with stable keys, and register its module as a Server contribution.
3. Validate payload/input, timezone, idempotency, and asynchronous completion reporting. Obtain credentials through secure business Service configuration, never `target.config`.
4. Run application type checks, relevant tests, and build. Synchronize definitions and, in development, use an administrator account to find the task in the UI and track a real execution to its final state. Confirm the business result.
5. Report the schedule key, execution model, timezone, validation evidence, and unverified runtime boundaries. Use `--finalize` in production only when the complete manifest is visible.

Schedules are defined in code. There is no management API for creating or editing Cron definitions, but the UI and API support enabling and disabling tasks. Do not modify `schedule_definitions`, `queue_schedules`, or `schedule_occurrences` directly, or replace the infrastructure `ScheduleDispatchJob`.
