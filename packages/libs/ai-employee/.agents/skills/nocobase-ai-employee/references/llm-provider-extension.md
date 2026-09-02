# Application-Specific LLM Provider Extension

## Contents

- [When to Extend](#when-to-extend)
- [Where the Code Lives](#where-the-code-lives)
- [Chat Provider](#chat-provider)
- [Embedding Provider](#embedding-provider)
- [Provider Metadata](#provider-metadata)
- [Plugin Bootstrap Registration](#plugin-bootstrap-registration)
- [LLM Service Configuration](#llm-service-configuration)
- [Startup Ordering](#startup-ordering)
- [Provider Hooks](#provider-hooks)
- [Security and Testing](#security-and-testing)

This file gives implementation patterns. For exact provider constructor, metadata, model selection, and return contracts, read [Exact Application Contracts](application-contracts.md).

## When to Extend

Add an application-specific provider when the App must connect to a backend not already registered by `@nocobase/ai-employee`, or when the backend needs App-specific protocol handling.

Do not modify the installed `@nocobase/ai-employee` provider implementation for one application. Own the provider in an enabled App plugin so it can register against the shared `deps.ai` aggregate.

Before implementing, inspect the built-in provider list through `deps.ai.llmProviderManager.listLLMProviders()`. Prefer an existing provider plus a custom LLM service/base URL when the protocol is already compatible.

## Where the Code Lives

Recommended plugin layout:

```text
<plugin-package>/
└── server/
    ├── bootstrap.ts
    └── ai/
        └── company-provider.ts
```

The plugin must be enabled in the App's plugin configuration. The generated App resolves its `server/bootstrap.ts` and passes application dependencies to it.

## Chat Provider

```ts
import {
  LLMProvider,
  type LLMProviderMeta,
  SupportedModel,
} from '@nocobase/ai-employee';
import { ChatOpenAI } from '@langchain/openai';

export class CompanyProvider extends LLMProvider {
  declare chatModel: ChatOpenAI;

  get baseURL(): string {
    return 'https://llm.example.com/v1';
  }

  createModel(): ChatOpenAI {
    const { apiKey } = this.serviceOptions;
    const { model, ...modelOptions } = this.modelOptions ?? {};
    return new ChatOpenAI({
      apiKey,
      model,
      ...modelOptions,
      configuration: { baseURL: this.getResolvedBaseURL() },
      verbose: false,
    });
  }
}
```

The provider receives:

- `serviceOptions` from the selected LLM service's `options`;
- `modelOptions` containing the selected model plus service/default/request options.

The manager creates `new Provider({})` while calculating provider/model metadata. Therefore construction and field initialization must tolerate absent service/model options; `createModel()` is only called by the base constructor when model options exist.

## Embedding Provider

Add only when the backend supports embeddings:

```ts
import { EmbeddingProvider } from '@nocobase/ai-employee';
import { OpenAIEmbeddings } from '@langchain/openai';

export class CompanyEmbeddingProvider extends EmbeddingProvider {
  protected getDefaultUrl(): string {
    return 'https://llm.example.com/v1';
  }

  createEmbedding(): OpenAIEmbeddings {
    return new OpenAIEmbeddings({
      apiKey: this.apiKey,
      model: this.model,
      configuration: { baseURL: this.baseURL },
    });
  }
}
```

The base class validates the API key, model, and URL.

## Provider Metadata

```ts
export const companyProviderOptions: LLMProviderMeta = {
  title: 'Company LLM',
  provider: CompanyProvider,
  embedding: CompanyEmbeddingProvider,
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  models: {
    [SupportedModel.LLM]: ['company-chat'],
    [SupportedModel.EMBEDDING]: ['company-embedding'],
  },
  supportWebSearch: false,
};
```

Use an explicit `supportedModel`. Although provider listing can display an omitted value as LLM, capability filtering uses the explicit array.

`models` is provider metadata; it does not create LLM services or automatically enable those models.

## Plugin Bootstrap Registration

```ts
import type { AppPluginServerContext } from '@nocobase/app-server/plugins';
import type { AIManager } from '@nocobase/ai-employee';
import { companyProviderOptions } from './ai/company-provider.js';

interface PluginDeps {
  ai: AIManager;
}

export default function bootstrap(
  context: AppPluginServerContext<PluginDeps>,
): void {
  context.deps.ai.llmProviderManager.registerLLMProvider(
    'company',
    companyProviderOptions,
  );
}
```

The key `company` is the public application registry key. Registration uses `Map.set`, so reusing a built-in key replaces its metadata and requires explicit approval.

## LLM Service Configuration

Provider registration alone is not enough. Configure a declarative service in `<appRoot>/config.yml` under `ai.llmServices`; the `provider` value must match the registered key exactly:

```yaml
ai:
  llmServices:
    - name: company-production
      title: Company Production
      provider: company
      options:
        apiKey: ${COMPANY_LLM_API_KEY}
        baseURL: ${COMPANY_LLM_BASE_URL}
      enabledModels:
        mode: custom
        models:
          - label: Company Chat
            value: company-chat
      enabled: true
```

After editing the config, invoke application config reload. The service set is reconciled live without rebuilding, repacking, restarting, or rescanning AI resources.

The service `provider` must exactly equal the plugin bootstrap registry key.

Alternatively, the same plugin may call `deps.ai.llmServiceManager.registerLLMService(...)` after provider registration when service configuration is computed rather than static.

## Startup Ordering

Plugin bootstraps run before the App finishes serving requests, while AI resource initialization is asynchronous. Provider metadata must be registered synchronously in bootstrap so it is available when App LLM services are later resolved.

If a plugin needs to inspect or mutate already-loaded employee/LLM resources, use the AI plugin's readiness integration rather than relying on bootstrap ordering by accident. Keep provider metadata registration itself synchronous and early.

## Provider Hooks

Override only backend-specific behavior:

- `listModels()` for provider-side model discovery;
- `parseResponseMessage()` and `parseResponseChunk()` for response normalization;
- `parseReasoningContent()` for streamed reasoning;
- `parseWebSearchAction()` and `builtInTools()` for native web search;
- `isToolConflict()` when native tools cannot coexist with regular tools;
- `getStructuredOutputOptions()` for schema/output format differences;
- reasoning/model request hooks for protocol-specific parameters;
- attachment conversion hooks for native image/PDF handling;
- persistence hooks when provider metadata must survive message storage;
- `parseResponseMetadata()` and `parseResponseError()` for usage/failure normalization.

Follow the nearest built-in provider using the same protocol as a reference, but keep the new implementation in the App plugin.

## Security and Testing

- Keep credentials in environment variables referenced by `config.yml` `ai.llmServices` or injected service options.
- Never log service options containing credentials.
- Use base URL helpers inherited from `LLMProvider`; do not bypass URL whitelist checks.
- Build provider API URLs with `getResolvedBaseURL()` or `buildRequestURL()`.
- Use the package's guarded request utility if implementing custom model discovery.

Test in the owning plugin:

1. plugin bootstrap registers the expected provider key;
2. provider construction tolerates empty metadata-only options;
3. default/custom base URL and model options map correctly;
4. matching LLM service resolves through `llmProviderManager.getLLMService`;
5. missing key/model and backend errors are normalized;
6. response/tool/reasoning behavior matches advertised capabilities;
7. embedding creation works when declared;
8. the generated App starts with the plugin enabled and the service visible.

Inspect the App and owning plugin `package.json` files, then run their available lint, typecheck, test, and build scripts.
