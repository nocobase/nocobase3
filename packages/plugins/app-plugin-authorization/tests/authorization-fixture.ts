import { createAuthorization as createCoreAuthorization } from '@nocobase/authorization/core';
import { settingsResource } from '../server/management/settings-resource.js';
export const createAuthorization: typeof createCoreAuthorization = (options) =>
  createCoreAuthorization({
    ...options,
    plugins: [
      {
        id: 'test-settings',
        setup(authz) {
          authz.resources.add(settingsResource);
        },
      },
      ...options.plugins,
    ],
  });
