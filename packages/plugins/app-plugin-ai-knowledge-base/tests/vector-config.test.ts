import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildVectorStoreConfigHash,
  hasKnowledgeBaseVectorConfigChanged,
  normalizeKnowledgeBaseVectorConfig,
} from '../server/vector-config.js';

const completeConfig = {
  vectorDatabaseKey: 'database',
  llmService: 'openai',
  embeddingModel: 'text-embedding-3-small',
};

describe('knowledge base vector config', () => {
  it('builds a stable SHA-256 hash with sorted field names', () => {
    const expected = createHash('sha256')
      .update(
        JSON.stringify({
          embeddingModel: 'text-embedding-3-small',
          llmService: 'openai',
          vectorDatabaseKey: 'database',
        }),
      )
      .digest('hex');

    expect(buildVectorStoreConfigHash(completeConfig)).toBe(expected);
    expect(
      buildVectorStoreConfigHash({
        embeddingModel: completeConfig.embeddingModel,
        vectorDatabaseKey: completeConfig.vectorDatabaseKey,
        llmService: completeConfig.llmService,
      }),
    ).toBe(expected);
  });

  it('normalizes whitespace-only values to null and trims configured values', () => {
    expect(
      normalizeKnowledgeBaseVectorConfig({
        vectorDatabaseKey: '  database  ',
        llmService: '',
        embeddingModel: '   ',
      }),
    ).toEqual({
      vectorDatabaseKey: 'database',
      llmService: null,
      embeddingModel: null,
    });
    expect(
      buildVectorStoreConfigHash({
        ...completeConfig,
        embeddingModel: '',
      }),
    ).toBeNull();
  });

  it('detects only material changes to the three normalized fields', () => {
    expect(
      hasKnowledgeBaseVectorConfigChanged(completeConfig, {
        ...completeConfig,
      }),
    ).toBe(false);
    expect(
      hasKnowledgeBaseVectorConfigChanged(completeConfig, {
        ...completeConfig,
        llmService: ' openai ',
      }),
    ).toBe(false);
    expect(
      hasKnowledgeBaseVectorConfigChanged(completeConfig, {
        ...completeConfig,
        embeddingModel: 'text-embedding-3-large',
      }),
    ).toBe(true);
  });
});
