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
});
