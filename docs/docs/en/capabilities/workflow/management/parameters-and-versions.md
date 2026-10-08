---
title: 'Parameters, enablement, and versions'
description: 'Configure parameters, control enablement, and manage new workflow versions.'
keywords: 'NocoBase,workflow,Agent'
---

# Parameters, enablement, and versions

These operations affect later business runs. Confirm the workflow, current version, and developer’s business description before changing them.

## Set administrator parameters

If the developer declared parameters, edit them through “More actions → Parameter settings” in the list or details.

Parameters support small string, number, and boolean settings, such as target stock or risk thresholds. Input placeholders show developer defaults. Saved settings apply to new runs, not running or completed ones.

The default parameter UI handles strings and numbers but has no boolean switch. Do not type `true` or `false` into a text field expecting boolean conversion. Ask for a custom form when booleans or better explanations are needed; see [Custom input and parameter forms](../reference/dsl.md#custom-input-and-parameter-forms).

:::warning Note

Parameters are not secret storage. Do not enter passwords, access tokens, cookies, or other credentials.

:::

Check numeric types and developer guidance before saving. Values must match declared types and enums, or the server rejects the update.

To ask an agent to set them, specify the environment, workflow, and values:

```text
In <environment>, set <parameter> of <workflow business name or directory> to <value>. Read it back and report the target version and save result. Do not start a run.
```

Check that the environment, workflow, and version are correct, and that read-back values match the request.

## Enable a workflow for the first time

A newly deployed workflow can appear unpublished and disabled. Review its description, then enable it to make it current. Enable a new candidate before setting parameters or running it manually.

Enablement changes whether ordinary business triggers are accepted; it does not start a run.

## Disable a workflow

Disabling blocks new runs from ordinary business operations but preserves history. Manual runs are a separate management operation; confirm their version and impact as described on that page.

Disabling does not undo side effects. Inspect the final status of already-created runs rather than assuming the switch rolls back data or external calls.

## Enable a new version

After the agent implements and validates changes and the application is deployed, management shows a candidate version. Review and enable it to make it current.

Before enabling, check:

- Changes to input fields.
- Compatibility of existing administrator parameters.
- Writes, notifications, or external calls introduced by new nodes.
- Deployment of matching business trigger code.
- Tests, builds, and necessary runtime evidence from the agent.

Old runs do not migrate; they retain their starting version, paths, and results.

When asking the agent to enable or disable, state the target version and state:

```text
In <environment>, <enable / disable> <target version> of <workflow business name or directory>. Report the resulting current version and enablement state. Do not start a run.
```

Check that the current version and state match the request and no extra run was created.

Versions fix the definition and handler modules shipped with the workflow package. Application Services, database structures, and external systems can still change. A fixed version does not freeze the entire business environment; check old-version compatibility when publishing application changes.

## Common questions

### Why is parameter settings unavailable for some workflows?

The menu is available only when parameters are declared. Per-run input is not a parameter setting.

### Do parameter changes affect running or completed instances?

No. Each run uses its starting snapshot. New settings apply to subsequently created runs.

### Are new versions enabled automatically?

No. Deployment and enablement are separate; an administrator reviews and enables the target version.

### Does enabling a new version change historical runs?

No. They retain their versions, input snapshots, paths, and results.

### Does disabling delete workflows or history?

No. It blocks later ordinary business triggers and preserves definitions and records.
