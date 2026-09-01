# @nocobase/app-plugin-workflow

Provides the complete optional Workflow capability. Browser-safe graph helpers
live in `client/`; server code is organized by responsibility under
`server/collections`, `server/engine`, `server/instructions`, `server/loader`,
`server/repositories`, and `server/routes`, with `server/service.ts` as the
domain service entry.

The package root is the workflow authoring entry (`defineWorkflow`, `condition`,
and `run`). Application integration uses the deliberately small `./server`
entry, application build tooling uses `./build`, and browser management UI uses
`./client`. Runtime loading and synchronization modules are package-internal.

Applications build their source-owned workflow packages through the public
build API:

```ts
import { buildApplicationWorkflows } from '@nocobase/app-plugin-workflow/build';

await buildApplicationWorkflows({
  sourceRoot: 'server/workflows',
  distRoot: 'dist/server/workflows',
});
```

The application owns when this runs during development and production builds;
the plugin owns workflow discovery, validation, compilation, and Artifact
emission.

The client contributes Workflows and Workflow runs under the application's
Automation settings group. Their record detail routes stay inside the settings
layout at `/settings/automation/workflows/:workflowId` and
`/settings/automation/workflow-runs/:runId`.

Register it with `pnpm plugin:register workflow --app app-template-default`.
Application-owned workflow source remains in the application package. The
plugin itself owns and publishes its complete management UI; enabling the
plugin is sufficient to register the Automation settings pages and their
detail routes.

Server plugins can contribute an instruction through the public Workflow
service. Duplicate instruction types are rejected, while registration timing
is intentionally unrestricted:

```ts
const workflow = app.container.resolve(workflowServiceToken);
workflow.registerInstruction(CustomInstruction);
```

## Development dependencies

The Workflow integration tests intentionally pin `better-sqlite3` 13 and the
matching Knex range instead of using the workspace catalog. The queue test
adapter currently exercises that newer native-driver combination; move these
entries back to `catalog:` once the workspace database fixture is upgraded.

## Agent Skill

The Workflow Agent Skill lives at
`skills/nocobase-app-plugin-workflow` and is published with this
plugin. Whenever the DSL, registered instructions, checker, Artifact builder,
service APIs, or runtime contracts change, review and update the Skill in the
same change.

The Skill is tailored to the default application's workflow source root.
Plugin activation infrastructure is responsible for exposing installed plugin
skills to agents under the application's `.agents/skills/` directory.
