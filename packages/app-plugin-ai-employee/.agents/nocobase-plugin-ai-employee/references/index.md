# Reference Index

This skill is for a NocoBase App created with `pnpm create @nocobase/app`.

1. Start with [source-map.md](source-map.md) to choose an App-owned extension point.
2. Use [frontend-registry.md](frontend-registry.md) for chat, page context, forms, tasks, browser tools, and AI settings tabs.
3. Use [api-reference.md](api-reference.md) when the App must consume `/api/ai`; prefer the installed service and transport.
4. Use [agent-service.md](agent-service.md) to distinguish public `@nocobase/ai-employee` manager APIs from private AgentService implementation.
5. Use [contracts.md](contracts.md) for exact parameter names, optionality, enum values, defaults, and return shapes when source is unavailable.

App code should import the `@nocobase/ai-employee` public root, use public plugin client exports, and edit only App-owned source or App plugins.
