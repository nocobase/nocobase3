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
Application-owned workflow source and Portal Registry UI may remain in the
application package. The default application only loads the Workflow runtime,
migrations, services, and routes when this plugin is enabled.

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
