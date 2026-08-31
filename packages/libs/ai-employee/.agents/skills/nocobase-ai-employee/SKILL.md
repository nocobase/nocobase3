---
name: nocobase-ai-employee
description: 'Use when coding agents develop a NocoBase application created with pnpm create @nocobase/app and need to configure AI employees, tools, skills, MCP servers, LLM services, runtime manager extensions, or custom LLM providers through @nocobase/ai-employee.'
argument-hint: '[task: configure|register|extend|test] [resource: employee|tool|skill|mcp|llm|provider]'
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
owner: ai-platform
version: 1.1.0
last-reviewed: 2026-08-29
risk-level: medium
---

# Goal

Guide development inside a NocoBase App source directory created with `pnpm create @nocobase/app <app-name>`: consume `@nocobase/ai-employee` correctly, place declarative resources in the App's `ai/` directory, register computed behavior through the shared `deps.ai` aggregate, and extend LLM providers without modifying dependency packages.

# Scope

- Configure App-owned LLM services, tools, skills, MCP servers, and AI employees under `<app-root>/ai/`.
- Use the public API exported by `@nocobase/ai-employee` from application and App-plugin server code.
- Register conditional or computed resources through managers mounted at `deps.ai`.
- Add application-specific chat or embedding providers from an enabled plugin's `server/bootstrap.ts`.
- Explain how the enabled AI employee application plugin loads package defaults before App resources.
- Test the resulting App with the scripts declared by its own `package.json` and verify runtime behavior.

# Non-Goals

- Do not guide continued development of the `@nocobase/ai-employee` dependency itself.
- Do not edit `@nocobase/ai-employee` internals, loaders, repositories, built-in providers, or generated `dist/` merely to customize one application.
- Do not copy the AI employee plugin's package-owned builtin resource tree into the App.
- Do not create a second `AIManager`; use the instance already mounted at `deps.ai`.
- Do not store API keys, tokens, or passwords in committed source.
- Do not use internal imports such as `@nocobase/ai-employee/src/...`; import only from the package root.

# Input Contract

| Input         | Required | Default                     | Validation                                                                           | Clarification Question                                                                          |
| ------------- | -------- | --------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `task`        | yes      | infer                       | one of `configure/register/extend/test`                                              | "Should I configure files, register runtime logic, extend a provider, or test the integration?" |
| `resource`    | yes      | infer                       | one of `employee/tool/skill/mcp/llm/provider/feature`                                | "Which AI resource or extension do you need?"                                                   |
| `appRoot`     | no       | current working directory   | must be the App source directory containing `package.json`, `client/`, and `server/` | "Which App source directory created by `pnpm create @nocobase/app` should I modify?"            |
| `pluginOwner` | no       | existing enabled App plugin | required for runtime code                                                            | "Which enabled App plugin should own this server-side registration?"                            |

Rules:

- Infer `task` and `resource` when the request is clear.
- Prefer `<appRoot>/ai/` for static employees, tools, skills, and MCP definitions.
- Prefer `<appRoot>/storage/ai/models.json` for LLM service configuration so operators can change models/services without rebuilding or repacking the App.
- Require a plugin owner for executable bootstrap logic, dynamic tools, custom providers, or optional features.
- Inspect the App's plugin manifest before assuming the AI employee plugin is enabled.

# Reference Loading Map

| Reference                                                          | Use When                                           | Notes                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [App integration](references/architecture.md)                      | deciding where application code belongs            | Explains App dependencies, plugin ownership, `deps.ai`, and boundaries.                                             |
| [Exact contracts](references/application-contracts.md)             | writing any AI resource or calling any manager API | Primary self-contained source for exact parameter types, required fields, defaults, callbacks, returns, and errors. |
| [Consumed public API](references/public-api.md)                    | choosing which root export to import               | High-level map; use Exact contracts for actual parameters.                                                          |
| [Resources and load order](references/resources-and-load-order.md) | creating files under `<appRoot>/ai/`               | Defines formats, keys, precedence, and initialization order.                                                        |
| [Manager registration](references/managers.md)                     | adding programmatic runtime behavior               | Shows how an App plugin uses each manager on `deps.ai`.                                                             |
| [Custom provider](references/llm-provider-extension.md)            | adding an application-specific LLM backend         | Covers provider classes, plugin bootstrap registration, services, and tests.                                        |

# Workflow

1. Resolve the App root. For the standard quickstart, this is the directory created by `pnpm create @nocobase/app <app-name>` and entered with `cd <app-name>`.
2. Confirm `@nocobase/app-plugin-ai-employee` is enabled in the App plugin configuration and `@nocobase/ai-employee` is available as a dependency.
3. Read [`references/architecture.md`](references/architecture.md) and choose one application extension path:
   - static employee/tool/skill/MCP resource in `<appRoot>/ai/`;
   - runtime-editable LLM services in `<appRoot>/storage/ai/models.json`, with `<appRoot>/ai/models.json` as the packaged fallback;
   - programmatic registration in an enabled App plugin's `server/bootstrap.ts`;
   - custom LLM provider owned by an enabled App plugin.
4. For any static resource or manager call, read [`references/application-contracts.md`](references/application-contracts.md) first. It is intentionally self-contained because the coding agent may not have access to the dependency source.
5. For a static resource, read [`references/resources-and-load-order.md`](references/resources-and-load-order.md), implement the required file format, and select stable unique keys.
6. For runtime registration, read [`references/managers.md`](references/managers.md), type the plugin dependency as `ai: AIManager`, and use `context.deps.ai`.
7. For a custom provider, read [`references/llm-provider-extension.md`](references/llm-provider-extension.md). Register provider metadata before an LLM service referencing its key is resolved.
8. Import application-facing types and helpers only from `@nocobase/ai-employee`; use [`references/public-api.md`](references/public-api.md) to select the narrow contract and Exact contracts for parameter definitions.
9. Add tests in the App or owning plugin, not in dependency source, unless the task explicitly fixes the dependency package.
10. Inspect the App's `package.json` and run its available validation scripts. Prefer `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` when declared; also validate every modified plugin package.
11. Report App files changed, resource keys, registration timing, load-order or override effects, environment variables required, and runtime verification.

# Application Decision Rules

- **Static LLM service:** prefer `<appRoot>/storage/ai/models.json` for runtime-editable service configuration. It is loaded after the packaged App manifest and is authoritative, so changes only require an App restart/reload—not a rebuild or repack. Keep `<appRoot>/ai/models.json` only as the packaged/default fallback for fresh deployments.
- **Static backend tool:** add `<appRoot>/ai/tools/<name>.ts` or `<name>/index.ts`.
- **Static skill:** add `<appRoot>/ai/skills/<directory>/SKILLS.md`, with optional local tools.
- **Static employee:** add `<appRoot>/ai/employees/<name>.ts` or `<name>/index.ts`, with optional `prompt.md`, local tools, and local skills.
- **Static MCP connection:** add a direct module under `<appRoot>/ai/mcp/`.
- **Context/request/session-dependent tools:** call `deps.ai.toolsManager.registerDynamicTools(...)` from plugin bootstrap.
- **Computed application resources:** call the appropriate manager from plugin bootstrap rather than generating files at runtime.
- **Custom LLM backend:** implement provider classes in the owning App plugin, register with `deps.ai.llmProviderManager`, then use that key in `models.json` or `llmServiceManager`.
- **Cross-plugin optional capability:** attach it with `deps.ai.features.enableFeatures(...)` from the capability plugin.
- **AI chat UI or HTTP routes:** use the application AI plugin/client integration; `@nocobase/ai-employee` is the server-side core contract, not the complete UI facade.

# Safety Gate

Require explicit confirmation before:

- overriding a package-provided resource by reusing its key;
- renaming an employee username, skill name, tool/MCP filename key, provider key, or LLM service name;
- deleting entries from the App's authoritative `models.json` when storage synchronization may remove existing services;
- changing MCP transport, command, URL, headers, or credentials;
- replacing a built-in provider registry key;
- editing generated App runtime infrastructure instead of using App resource/plugin extension points.

Rollback guidance:

- Restore the previous App resource or plugin bootstrap registration.
- Restart the App so filesystem resources and provider registrations reload.
- For MCP changes, restore configuration and rebuild/restart the MCP client through the normal lifecycle.
- Re-run the App's and owning plugin's available validation scripts.

# Verification Checklist

- `@nocobase/app-plugin-ai-employee` is enabled in the App.
- The implementation is App-owned: `<appRoot>/ai/` or an enabled App plugin.
- No dependency internals or generated `dist/` files were modified.
- Imports come from `@nocobase/ai-employee` package root.
- Resource filenames, default exports, frontmatter, and unique keys match loader contracts.
- Referenced tools and skills load before the employees that name them.
- App overrides reuse package keys only intentionally.
- Runtime code uses the shared `context.deps.ai` instance.
- MCP configuration changes refresh live connections/tools.
- A custom provider is registered before service/model resolution, and service `provider` exactly matches its registry key.
- Credentials use environment variables and are absent from logs and committed files.
- The App's lint, typecheck, tests, and build scripts pass when available.
- Every modified App plugin also passes lint, typecheck, tests, and build.

# Minimal Test Scenarios

1. Add one App tool and verify it is listed and invokable after App startup.
2. Add a skill with a local tool and an employee referencing that skill; verify both names resolve.
3. Add an employee directory with `prompt.md`; verify the prompt and explicit/discovered tools are applied.
4. Register a dynamic tool through an enabled plugin's `server/bootstrap.ts`; verify it appears only for matching context/filter conditions.
5. Add or update an MCP definition; verify connection testing, client rebuild, and exposed tool names.
6. Register a custom provider, configure a matching service, and resolve/instantiate a selected model.
7. Override a known package resource in the App and verify the App layer wins without duplicating unrelated builtins.

# Output Contract

Final responses must include:

- the App root and owning plugin, if any;
- whether the solution uses an `ai/` resource or `deps.ai` registration;
- files created or changed in the App/plugin;
- resource, service, and provider keys introduced or overridden;
- required environment variables without revealing values;
- startup/load-order implications;
- validation and runtime verification results;
- remaining credential, network, MCP, or deployment concerns.

# References

- [App integration and structure](references/architecture.md): read before deciding where application customization belongs.
- [Exact application contracts](references/application-contracts.md): mandatory before writing resource configuration or calling a manager; contains detailed parameter definitions and errors.
- [Application-facing public API](references/public-api.md): read before choosing root imports.
- [Application resources and load order](references/resources-and-load-order.md): read before editing the App `ai/` directory.
- [Programmatic registration through `deps.ai`](references/managers.md): read before writing plugin bootstrap logic.
- [Application-specific LLM provider extension](references/llm-provider-extension.md): read before adding a provider implementation.
