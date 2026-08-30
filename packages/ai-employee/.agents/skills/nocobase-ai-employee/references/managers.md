# Programmatic App Registration Through `deps.ai`

## Contents

- [When to Use Managers](#when-to-use-managers)
- [Plugin Bootstrap Pattern](#plugin-bootstrap-pattern)
- [Tools Manager](#tools-manager)
- [Skills Manager](#skills-manager)
- [Employee Manager](#employee-manager)
- [MCP Server Manager](#mcp-server-manager)
- [LLM Provider and Service Managers](#llm-provider-and-service-managers)
- [MCP Action Tool Manager](#mcp-action-tool-manager)
- [Feature Manager](#feature-manager)
- [Timing and Lifecycle](#timing-and-lifecycle)

This file explains when and how to register behavior. Use [Exact Application Contracts](application-contracts.md) for the complete signatures, input types, return values, defaults, and errors of every manager shown here.

## When to Use Managers

Prefer App `ai/` files for static resources. Use manager registration only when the resource or behavior is:

- computed from application configuration or another service;
- conditional on an enabled plugin/capability;
- dependent on request, session, role, tenant, or runtime context;
- created from an external registry;
- an application-specific provider or feature implementation;
- intentionally managed through plugin lifecycle code.

Do not manually invoke loaders from application code. The enabled AI employee plugin already loads the App resource directory.

## Plugin Bootstrap Pattern

Executable registrations belong to an enabled App plugin's `server/bootstrap.ts`:

```ts
import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AIManager } from '@nocobase/ai-employee';

interface PluginDeps {
  ai: AIManager;
}

export default function bootstrap(
  context: AppPluginServerContext<PluginDeps>,
): void {
  const { ai } = context.deps;
  // Register App-specific behavior.
}
```

Use the existing `context.deps.ai`. Never construct another `AIManager` inside the plugin.

The `AppPluginBootstrap` contract returns `void`; the generated App does not await an async bootstrap function. Provider and dynamic-provider registration are synchronous. When manager initialization is asynchronous, start and retain an explicit readiness promise, attach rejection logging immediately, and make routes/services that depend on it await that promise:

```ts
let companyAIReady: Promise<void> = Promise.resolve();

export default function bootstrap(
  context: AppPluginServerContext<PluginDeps>,
): void {
  companyAIReady = initializeCompanyAI(context.deps.ai);
  void companyAIReady.catch((error) => {
    reportInitializationError(error);
  });
}

export function waitForCompanyAIReady(): Promise<void> {
  return companyAIReady;
}
```

Do not mark bootstrap `async` and assume the App awaits it.

## Tools Manager

Use static registration when a plugin owns an executable tool but a filesystem resource is unsuitable:

```ts
await ai.toolsManager.registerTools({
  scope: 'GENERAL',
  defaultPermission: 'ASK',
  definition: {
    name: 'customerLookup',
    description: 'Look up a customer',
    schema,
  },
  async invoke(ctx, args, runtime) {
    return { status: 'success', content: await lookup(args.id) };
  },
});
```

Use `registerDynamicTools` for request/context-sensitive tools:

```ts
ai.toolsManager.registerDynamicTools(async (register, filter) => {
  if (!filter?.ctx) return;
  const tools = await createToolsForContext(filter.ctx);
  await register.registerTools(tools);
});
```

Dynamic tools are built during `getTools`/`listTools` and are not persisted. The provider receives the caller's filter, including optional `ctx`, `sessionId`, scope, permission, and silence values.

Other methods:

- `getTools(name, filter?)`
- `listTools(filter?)`
- `isToolsExisted(name)`
- `unregisterTools(name|string[])`

Registration defaults include backend execution and `ASK` permission unless explicitly changed.

## Skills Manager

Use when skill content comes from an application service rather than `SKILLS.md`:

```ts
await ai.skillsManager.registerSkills({
  scope: 'CUSTOM',
  name: 'company-policy',
  description: 'Apply the current company policy',
  content: await policyService.renderSkill(),
  tools: ['policySearch'],
  introduction: { title: 'Company policy' },
  from: 'company-plugin',
});
```

Methods:

- `getSkills(name|string[])`
- `listSkills(filter?)`
- `registerSkills(options)`
- `deleteSkills(name)`

Registration updates by `name`. Use stable names because employees reference skills by name.

## Employee Manager

Use for a computed employee definition:

```ts
await ai.employeeManager.registerEmployee({
  username: 'sales-coach',
  nickname: 'Sales Coach',
  skills: ['company-policy'],
  tools: [{ name: 'customerLookup', autoCall: true }],
  systemPrompt: await promptService.getSalesPrompt(),
});
```

Methods:

- `getEmployee(username)`
- `listEmployees(filter?)`
- `registerEmployee(options)`
- `upsertEmployee(entity)`
- `deleteEmployee(username)`

Use `registerEmployee` for normal definition-style App registration. `upsertEmployee` expects a complete `AIEmployeeEntity` and is appropriate only when the App owns all persisted fields.

Do not call `switchRepository` in ordinary application customization; repository ownership belongs to the AI employee integration plugin.

## MCP Server Manager

Runtime registration:

```ts
await ai.mcpServerManager.registerMCP({
  analytics: {
    transport: 'http',
    url: config.analyticsMcpUrl,
    headers: { Authorization: `Bearer ${config.analyticsMcpToken}` },
  },
});
await ai.mcpServerManager.rebuildClient();
```

After every add, update, or delete that should affect live connections, call `rebuildClient()`.

Useful methods:

- `getMCP`, `listMCP`, `deleteMCP`
- `testConnection(options)`
- `rebuildClient()`
- `listMCPTools()`
- `updateMCPToolPermission(name, permission)`

To expose connected MCP tools through the common tool manager:

```ts
ai.toolsManager.registerDynamicTools(ai.mcpServerManager.getMCPToolsProvider());
```

Generated names use `mcp-<server>-<tool>`. Raw MCP tool names starting with `get` default to `ALLOW`; other tools default to `ASK`.

Do not commit MCP tokens or confidential headers. Prefer application configuration or environment values.

## LLM Provider and Service Managers

Register an App provider first:

```ts
ai.llmProviderManager.registerLLMProvider('company', companyProviderOptions);
```

Then preferably configure `<appRoot>/storage/ai/models.json`. It is the runtime-editable authoritative manifest and does not require rebuilding/repacking. Use `<appRoot>/ai/models.json` only for packaged defaults/fresh deployments, or register a computed service programmatically:

```ts
await ai.llmServiceManager.registerLLMService({
  name: 'company-production',
  title: 'Company Production',
  provider: 'company',
  options: { apiKey: config.apiKey },
  enabledModels: {
    mode: 'custom',
    models: [{ label: 'Company Chat', value: 'company-chat' }],
  },
  enabled: true,
});
```

Provider manager operations include:

- `listLLMProviders()`
- `listAllEnabledModels()`
- `resolveModel(selection?)`
- `getLLMService({ llmService, model, webSearch?, reasoning? })`
- `createEmbedding({ llmService, model })`

Service manager operations include lookup, list, register, and delete.

Do not call LLM service `switchRepository` from App code. The AI plugin owns persistence promotion and synchronization.

## MCP Action Tool Manager

`mcpToolsManager` is not the remote MCP connection manager. It registers application/API-style tool descriptors:

```ts
ai.mcpToolsManager.registerTools([
  {
    name: 'records:list',
    description: 'List application records',
    resourceName: 'records',
    actionName: 'list',
    async call(args, callContext) {
      return recordService.list(args, callContext?.token);
    },
  },
]);
```

Register ordered result processing when an action response must be sanitized or reshaped:

```ts
ai.mcpToolsManager.registerToolResultPostProcessor(
  'records',
  'list',
  async (result) => sanitizeRecords(result),
);
```

Use `listTools`, `getTool`, and `postProcessToolResult` to consume this registry.

## Feature Manager

A capability plugin can attach optional implementations:

```ts
deps.ai.features.enableFeatures({
  knowledgeBase: knowledgeBaseFeature,
  vectorDatabase: vectorDatabaseFeature,
});
```

Use `isFeaturesEnabled([EEFeatures.knowledgeBase])` before optional access. Typed getters throw when an implementation is unavailable.

The AI knowledge-base plugin bootstrap is the canonical pattern: it creates App-specific services and attaches the feature ports to the shared AI aggregate.

## Timing and Lifecycle

- Register providers and dynamic tool providers synchronously during plugin bootstrap when possible.
- Static App resources are loaded automatically by the AI employee plugin; do not duplicate them through manager calls.
- The generated App does not await plugin bootstrap return values. Track asynchronous initialization with an explicit readiness promise and await it at dependent routes/services.
- If code must inspect resources after loading, use an explicit readiness mechanism from the AI plugin rather than a timeout or assumed plugin order.
- Keep an MCP mutation and `rebuildClient()` in the same controlled lifecycle operation.
- Register disposers through the plugin lifecycle for external clients, timers, or connections owned by the App plugin.
- Restart/reload the App when verifying filesystem resource and bootstrap registration changes.
