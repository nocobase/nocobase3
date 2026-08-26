# App AI resources

This directory is the **application extension layer** for AI resources.
`installAIEmployee()` loads the package-owned `@nocobase/ai-employee` builtin
tree with the package resource loaders first. It then loads this directory so an
App can add or override resources without copying package builtins.

Only these application-owned files are intentionally present here:

- `models.json` — the App LLM-service manifest.
- `employees/application-validation/` — a fixture that verifies application
  employees load after package builtins.
- `tools/application-validation.ts` — a fixture that verifies application tools
  load after package builtins.
- `skills/application-validation/` — a fixture that verifies application skills
  load after package builtins.
- `mcp/` — retained as the application MCP extension location.

The resource formats remain the legacy formats: employee `index.ts`/`index.js`,
tool modules, skill `SKILLS.md` frontmatter, and MCP modules. In production,
this directory is compiled/copied to `dist/ai`; it never receives a copy of the
package builtin tree.
