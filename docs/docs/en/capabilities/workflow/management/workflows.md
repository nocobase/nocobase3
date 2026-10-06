---
title: 'View workflows'
description: 'Use the workflow list, details, read-only diagrams, and version history.'
keywords: 'NocoBase,workflow,Agent'
---

# View workflows

## Open workflow management

After signing in, go to “Settings → Automation”:

- “Workflows” lists deployed processes.
- “Workflow runs” lists execution records for all workflows.

These pages require workflow resource access. If navigation is missing, ask an administrator to confirm client plugin registration and access to settings, and check that the application has been rebuilt and started.

## Use the workflow list

The list supports:

- Search by title or internal identifier.
- Filter enabled or disabled workflows.
- View cumulative run counts.
- Enable or disable workflows.
- Open parameter settings or manual execution.
- Refresh data.

A new deployed version can first appear unpublished and disabled. It becomes current after an administrator reviews and enables it.

Run counts include historical invocations, not just successful ones. Inspect execution records for their statuses.

## View details

Click the title to open details showing:

- Developer title and business description.
- The version being viewed.
- Cumulative run count.
- Enablement switch.
- Parameter settings and manual run entry points.
- A read-only diagram.

If the title or description does not explain the impact, ask the developer before enabling, disabling, or running it. Do not guess from node names alone.

## Read the diagram

Diagrams typically include:

- Start and End.
- Run: perform a business action.
- Condition: select Yes or No.
- Terminate: end the entire run early.
- Extended nodes supplied by other plugins.

Switch between horizontal and vertical layouts, zoom, or fit the diagram. Click nodes for developer descriptions. Workflow details show definition structure, not the actual path of a run; inspect run details for that path.

## View historical versions

The version selector lists materialized revisions. Selecting one only displays its definition and diagram; it does not make it current or rewrite runs.

Historical runs retain their original versions. For diagnosis, open the definition associated with the run instead of using only the current version.

## Common questions

### Why is a newly published workflow missing?

Refresh first. If still missing, ask the developer to confirm builds, deployment, and the correct Artifact loading. Source validation alone does not deploy a workflow.

### Is the run count the success count?

No. It includes historical runs with different statuses. Open “Workflow runs” and inspect by status.

### Why can I not drag or edit nodes?

Management is not a designer. Developers maintain structure in source and create versions through validation, builds, and deployment.

### Why does the diagram differ from a historical run?

You may be viewing the current version while the run used an older one. Use the version and path shown in the run details.
