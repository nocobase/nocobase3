import { expect, test } from 'vitest';
import aiKnowledgeBase from '../client/plugin.ts';

test('registers the knowledge base client bootstrap only', () => {
  const plugin = aiKnowledgeBase();
  expect(plugin.packageName).toBe('@nocobase/app-plugin-ai-knowledge-base');
  expect(plugin.bootstrap).toBeTypeOf('function');
});
