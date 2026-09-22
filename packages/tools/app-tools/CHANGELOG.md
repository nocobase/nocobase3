# @nocobase/app-tools

## 0.0.2-beta.1

### Patch Changes

- 56613b2: Choose a development port that nothing already answers on, not merely one that can be bound. macOS lets a wildcard listener and a specific-address listener share a port, so binding loopback succeeds while the other process receives the loopback traffic — and readiness, which is probed over loopback, then observes a service that is not ours and waits forever. The port probe now connects before accepting a candidate, so `pnpm dev` moves to the next port instead of hanging.
- dd0e02c: Use Execa to manage development process trees, preserve cleanup on repeated termination signals and launcher exit, and report startup progress. Remove automatic native watcher probes; polling is now explicitly configured.

  Exclude installed dependencies from server file watching, including pnpm dependencies outside the application's directory.

- Updated dependencies [fa01814]
- Updated dependencies [ca3188e]
- Updated dependencies [fa01814]
- Updated dependencies [7bde7bd]
- Updated dependencies [56613b2]
- Updated dependencies [ea91af0]
- Updated dependencies [fc34a66]
- Updated dependencies [5380642]
- Updated dependencies [3187ace]
  - @nocobase/app-server@1.0.0-beta.23
  - @nocobase/dev-config@0.1.0-beta.11
  - @nocobase/nb3-cli@1.0.0-beta.11

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
