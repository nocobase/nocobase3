import { expect, it } from 'vitest';
import {
  resolveAppClientContributions,
  defineSettingsRoutes,
} from '@nocobase/app-client/plugins';
import routes from '../client/routes.js';
it('contributes its page to the authorization group with its own namespace', () => {
  const result = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-authz-sharing-rules', routes },
    {
      packageName: '@nocobase/app-plugin-authorization',
      routes: defineSettingsRoutes([
        {
          name: 'authorization',
          path: '/authorization',
          navigation: { title: 'Authorization' },
          children: [],
        },
      ]),
    },
  ]);
  expect(result.settings[0]).toMatchObject({
    id: 'sharing-rules',
    path: '/settings/authorization/sharing-rules',
    packageName: '@nocobase/app-plugin-authz-sharing-rules',
    groupId: 'authorization',
  });
});
