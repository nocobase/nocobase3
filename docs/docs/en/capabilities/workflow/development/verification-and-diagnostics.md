---
title: 'Validation, builds, and publishing'
description: 'Validate definitions and application integration, build Artifacts, deploy and enable versions, and verify the release.'
keywords: 'NocoBase,workflow,Agent'
---

# Validation, builds, and publishing

A workflow reaches execution through definition validation, application compilation, Artifact building, runtime loading, and administrator enablement. Each verifies a different scope; none replaces the others. Run the following commands from the application root.

## Development: save and test

The server started by `pnpm dev` compiles source under `workflows/` on demand rather than reading build output:

- Save `workflow.ts` and refresh management to see a new disabled version, without building or restarting.
- Enable it before setting parameters or running it manually.
- Further source changes create candidate versions. The enabled version stays unchanged until you enable the new one.

Development validates against node types registered in the runtime, so nodes from other plugins need no extra configuration. Build in development when you need a deployable Artifact or want to check what deployment will receive.

## Validate the definition

```bash
pnpm nocobase workflow check workflows/<workflow-directory>
```

Validation runs five phases in order. Fix the earliest failing phase first:

1. `typecheck`: strict TypeScript checks on the definition.
2. `evaluate`: evaluate `workflow.ts` in a disposable restricted process and read its default export.
3. `schema`: validate input, parameters, and node configuration.
4. `semantic`: validate node types, keys, branches, and parameter references.
5. `compile`: verify a complete, reachable, acyclic topology.

It does not load handlers or write to the database. Add `--ir` to print the flattened definition, which becomes `workflow.json` in the Artifact. The command recognizes built-in nodes only; see [Custom nodes](../reference/custom-instructions.md) for extended types.

## Validate handlers and integration

Handlers use the ordinary application server build, so run application validation as well. These are template application commands; use the actual scripts in your application and limit tests to relevant business behavior:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Verify module paths and named `run` exports, dependencies in the correct manifests, resolvable Service tokens, representative branches, result structures, and idempotent side effects.

## Build the Workflow Artifact

An Artifact is the immutable workflow version loaded by the runtime. The default application `pnpm build` includes this step. You can also run it separately:

```bash
pnpm nocobase workflow build
```

Production builds collect `.js` files from application server output at matching relative paths and compute a digest of the content. Storage and loading revalidate the digest. Do not point the output directory at source or unrelated directories. Artifact building does not enable workflows or replace application compilation.

## Publish and enable a version

1. Modify the workflow and business code.
2. Complete definition checks, application tests, and builds.
3. Deploy the application code and Artifacts.
4. Have an administrator review and enable the target version in management.

Enablement makes it the current version; existing runs retain their original versions. Do not edit stored definitions or historical runs to “update” old versions.

You can ask the agent to complete validation:

```text
Validate this workflow change using the actual application scripts and node types. For built-in nodes, run workflow check; for custom nodes, use validation and build entry points with the extended node contracts. Run typecheck, relevant tests, lint, and build.
Report each command, exit result, and skip reason; state whether the Artifact was generated and which runtime or external-system behavior remains unverified. Do not report checks you did not run as passed.
```

Check that the report includes the workflow directory, validation scope, tests, and Artifact generation. For business integration, also require test input, expected paths, and actual run IDs.

## Verify after publishing

After deployment and enablement, confirm the current version matches the release, administrator parameters still apply, and business or schedule triggers reference the correct workflow. Before a trial run, confirm the environment, input, and side effects; inspect the final status, actual path, and business data.

For errors, record the run ID, actual version, and trigger time, then use [Execution records and diagnosis](../management/run-inspection.md). That page also includes an agent diagnosis example. Diagnosis must not automatically create runs, enable or disable workflows, or modify data.

## Common validation and build issues

### Definition checks pass, but the application build fails

Definition validation does not load handlers. Check that modules exist, application tsconfigs include them, dependencies resolve, and each module exports a named `run` function.

### A handler cannot be loaded

Check its inclusion in the Artifact, relative path consistency, correspondence between development `.ts` and production `.js` files, and the named export.
