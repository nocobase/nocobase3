# @nocobase/create-plugin

## 0.0.1

### Patch Changes

- Add a template-based generator for NocoBase 3 application plugins.
- Document that the registration command automatically connects the generated `./server/plugin` export to the target application's explicit server composition root.
- Replace the complete default scaffold with explicit, composable plugin
  capabilities and a shared generation plan. Add structured JSON dry runs and
  require callers to select capabilities or explicitly request an empty
  package foundation.
