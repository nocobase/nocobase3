---
'@nocobase/dev-config': patch
---

Export `createShadcnRegistryConfig(root)` from `@nocobase/dev-config/eslint`. It returns the shadcn/ui registry relaxations `createPortalConfig` applies to `client/`, scoped to another directory, so a package whose primitives live elsewhere applies the same list instead of copying it.
