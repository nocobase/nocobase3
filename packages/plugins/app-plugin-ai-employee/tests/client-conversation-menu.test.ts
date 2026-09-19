import { expect, it } from 'vitest';
import { createAISettings } from '../client/ai-settings.js';

it('keeps the conversation route accessible without a sidebar entry', () => {
  const route = createAISettings().children.find(
    (entry) => entry.name === 'aiConversations',
  );
  expect(route).toMatchObject({
    path: '/ai/conversations',
    authz: {
      resource: { type: 'page', id: 'ai.settings' },
      action: 'access',
    },
    componentLoader: expect.any(Function),
  });
  expect(route).not.toHaveProperty('navigation');
});
