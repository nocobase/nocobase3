import { describe, expect, it } from 'vitest';

import {
  normalizeDisks,
  resolveAIEmployeeStorageDisk,
  resolveAIKnowledgeBaseStorageDisks,
  type AIApplicationConfig,
} from '../server/config.js';

function config(
  shared?: readonly string[],
  employee?: readonly string[],
  knowledgeBase?: readonly string[],
): AIApplicationConfig {
  return {
    storage: { disk: shared },
    aiEmployee: { storage: { disk: employee } },
    aiKnowledgeBase: { storage: { disk: knowledgeBase } },
  };
}

describe('AI storage config', () => {
  it('normalizes disk arrays without parsing comma-separated strings', () => {
    expect(normalizeDisks([' a ', '', 'a', 'b,c'])).toEqual(['a', 'b,c']);
  });

  it('resolves employee and knowledge base scopes independently', () => {
    const value = config(['a', 'b', 'c'], ['employee-a']);
    expect(resolveAIEmployeeStorageDisk(value, 'local')).toBe('employee-a');
    expect(resolveAIKnowledgeBaseStorageDisks(value, 'local')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('falls back through shared storage to the application default disk', () => {
    expect(resolveAIEmployeeStorageDisk(config(['a', 'b']), 'local')).toBe('a');
    expect(
      resolveAIKnowledgeBaseStorageDisks(config(['a', 'b']), 'local'),
    ).toEqual(['a', 'b']);
    expect(resolveAIEmployeeStorageDisk(config(), 'local')).toBe('local');
    expect(resolveAIKnowledgeBaseStorageDisks(config(), 'local')).toEqual([
      'local',
    ]);
  });
});
