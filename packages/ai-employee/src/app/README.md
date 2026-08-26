# AI employee application module

`src/app/` is the packaged application integration for the runtime-neutral `@nocobase/ai-employee` package.

It mounts the existing `resource:action` endpoints before the API proxy, resolves a stable current actor, loads application `ai/` resources into shared stores, exposes administrator-only management, adapts the SSE protocol, enforces conversation/file ownership, and supplies the database/cache/file/checkpoint ports used by `AIEmployee`.

## Phase-one infrastructure choices

- Resource metadata, conversations, messages, files, stream cache, and checkpoints are single-process and in memory. They reset when the App server restarts.
- Directory synchronization is upsert-only; removing a resource file does not implicitly delete an administrator-managed record.
- `X-User-ID`/`X-Actor-ID` is used when supplied. Otherwise a bearer-token subject is mapped to a stable opaque actor ID.
- LLM service secrets can remain environment references. Provider execution resolves them, while management responses preserve option structure and redact secret-bearing fields.
- The full production provider registry is enabled.
- The migrated `AIEmployee`, middleware, checkpoint, attachment, frontend-tool, MCP, Skill, Tool, and sub-agent implementations are used directly; the App adapter does not contain a second chat runtime.

## Explicit integration boundaries

Optional host integrations remain behind narrow ports, but the following host integrations have no NocoBase 3 service in this App template yet and therefore use bounded adapters:

- knowledge-base retrieval reports disabled until a knowledge-base host adapter is supplied;
- datasource/workflow-specific tools require their corresponding NocoBase 3 host services;
- usage telemetry currently has an in-process no-op sink;
- WebSocket notifications are not externally delivered by this App adapter.

These boundaries do not replace the AI runtime with simplified behavior; they isolate unavailable host infrastructure while preserving resource formats, state transitions, API actions, and SSE protocol.
