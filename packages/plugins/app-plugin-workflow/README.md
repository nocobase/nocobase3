# @nocobase/app-plugin-workflow

Provides the complete optional Workflow capability. Browser-safe graph helpers
live in `client/`; server code is organized by responsibility under
`server/collections`, `server/engine`, `server/instructions`, `server/loader`,
`server/repositories`, and `server/routes`, with `server/service.ts` as the
domain service entry. TypeScript source loading, checking, package scanning,
and Artifact generation live behind the build boundary and are not loaded by
the server runtime.

The package root is the workflow authoring entry (`defineWorkflow`, `condition`,
`terminate`, and `run`). Application integration uses the deliberately small `./server`
entry, application build tooling uses the contributed `workflow` CLI topic, and browser
management UI uses `./client`. Runtime loading and synchronization modules are
package-internal; `./build` remains public for applications that need to supply
custom Instruction contracts.

Applications build their source-owned workflow packages through the installed
command:

```bash
pnpm nocobase workflow build \
  --source-root server/workflows \
  --dist-root dist/server/workflows \
  --resource-root dist/server/workflows
```

Applications with custom Instructions can use the public build API and pass
the same contracts that their server plugins register at runtime:

```ts
import { buildApplicationWorkflows } from '@nocobase/app-plugin-workflow/build';

await buildApplicationWorkflows({
  sourceRoot: 'server/workflows',
  distRoot: 'dist/server/workflows',
  instructions,
});
```

In development, omit `resourceRoot` so artifacts retain the source package's
relative `.ts` resources. In production, run the application's normal server
build first and point `resourceRoot` at its compiled workflow tree. Artifacts
then retain the same relative paths with `.js` resources. The plugin owns
workflow discovery, validation, resource collection, and Artifact emission; it
does not compile run modules separately or maintain a module-path manifest.

## Development loading

A development server does not need this build at all. When the runtime is not
production and a workflow source root is configured, the loader compiles
`server/workflows` on demand instead of reading `dist/server/workflows`, so an
edited `workflow.ts` appears as a new revision without running a command and
without restarting the process. Compilation is skipped while the source tree is
unchanged, and it costs milliseconds when it is not.

The definition it produces is the one a build would produce: the same schema
validation, semantic validation, flat IR compilation, resource collection, and
content-addressed digest. What it drops is `ts.createProgram`, which is the
expensive half of a build and which the application's own typecheck already
covers, and the disposable evaluation process, which a development server that
already runs under a TypeScript loader does not need. Because the digest matches,
the revision a developer enables in development is the revision the build later
produces for production.

Development also validates against the instruction set the engine will execute
with rather than the core set alone, so an instruction a plugin registers at
runtime is understood without configuring a build entry for it. A key that
exists only under `dist/server/workflows` is still offered, and source wins for
a key present in both.

Starting a run has a matching precondition. Production requires the revision's
Artifact to be committed to the store, because that is where its run modules are
resolved from; development requires the source package, because that is where the
engine resolves them from instead.

`nocobase workflow check <package> --ir` prints the same compiled flat IR for one
package, with the full five-phase check, for reading a definition outside a
running server.

The CLI evaluates each declarative `workflow.ts` in a bounded disposable Node
process, so it does not need a separate bundler. TypeScript is provided by the
application's existing build toolchain for source checking. The CLI and its
build modules remain part of the published package so applications can build
Workflow Artifacts, but the production `./server` runtime module graph does not
load those modules or TypeScript. Development source loading is the one part of
the build boundary a running server reaches, and it does so through a dynamic
import that a production runtime never evaluates and that never loads the
compiler.

The client contributes Workflows and Workflow runs under the application's
Automation settings group. Their record detail routes stay inside the settings
layout at `/settings/automation/workflows/:workflowId` and
`/settings/automation/workflow-runs/:runId`.

Register it with `pnpm plugin:register workflow --app app-template-default`.
Application-owned workflow source remains in the application package. The
plugin itself owns and publishes its complete management UI; enabling the
plugin is sufficient to register the Automation settings pages and their
detail routes.

Run modules receive execution options containing a read-only application
service resolver, the Workflow abort signal, and a contextual logger. They
import the service owner's original public token and can consume configured
application services without receiving the Application or its mutable
container.

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
