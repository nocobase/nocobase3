import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';

describe('knowledge base migration contract', () => {
  it('owns exactly the six compatibility collections and does not create llmServices', () => {
    const source = readFileSync(
      path.resolve(
        'database/migrations/202608260001_create_ai_knowledge_base.ts',
      ),
      'utf8',
    );
    for (const name of [
      'aiKnowledgeBase',
      'aiKnowledgeBaseDocs',
      'aiKnowledgeBaseDocSegments',
      'aiKnowledgeBaseDocSegmentShards',
      'aiVectorDatabases',
      'aiVectorStoreConfig',
    ])
      expect(source).toMatch(
        new RegExp(`createCollection\\(\\s*['"]${name}['"]`),
      );
    expect(source).not.toContain("createCollection('llmServices'");
    expect(source).toContain("['knowledgeBaseDocsId', 'uid']");
    expect(source).toContain(
      "['knowledgeBaseDocsId', 'segmentVersion', 'shardNo']",
    );
  });

  it('drops the legacy config schema without reading or backfilling data', () => {
    const source = readFileSync(
      path.resolve(
        'database/migrations/202609020001_inline_knowledge_base_vector_config.ts',
      ),
      'utf8',
    );
    for (const snippet of [
      "collection.string('vectorDatabaseKey'",
      "collection.string('llmService'",
      "collection.string('embeddingModel'",
      "collection.string('vectorStoreConfigHash'",
      "collection.datetime('vectorStoreUpdatedAt'",
    ]) {
      expect(source).toContain(snippet);
    }
    expect(source).toContain("collection.dropField('vectorStoreConfigKey')");
    expect(source).toContain("collection.dropField('vectorStoreConfigId')");
    expect(source).toContain("builder.dropCollection('aiVectorStoreConfig')");
    expect(source).toContain('irreversible: true');
    expect(source).not.toMatch(/\bquery\b/);
    expect(source).not.toMatch(/selectFrom|findOne|find\(/);
  });
});
