# @nocobase/ui

Stable UI contract for independently published NocoBase App plugins.

- Plugins import runtime primitives from `@nocobase/ui`.
- Standalone consumers may explicitly use the built-in implementation from
  `@nocobase/ui/default`.
- Templates may resolve only `@nocobase/ui` to an application-local adapter,
  while importing shared prop types from `@nocobase/ui/contracts`.

The package intentionally starts with the primitives required by the current
App runtime: `Button`, `Input`, `Label`, and `Loading`. Add a primitive here
only when it is a stable cross-plugin contract. Application-specific shadcn
components remain editable source inside a Template or Registry item.
