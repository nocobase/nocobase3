# Declarative Knowledge-base Manifests

Use application configuration to preload Drive objects during server startup:

```yaml
ai:
  aiKnowledgeBase:
    manifests:
      - disk: local
        locations:
          - preload/knowledge-base/manifest.yml
```

Every location is a Drive-relative object key. Leading `/` is removed; host filesystem paths are not supported. The YAML object must have `key`, `operation`, and one or more `files` groups. `operation: init` also requires `initiate` with a target storage disk, display name, stable vector-database key, enabled LLM service name, and embedding model.

```yaml
key: product-manuals
operation: init
initiate:
  disk: local
  name: Product manuals
  vectorDatabase: pgvector1
  llmService: embedding-service
  embeddingModel: text-embedding-3-small
files:
  - disk: local
    locations:
      - preload/knowledge-base/manual.pdf
```

## Operations

- `init` creates one LOCAL knowledge base unless an unrelated base already owns the key.
- `append` requires an existing LOCAL knowledge base and creates documents for unfinished files.
- `recover` requires an existing LOCAL knowledge base and finds the latest successful document mapping by exact knowledge-base key plus source disk/location. It never guesses by filename. Identical content is a no-op; changed content preserves the document ID/key, removes old vectors and segments, replaces the source object/metadata, resets processing state, and dispatches vectorization again.

## Persistence and replay

Manifest identity is its configuration source disk plus normalized source location. A successful source is permanently terminal even if YAML content later changes. A failed or interrupted source resumes its persisted snapshot and skips successful files. File success means object/metadata persistence and successful vectorization dispatch; it does not wait for segmentation or vector persistence.

Server plugins may resolve `knowledgeBaseManifestServiceToken` from the App container and call `apply()` with both source and parsed Manifest. `state(ids)` returns deterministic persisted parent/file results. There is no Manifest HTTP API or management page.

## Troubleshooting

Confirm the named Drive disks exist, source keys are relative, file extensions and sizes satisfy normal upload constraints, the target is LOCAL, and stable vector-database/LLM references exist and are enabled. A previously successful source will not replay; use a new logical source location for an intentional new import.
