# App Client Instructions

This directory is the active Default App browser client.

- Never import from or edit `../client-old/`; it is a temporary migration
  archive, not a source dependency.
- Keep plugin capability setup in plugin `client/bootstrap` entries.
- Keep plugin route path and auth metadata in plugin `client/routes` entries.
- Put application-only page composition and branding here.
- Customize a plugin route through `route-overrides.ts`; do not register a
  duplicate path such as `/login`.
- A route override may replace only `componentLoader`. Keep it lazy, include an
  inspectable `componentEntry`, and default-export the page component.
- Authentication UI belongs in `auth/` and should reuse
  `@nocobase/app-plugin-authentication/client/ui` rather than plugin-internal
  paths.
- Use Refine hooks and providers for authentication state. Do not call Better
  Auth endpoints directly from pages or create another session store.
- Keep app-wide theme and loading behavior applicable to plugin pages.

Before finishing client changes, run the Default App lint, typecheck, tests,
build, and `pnpm app:client:inspect --app app-template-default`.
