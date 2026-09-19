This reference describes the framework-neutral resource managers. Employee and Tool discovery is not a Core responsibility: applications define those resources in `server/ai`, statically import them, and register them through the AI Employee plugin's `AIResourceRegistrar`.

## Application Tree

```text
config.yml                 # ai.llmServices and ai.skills.paths
server/ai/
├── employees/             # explicit Employee definitions
├── tools/                 # explicit Tool definitions
└── index.ts               # static aggregators and registrar implementation
ai/
├── mcp/                   # loader-managed MCP definitions
└── skills/<name>/SKILL.md # loader-managed Skills
```

## Overall Load Order

The AI Employee plugin's lifecycle is:

1. Switch Employee storage to the plugin repository.
2. Synchronize configured LLM services.
3. Register explicit Tools.
4. Load MCP definitions with `MCPLoader`.
5. Load the plugin default and configured Skill directories with `SkillsLoader`.
6. Register explicit Employees.
7. Rebuild the MCP client and write the resource summary.

This order is deliberate: Employee definitions may reference already registered Skill and Tool names. Config reload synchronizes LLM services only; it does not rescan or re-register static resources.

## Explicit Employees and Tools

`@nocobase/ai-employee` exports managers and definitions, but does not export filesystem loaders for Employees or Tools. Use the public `AIResourceRegistrar` exported by `@nocobase/app-plugin-ai-employee/server` and call it from the application's Provider with the existing `aiManagerToken`.

```ts
export default class AppAIResources extends AIResourceRegistrar {
  protected override async registerAIEmployees(
    aiEmployeeManager: AIEmployeeManager,
  ): Promise<void> {
    await aiEmployeeManager.registerEmployee(employee);
  }

  protected override async registerTools(
    toolsManager: ToolsManager,
  ): Promise<void> {
    await toolsManager.registerTools(tool);
  }
}
```

Tool names and descriptions come from the `defineTools()` TypeScript definition. Employee usernames, `systemPrompt`, `skills`, and `tools` are also code-owned fields. Employee-local `prompt.md`, `skills/`, and `tools/` files have no automatic behavior.

Same-name replacement must be expressed by the application's registration order or an explicit manager policy; it must not depend on filesystem scan order.

## MCP Servers

MCP remains loader-managed. Standard MCP definitions live under `ai/mcp/`; the unique key is the filename. Registration persists configuration, and `rebuildClient()` reconnects enabled servers and refreshes their tools.

## Skills

A Skill is one `SKILL.md` per Skill directory. The frontmatter contract is unchanged. Skill-local `tools/` discovery, when supported by `SkillsLoader`, is a Skill feature and is unrelated to Employee registration.

The plugin always attempts its published package-root `ai/skills` directory. The App may also use `<AppRoot>/ai/skills` as the second default directory, followed by directories listed in `ai.skills.paths`. Configured paths are trimmed, empty entries are ignored, duplicates are removed after normalization, relative paths are resolved from the App root, and missing directories warn without aborting startup. Later directories have later-registration semantics for same-name Skills.

## LLM Services

`config.yml` is the declarative source at `ai.llmServices`. Reload updates the active repository while preserving repository-managed state according to the plugin's synchronizer contract. It does not reload static Employee, Tool, MCP, or Skill resources.

## Production Resolution

Employee and Tool modules are compiled under `dist/server/ai` and loaded through static imports. Skill Markdown is published separately under the package root `ai/skills`; the runtime must resolve that package-root directory explicitly rather than assuming it is under `dist`. MCP and configured Skill directories are resolved by their respective loader orchestration.
