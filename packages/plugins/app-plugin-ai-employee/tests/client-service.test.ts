import { describe, expect, it } from 'vitest';

import {
  buildAIEmployeeUpdatePayload,
  buildEditableValues,
  hasKnowledgeBaseDataPlaceholder,
  normalizeArrayResponse,
  type AIEmployeeEditableValues,
  type AIEmployeeRecord,
} from '../client/ai-employee-service.ts';

describe('AI employee client response normalization', () => {
  it.each([
    [[{ username: 'a' }]],
    [{ data: [{ username: 'a' }] }],
    [{ data: { rows: [{ username: 'a' }], count: 1 } }],
    [{ data: { data: { items: [{ username: 'a' }] } } }],
  ])('normalizes array and wrapped envelopes', (response) => {
    expect(normalizeArrayResponse<AIEmployeeRecord>(response)).toEqual([
      { username: 'a' },
    ]);
  });
});

describe('AI employee knowledge base editing', () => {
  it('defaults legacy records to always retrieval and preserves on-demand settings', () => {
    expect(
      buildEditableValues({ username: 'legacy' }).knowledgeBase,
    ).toMatchObject({
      retrievalStrategy: 'always',
    });
    expect(
      buildEditableValues({
        username: 'modern',
        knowledgeBase: { retrievalStrategy: 'onDemand' },
      }).knowledgeBase,
    ).toMatchObject({ retrievalStrategy: 'onDemand' });
  });

  it('requires the exact knowledge base data placeholder', () => {
    expect(
      hasKnowledgeBaseDataPlaceholder('Context: {knowledgeBaseData}'),
    ).toBe(true);
    expect(
      hasKnowledgeBaseDataPlaceholder('Context: {knowledgeBasedata}'),
    ).toBe(false);
  });
});

describe('AI employee update payload', () => {
  it('submits editable role, model, skill, and knowledge base settings', () => {
    const employee: AIEmployeeRecord = {
      username: 'ava',
      nickname: 'Ava',
      about: 'read-only role',
      skillSettings: { skills: ['analysis'], tools: [{ name: 'search' }] },
      modelSettings: { enabled: false, futureSetting: true },
      knowledgeBase: { futureSetting: 'preserved' },
    };
    const editable: AIEmployeeEditableValues = {
      enabled: false,
      about: 'updated role',
      modelSettings: {
        enabled: true,
        models: [{ llmService: 'openai', model: 'gpt' }],
      },
      skillSettings: {
        skills: ['analysis', 'writing'],
        tools: [{ name: 'search', autoCall: true }],
      },
      enableKnowledgeBase: true,
      knowledgeBasePrompt: '',
      knowledgeBase: { knowledgeBaseKeys: [], topK: 8, score: 0.7 },
    };

    const payload = buildAIEmployeeUpdatePayload(employee, editable);

    expect(payload).toEqual({
      enabled: false,
      about: 'updated role',
      modelSettings: {
        enabled: true,
        futureSetting: true,
        models: [{ llmService: 'openai', model: 'gpt' }],
      },
      skillSettings: {
        skills: ['analysis', 'writing'],
        tools: [{ name: 'search', autoCall: true }],
      },
      enableKnowledgeBase: true,
      knowledgeBasePrompt: '',
      knowledgeBase: {
        futureSetting: 'preserved',
        knowledgeBaseKeys: [],
        topK: 8,
        score: 0.7,
      },
    });
    expect(payload).not.toHaveProperty('nickname');
  });
});
