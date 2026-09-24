# Runtime Extensions

What an App reaches through the `AIManager` when a resource cannot be written once and registered by an `AIResourceRegistrar`: tools that depend on the request, Skills and employees computed at start, a custom LLM provider, and a direct model call.

## Table of contents

- [When to go past the registrar](#when-to-go-past-the-registrar)
- [Reaching the manager](#reaching-the-manager)
- [Dynamic tools](#dynamic-tools)
- [Skills and employees from code](#skills-and-employees-from-code)
- [LLM services and model lookups](#llm-services-and-model-lookups)
- [A custom LLM provider](#a-custom-llm-provider)
- [A direct model call](#a-direct-model-call)
- [Not for an App](#not-for-an-app)

## When to go past the registrar

Everything static goes through an `AIResourceRegistrar` subclass, as [server-runs.md § Register App resources](server-runs.md#register-app-resources) shows. Call a manager directly only when the resource is:

- computed from another service or from configuration at start;
- conditional on something only known at run time, such as the request's actor;
- an LLM backend no built-in provider speaks.

## Reaching the manager

Resolve `aiManagerToken` from the App container in a `ServiceProvider.boot()` that runs after the AI Employee plugin's provider has booted — the Provider that runs the registrar is the natural place:

```ts
import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import { ServiceProvider } from '@nocobase/service-provider';
import AppAIResources from '../ai/index.js';
import { companyProviderOptions } from '../ai/company-provider.js';

export default class AIResourcesProvider extends ServiceProvider<Application> {
  public readonly name = 'app/ai-resources';

  public override async boot(): Promise<void> {
    const ai = this.app.container.resolve(aiManagerToken);
    ai.llmProviderManager.registerLLMProvider(
      'company',
      companyProviderOptions,
    );
    await new AppAIResources({ source: 'application' }).registerAIResources(ai);
  }
}
```

A tool that needs the manager declares it rather than closing over it: `dependencies: { ai: aiManagerToken }` gives the tool `ctx.deps.ai`. A tool that declares nothing has no `ctx.deps.ai`; there is no ambient handle.

## Dynamic tools

`registerTools()` registers a fixed tool. `registerDynamicTools(provider)` registers a function that produces tools each time tools are looked up — for a tool set that depends on who is asking, not merely on which services a tool uses:

```ts
ai.toolsManager.registerDynamicTools(async (register, filter) => {
  if (!filter?.ctx) return;
  await register.registerTools(await toolsFor(filter.ctx));
});
```

- The provider runs on every lookup, and what it registers is not kept, so it is cheap and repeatable or it is neither.
- `filter` is the lookup's own: `scope`, `defaultPermission`, `silence`, `sessionId`, and `ctx`. An employee run passes its `AgentContext` as `ctx`. `createAgent()` looks its tools up by name without one, so a provider that returns nothing without `ctx` gives a fixed agent nothing.
- A `GENERAL` tool produced this way reaches every employee whose tool selection has never been saved, like any other `GENERAL` tool; see [capabilities.md § How Skills and Tools relate](capabilities.md#how-skills-and-tools-relate).

The rest of the tools manager: `getTools(name, filter?)`, `listTools(filter?)`, `isToolsExisted(name)`, and `unregisterTools(name | name[])`, which returns how many it removed.

## Skills and employees from code

When a Skill's text comes from a service rather than a `SKILL.md`, register it:

```ts
await ai.skillsManager.registerSkills({
  scope: 'SPECIFIED', // or 'GENERAL', or 'CUSTOM'
  name: 'company-policy',
  description: 'Apply the current company policy.',
  content: await policy.renderSkill(),
  tools: ['policy-search'],
});
```

Registering again under the same `name` updates that Skill: the fields given replace the stored ones, and `tools`, `introduction` and `i18n` keep their stored values when left out. Employees and `skillSettings` refer to a Skill by that name, so keep it stable. `getSkills(name | name[])`, `listSkills(filter?)` and `deleteSkills(name)` complete the manager.

An employee computed at start goes through `ai.employeeManager.registerEmployee(options)`, which takes what `defineAIEmployee()` takes — see [capabilities.md § Employees](capabilities.md#employees) — and, like the registrar, keeps an administrator's tool and Skill switches and saved approval choices when the employee already exists. `upsertEmployee(entity)` instead writes a complete stored employee as given, keeping only the tool and Skill switches the entry leaves out, so it is for an App that owns every field, not for defining one.

## LLM services and model lookups

LLM services belong in `config.yml` `ai.llmServices` — see [capabilities.md § LLM services](capabilities.md#llm-services-configyml). `llmServiceManager.registerLLMService()` exists, but the configured name set is authoritative: every configuration load deletes the services it does not list, so a service registered from code disappears on the next one.

The provider manager answers questions an App asks at run time:

| Call                                                           | Returns                                                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listLLMProviders()`                                           | the registered providers and what each supports                                                                                                     |
| `listAllEnabledModels()`                                       | every enabled service with its enabled models, as the chat's selector lists them                                                                    |
| `resolveModel(requested?)`                                     | a requested `{ llmService, model }` unchanged, without checking that it is enabled; otherwise the first enabled model, rejecting when there is none |
| `getLLMService({ llmService, model, webSearch?, reasoning? })` | a provider instance for that model, for a [direct model call](#a-direct-model-call)                                                                 |
| `createEmbedding({ llmService, model })`                       | an embeddings client, for a provider that declares one                                                                                              |

## A custom LLM provider

Write one only when no built-in provider speaks the backend's protocol. A backend that is OpenAI-compatible needs no code: configure a service with the matching built-in provider and its `baseURL`.

**The chat provider** extends `LLMProvider` and builds the LangChain chat model:

```ts
import { LLMProvider } from '@nocobase/ai-employee';
import { ChatOpenAI } from '@langchain/openai';

export class CompanyProvider extends LLMProvider {
  public get baseURL(): string {
    return 'https://llm.example.com/v1';
  }

  public createModel(): ChatOpenAI {
    const { apiKey } = this.serviceOptions;
    const { model, ...modelOptions } = this.modelOptions ?? {};
    return new ChatOpenAI({
      apiKey,
      model,
      ...modelOptions,
      configuration: { baseURL: this.getResolvedBaseURL() },
    });
  }
}
```

- The LangChain model package — `@langchain/openai` here — is imported by the App's server code, so it goes in the App's `dependencies`, not `devDependencies`.
- `serviceOptions` is the service's `options` from `config.yml`, with `${NAME}` already expanded; `modelOptions` holds the selected `model` and the service's model options.
- The manager also constructs the class with no options, to read its capabilities. `createModel()` runs only when `modelOptions` is given, so neither the constructor nor a field initializer may require a key or a model.
- `getResolvedBaseURL()` returns the service's `options.baseURL` when set, otherwise the class's `baseURL`, checked against the URL whitelist. Build request URLs with it, or with `buildRequestURL(path)`, never by hand.

**An embedding provider** is a separate class, needed only when the backend serves embeddings — for instance for a knowledge base:

```ts
import { EmbeddingProvider } from '@nocobase/ai-employee';
import { OpenAIEmbeddings } from '@langchain/openai';

export class CompanyEmbeddingProvider extends EmbeddingProvider {
  protected getDefaultUrl(): string {
    return 'https://llm.example.com/v1';
  }

  public createEmbedding(): OpenAIEmbeddings {
    return new OpenAIEmbeddings({
      apiKey: this.apiKey,
      model: this.model,
      configuration: { baseURL: this.baseURL },
    });
  }
}
```

`apiKey`, `model` and `baseURL` throw when the service does not supply them.

**Register it** under a key, with its metadata:

```ts
import { SupportedModel, type LLMProviderMeta } from '@nocobase/ai-employee';

const companyProviderOptions: LLMProviderMeta = {
  title: 'Company LLM',
  provider: CompanyProvider,
  embedding: CompanyEmbeddingProvider,
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  models: { [SupportedModel.EMBEDDING]: ['company-embedding'] },
  supportWebSearch: false,
};

ai.llmProviderManager.registerLLMProvider('company', companyProviderOptions);
```

- `supportedModel` decides where the provider is offered; list both kinds explicitly when both exist.
- `models` suggests embedding model ids for the embedding picker, and nothing else. Chat models are always fetched from the provider's own API through `ai:listProviderModels`.
- `supportWebSearch` and `webSearchModels` are what `subAgentWebSearch` checks before it searches; claim them only for a backend that searches, and implement `builtInTools()` and `parseWebSearchAction()` to match.
- Registering under a built-in key, such as `openai`, replaces that provider for the whole App. Treat it as a decision to confirm with the user, not a way to customize one service.

**Then configure a service** in `config.yml` whose `provider` is exactly the registered key:

```yaml
ai:
  llmServices:
    - name: company-production
      title: Company Production
      provider: company
      options:
        apiKey: ${COMPANY_LLM_API_KEY}
      enabledModels:
        - label: Company Chat
          value: company-chat
```

The configuration is read while the AI Employee plugin boots, before an App Provider has registered its provider, and nothing rejects the unknown key then: a service is matched to its provider only when it is used. Until the provider is registered, the service is simply absent from the model selector.

**Override only what the backend does differently**: `listModels()` for model discovery; `parseResponseMessage()` and `parseResponseChunk()` for response shape; `parseReasoningContent()` for streamed reasoning; `builtInTools()`, `parseWebSearchAction()` and `isToolConflict()` for native search; `getStructuredOutputOptions()` for structured output; `resolveReasoningOptions()` for reasoning parameters; `isApiSupportedAttachment()` for files the backend reads natively; `prepareStoredAssistantAdditionalKwargs()` for response metadata that has to survive storage; `parseResponseMetadata()` and `parseResponseError()` for usage and failures. Start from the built-in provider nearest the backend's protocol.

**Verify it** in the App: the provider appears in AI settings; construction with no options succeeds; a configured service resolves through `getLLMService()`; a chat with that model answers; a missing key and a backend error each produce a readable failure; and embeddings work if declared. Keep the key where [capabilities.md § Where the key lives](capabilities.md#where-the-key-lives) says, and never log `serviceOptions`.

## A direct model call

For one model call with no conversation — no history, no tool loop, no persistence — `getLLMService()` returns a provider to call:

```ts
const { provider } = await ai.llmProviderManager.getLLMService({
  llmService: 'company-production',
  model: 'company-chat',
});
const reply = await provider.invoke({
  messages: [
    {
      role: 'system',
      content: 'Classify the ticket as billing, bug or other.',
    },
    { role: 'user', content: ticket.body },
  ],
});
```

- `messages` is sent as it is. The system prompt is a `role: 'system'` message at its start; there is no separate field.
- `structuredOutput` binds a JSON schema. `tools` binds tools built from their definitions; pass `toolContext: { agentContext, container }` to give each tool the context and declared dependencies an agent would — without it a tool that needs a context fails when it is called. A direct call runs no tool loop, so the reply's tool calls are the caller's to handle.
- Built-in web search (`webSearch: true`) is for a call without tools: passing both logs a warning, and on a provider that cannot combine them the tools are not bound.

Anything that needs tools to run, a pause for approval, or a stored conversation is an agent, not a direct call; see [server-runs.md](server-runs.md#when-to-drive-an-agent-directly).

## Not for an App

- **`ai.features.enableFeatures()`** is how a capability plugin, such as the knowledge base, attaches its implementation; an App provides none of them.
- **MCP servers from code**: `mcpServerManager.registerMCP()` works, but the configuration sync deletes every server `config.yml` does not list. MCP belongs in `ai.mcpServers`; see [capabilities.md § MCP servers](capabilities.md#mcp-servers-configyml).
- **`switchRepository()`** on any manager moves where the plugin stores its state. The plugin does this at start; an App never does.
- **A second `AIManager`** from `createAIManager()`; see [source-map.md § The installed dependency](source-map.md#the-installed-dependency).
