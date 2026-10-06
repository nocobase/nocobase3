---
title: 'Overview and preparation'
description: 'Prepare your application, agent, Workflow Skill, and development environment.'
keywords: 'NocoBase,workflow,Agent'
---

# Overview and preparation

Use an application agent to write workflows: you describe the business goal, review the plan and risks, and accept the execution evidence; the agent inspects the application, implements workflows and business code, and runs validation. The management UI enables workflows, configures parameters, and displays runs; it does not edit workflow structure.

An “application agent” is a coding agent working in the application directory, such as Claude Code or Codex. You do not need to learn the DSL first. Start by explaining the business and expected outcome.

## What to prepare

| Item                       | Requirement                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NocoBase 3 application     | Create an application and make sure dependencies can be installed. See [Create an application](../../../get-started/create-app.md) if you do not have one. |
| Workflow plugin            | Install and register `@nocobase/app-plugin-workflow`; application templates include it by default.                                                         |
| Application agent          | Open the application directory with your coding agent so it can read application code and project guidance.                                                |
| Workflow Skill             | The application `.agents/skills/` contains `nocobase-app-plugin-workflow`.                                                                                 |
| Development environment    | Start with `pnpm dev`, sign in as an administrator, and access “Settings → Automation → Workflows”.                                                        |
| Requirements and test data | Identify the trigger, rules, adjustable settings, and side effects. Prepare identifiable test data that can be cleaned up.                                 |

Do not test workflows under development directly in production. Manual runs execute real business code and can write data or call external systems.

## Prepare the Workflow Skill

The plugin ships the `nocobase-app-plugin-workflow` Skill with development steps, node usage, and validation guidance for the installed version. It synchronizes into the application `.agents/skills/`. If it is missing or needs updating after installing or upgrading the plugin, run this in the application root:

```bash
pnpm nocobase skills sync
```

Confirm that `.agents/skills/nocobase-app-plugin-workflow/SKILL.md` exists and ask the agent to read it. `.agents/skills/` is generated and replaced on the next sync; do not edit it directly. You usually do not need to name the Skill in every request. To specify the development approach, say “Use the Workflow Skill to analyze this application.”

## Three basic concepts

1. Each directory under application `workflows/` is a workflow package. Its directory name is the stable key used to trigger it.
2. Each accepted new business event creates a run associated with the workflow version selected at its start. Repeating an eventKey does not create another run.
3. Workflows orchestrate business stages and paths. Handlers call application Services for data operations, transactions, and external integrations.

## Next steps

- [Development process](./process.md): describe requirements, choose an approach, review the plan, implement, test, and connect triggers. Each step includes an agent request and acceptance criteria.
- [Validation, builds, and publishing](./verification-and-diagnostics.md): validate, build, and deploy, then have an administrator enable the new version.
- [Quick start](../quick-start.md): run the existing quotation example to see branches, node results, and execution records.

For code review, see the [Workflow definition DSL](../reference/dsl.md), [Nodes](../reference/nodes/index.md), and [Trigger workflows](../reference/service-api.md). For daily operations and diagnosis, see [Manage workflows](../management/index.md).
