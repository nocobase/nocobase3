import { expect, test } from 'vitest';
import aiKnowledgeBase from '../client/plugin.ts';

test('registers the knowledge base client contributions', () => {
  const plugin = aiKnowledgeBase();
  expect(plugin.packageName).toBe('@nocobase/app-plugin-ai-knowledge-base');
  expect(plugin.routes).toEqual([{ parent: 'app', routes: [] }]);
});
