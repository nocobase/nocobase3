---
'@nocobase/dev-config': patch
---

Require eslint-plugin-react-refresh 0.5.6, which restores the member-expression check that 0.5.5 dropped. Under 0.5.5 an aliased component export such as `const Select = SelectPrimitive.Root` was reported as a non-component export, so a freshly generated application failed `pnpm lint` on an untouched shadcn/ui file.
