import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../server/internal/runtime-context.js';
import {
  getCurrentRoleNames,
  getKnowledgeBaseBackgroundPrompt,
  KnowledgeBaseManager,
  KNOWLEDGE_BASE_NO_ACCESS_PROMPT,
  KNOWLEDGE_BASE_ON_DEMAND_PROMPT,
  KNOWLEDGE_BASE_PRE_RETRIEVED_PROMPT,
  normalizeKnowledgeBaseRetrievalStrategy,
} from '../server/agent/ai-employee/ai-knowledge-base.js';

const employee = {
  username: 'atlas',
  enableKnowledgeBase: true,
  knowledgeBasePrompt: '{knowledgeBaseData}',
  knowledgeBase: {
    knowledgeBaseKeys: ['handbook'],
    topK: 3,
    score: 0.6,
    retrievalStrategy: 'always' as const,
  },
};

describe('AI employee knowledge-base retrieval', () => {
  it('normalizes legacy strategies and selects the matching background instruction', () => {
    expect(normalizeKnowledgeBaseRetrievalStrategy(undefined)).toBe('always');
    expect(normalizeKnowledgeBaseRetrievalStrategy('invalid')).toBe('always');
    expect(normalizeKnowledgeBaseRetrievalStrategy('onDemand')).toBe(
      'onDemand',
    );
    expect(
      getKnowledgeBaseBackgroundPrompt({
        accessDenied: false,
        onDemand: true,
        preRetrieved: false,
      }),
    ).toBe(KNOWLEDGE_BASE_ON_DEMAND_PROMPT);
    expect(
      getKnowledgeBaseBackgroundPrompt({
        accessDenied: false,
        onDemand: false,
        preRetrieved: true,
      }),
    ).toBe(KNOWLEDGE_BASE_PRE_RETRIEVED_PROMPT);
    expect(
      getKnowledgeBaseBackgroundPrompt({
        accessDenied: true,
        onDemand: true,
        preRetrieved: true,
      }),
    ).toBe(KNOWLEDGE_BASE_NO_ACCESS_PROMPT);
  });

  it('uses the current request roles for permission-aware retrieval', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        content: 'Internal policy',
        metadata: { matchedQuestions: ['What is the policy?'] },
        score: 0.9,
      },
    ]);
    const getAccessibleKnowledgeBaseKeys = vi
      .fn()
      .mockResolvedValue(['handbook']);
    const ctx = {
      ai: {
        features: {
          isFeaturesEnabled: vi.fn().mockReturnValue(true),
          knowledgeBase: { search, getAccessibleKnowledgeBaseKeys },
        },
      },
    } as unknown as Context;
    const manager = new KnowledgeBaseManager({
      ctx,
      repositories: {
        aiEmployees: { findOne: vi.fn().mockResolvedValue(employee) },
      } as never,
    });
    const roleNames = getCurrentRoleNames({
      currentRoles: ['editor', 'reviewer', 'editor'],
    });

    await expect(
      manager.hasAccessibleKnowledgeBase({ employee, roleNames }),
    ).resolves.toBe(true);
    await expect(
      manager.retrievePrompt({ employee, query: 'policy', roleNames }),
    ).resolves.toContain('Internal policy');
    expect(getAccessibleKnowledgeBaseKeys).toHaveBeenCalledWith({
      knowledgeBaseKeys: ['handbook'],
      roleNames: ['editor', 'reviewer'],
    });
    expect(search).toHaveBeenCalledWith({
      knowledgeBaseKeys: ['handbook'],
      query: 'policy',
      topK: 3,
      score: '0.6',
      roleNames: ['editor', 'reviewer'],
    });
  });
});
