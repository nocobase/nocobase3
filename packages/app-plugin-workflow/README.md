# @nocobase/app-plugin-workflow

Provides the complete optional Workflow capability: engine, DSL, client graph
contracts, runtime, collection migration, services, and authenticated HTTP API
routes.

Register it with `pnpm plugin:register workflow --app app-template-default`.
Application-owned workflow source and Portal Registry UI may remain in the
application package. The default application only loads the Workflow runtime,
migrations, services, and routes when this plugin is enabled.
