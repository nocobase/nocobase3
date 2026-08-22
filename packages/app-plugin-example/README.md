# @nocobase/app-plugin-example

Minimal app plugin example. When enabled, it contributes one migration, one
seed, and a convention-based `server/routes/index.ts` entry to
`@nocobase/app-template-default`.

The routes entry receives the App's `app`, `deps`, and `services`, and mounts
an example endpoint at `/install`.
