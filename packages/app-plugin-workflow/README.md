# @nocobase/app-plugin-workflow

Provides the complete optional Workflow capability. Browser-safe graph helpers
live in `client/`; server code is organized by responsibility under
`server/collections`, `server/engine`, `server/instructions`, `server/loader`,
`server/runtime`, `server/services`, and `server/routes`.

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

Register it with `pnpm plugin:register workflow --app app-template-default`.
Application-owned workflow source remains in the application package. This
package publishes the canonical `workflow-management` Registry recipe. Once
materialized, its editable UI snapshot belongs to the consuming application
and calls only this plugin's stable public exports. The default application
only loads the Workflow runtime, migrations, services, and routes when this
plugin is enabled.

Build the Registry payload with:

```sh
pnpm registry build --package @nocobase/app-plugin-workflow
```

Materialize it into a new application output tree with:

```sh
pnpm registry materialize \
  --package @nocobase/app-plugin-workflow \
  --item workflow-management \
  --output-root /path/to/application
```

Materialization refuses to overwrite an existing extension. Update an
installed snapshot with an explicit three-way merge.

## Development dependencies

The Workflow integration tests intentionally pin `better-sqlite3` 13 and the
matching Knex range instead of using the workspace catalog. The queue test
adapter currently exercises that newer native-driver combination; move these
entries back to `catalog:` once the workspace database fixture is upgraded.

## Agent Skill

The Workflow Agent Skill is currently kept at
`packages/app-template-default/.agents/skills/nocobase3-workflow-manage` for
team development. This plugin remains its domain owner even though the current
copy lives in the default application. Whenever the DSL, registered
instructions, checker, Artifact builder, service APIs, or runtime contracts
change, review and update the Skill in the same change.

The current placement is intentional during development. The Skill is tailored
to the default application's workflow source root and is not yet a separately
published or independently versioned artifact.
