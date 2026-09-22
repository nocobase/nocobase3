import { createAuthorization as createCoreAuthorization } from '@nocobase/authorization/core';
import { settingsResource } from '../server/management/settings-resource.js';
export const createAuthorization: typeof createCoreAuthorization = (options) =>
  createCoreAuthorization({
    ...options,
    plugins: [
      {
        id: 'test-settings',
        setup(authz) {
          authz.resourceTypes.add(settingsResource);
          authz.resourceGroups.add({
            name: 'authorization',
            title: 'Authorization',
            category: 'administration',
          });
        },
      },
      ...options.plugins,
    ],
  });
