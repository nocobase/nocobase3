---
"@nocobase/app-server": minor
"@nocobase/app-plugin-authentication": minor
"@nocobase/app-tools": patch
"@nocobase/create-app": patch
"@nocobase/app-skills": patch
"@nocobase/app-template-default": patch
"@nocobase/app-template-examples": patch
"@nocobase/app-template-hub": patch
---

Let a configuration section declare the environment variables that set it, and stop shipping environment variables nothing reads.

`defineAppConfig` takes `env`, a map from variable to a mapping relative to the section, such as `{ AUTH_SECRET: envString('secret') }`. The runtime loads these above the configuration file once the sections are known, and refuses one variable declared for two different fields. `defineAuthConfig` now maps `AUTH_SECRET` itself, so the templates' `server/environment.ts` no longer does; an existing application that keeps its own `AUTH_SECRET` mapping is unaffected.

`APP_NAME` is gone from the Hub's `.env.example` and from the `.env` that `create-app` writes for a Hub, which used to set it to the project directory's name: nothing read it, and an application's name follows from `APP_BASE_PATH`. The commented `API_CLIENT_*` lines are gone for the same reason. The Hub template gains a test that every variable `.env.example` names is one the application reads. `pnpm build` no longer copies `DB_*`, `QUEUE_*`, `REDIS_*`, `SMTP_*`, `API_CLIENT_*` and the notification provider variables into `dist/.env`; no mapping reads any of them.
