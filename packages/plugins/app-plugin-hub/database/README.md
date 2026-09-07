# Application Hub database

The Hub migration creates three collections with distinct ownership:

- `hubApps` stores application settings and the current successful deployment
  pointer.
- `hubAppReleases` stores immutable uploaded build metadata. A version label
  may have multiple builds; the artifact checksum identifies their content.
- `hubAppDeployments` stores immutable deploy and rollback operation history,
  configuration bindings, progress, and errors.

Runtime state is intentionally not persisted as authoritative Hub data. The
App Host owns the current `registered`, `running`, `stopped`, or `failed` state,
and the Hub reports `unknown` while the Host is unavailable.

The initial migration is self-contained and explicitly declares every field
and index. After it has shipped, schema changes must be added as new migrations
instead of editing it.
