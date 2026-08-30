# @nocobase/app-plugin-install

Redirects an application to `/install` when the current server runtime is using
its temporary `nocobase-install-mode-*` authentication secret.

Only an install-mode runtime registers a small app middleware that redirects
HTML navigation before the SPA renders; `/install/*` and non-HTML requests pass
through normally. An installed runtime does not register that middleware,
while the `/install` route itself redirects back to the application root. The
installation page configures the Template's `main` SQLite, PostgreSQL, or MySQL
database connection through `POST /install/configure`.

The configure endpoint writes the selected database values and a generated
authentication secret to `paths.root('config.yml')` with an exclusive write.
It never overwrites an existing configuration file or returns the generated
secret. The middleware's install
mode is fixed for the life of the running process, so the application must be
restarted after configuration.

The installation form owns its shadcn components in `client/components/ui` and
uses `components.json` for future on-demand additions.
