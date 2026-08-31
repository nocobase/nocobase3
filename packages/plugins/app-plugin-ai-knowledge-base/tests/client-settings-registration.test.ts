import { expect, test } from 'vitest';
import aiKnowledgeBase from '../client/plugin.ts';
import { getAISettingsTabs } from '@nocobase/app-plugin-ai-employee/client/ai-settings';
import settings from '@nocobase/app-plugin-ai-employee/client/settings';

test('contributes internally routed tabs to the single AI settings page', async () => {
  aiKnowledgeBase();

  expect(settings).toMatchObject({
    parent: 'settings',
    routes: [{ name: 'ai', path: '/ai' }],
  });
  const tabs = getAISettingsTabs();
  expect(tabs.map((tab) => tab.key)).toEqual([
    'ai-employee',
    'llm-service',
    'knowledge-base',
    'vector-database',
  ]);

  const knowledgeBase = tabs.find((tab) => tab.key === 'knowledge-base');
  const module = await knowledgeBase?.pageLoader();
  expect(module?.default.name).toBe('KnowledgeBaseSettingsPage');
});
