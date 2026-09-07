import { expect, test } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import aiKnowledgeBase from '../client/plugin.ts';

test('registers the knowledge base client contributions', () => {
  const plugin = aiKnowledgeBase();
  expect(plugin.packageName).toBe('@nocobase/app-plugin-ai-knowledge-base');
  expect(plugin.routes).toHaveLength(1);
  expect(plugin.routes?.[0]).toMatchObject({ parent: 'dev' });

  expect(() =>
    resolveAppClientContributions([
      { packageName: plugin.packageName, routes: plugin.routes },
    ]),
  ).not.toThrow();
});
