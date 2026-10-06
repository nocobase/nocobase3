---
title: 'Management overview'
description: 'Configure, enable, run, and observe workflows supplied by application developers.'
keywords: 'NocoBase,workflow,Agent'
---

# Management overview

This section is for business administrators. Management operates workflows published by application developers; it does not create or edit their structure.

## Available operations

- View workflows, details, diagrams, and historical versions.
- Configure administrator parameters exposed by the developer.
- Enable, disable, or enable a new version.
- Manually run a chosen version in an authorized scenario.
- Inspect status, actual paths, node results, errors, and logs.

## Where to start

1. [View workflows](./workflows.md).
2. [Set parameters and manage versions](./parameters-and-versions.md).
3. [Run manually](./manual-runs.md).
4. [Inspect execution records](./run-inspection.md).

## Operational boundaries

Diagrams are read-only. Nodes, branches, input formats, and parameter declarations come from published source; administrators cannot add, delete, or connect nodes in the UI.

Enablement, parameter changes, and manual runs change application state; manual runs can also cause real business side effects. Confirm the version and impact first. Execution history is diagnostic evidence; do not delete or rewrite it to hide failures.

Management pages and related APIs require login and workflow page access checks. Deployers should still restrict management access according to organizational requirements; login alone is not fine-grained operation auditing.

## Report to the application developer

Instead of only saying “the workflow failed”, provide evidence such as the run ID. See [What to report](./run-inspection.md#what-to-report-to-the-application-developer). The developer can give that ID to the application agent for diagnosis.
