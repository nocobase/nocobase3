# @nocobase/app-tools

## 0.0.2-beta.0

### Patch Changes

- 5e3c802: Extract shared application development and build tooling into app-tools and runtime CLI commands into app-cli. Keep template entry points and application composition local, preserve supported commands and development restart behavior, and document customization and upgrade boundaries.

  Remove the application client and server inspection commands, their development-only CLI registration, and related guidance.

- 5e3c802: Replace template development forwarding files with a single dev entry and a direct proxy helper import. Expose the dev lifecycle through the tools launcher and keep development implementation modules and tests inside app-tools.

  Consolidate standalone server dependency operations into one template entry and keep build utility implementations and exports private to app-tools.

  Organize template scripts by purpose and remove redundant test:all, refine, template pack:check, and plugin:skills:sync shortcuts. Keep the application CLI entry and legacy CLI compatibility command unchanged.

- Updated dependencies [8124b03]
  - @nocobase/nb3-cli@1.0.0-beta.10

## 0.0.1

### Patch Changes

- Extract shared application tooling from the application templates.
