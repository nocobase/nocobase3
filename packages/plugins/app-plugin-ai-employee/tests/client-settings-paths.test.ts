import { expect, test } from 'vitest';
import {
  aiEmployeePath,
  aiSettingsPath,
  aiServiceSettingsPath,
  conversationCenterPath,
  knowledgeBasePath,
  llmServicePath,
  mcpServicePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

test('AI features link to independent settings pages', () => {
  expect([
    aiSettingsPath,
    aiEmployeePath,
    knowledgeBasePath,
    vectorDatabasesPath,
  ]).toEqual([
    '/settings/ai',
    '/settings/ai',
    '/settings/ai/knowledge-base',
    '/settings/ai/vector-database',
  ]);
});

test('services link to independent pages while the old URL remains compatible', () => {
  expect(aiServiceSettingsPath).toBe('/settings/ai/settings');
  expect(llmServicePath).toBe('/settings/ai/llm-services');
  expect(mcpServicePath).toBe('/settings/ai/mcp-services');
});

test('the conversation center keeps its URL as a sibling settings page', () => {
  expect(conversationCenterPath).toBe('/settings/ai/conversations');
});
