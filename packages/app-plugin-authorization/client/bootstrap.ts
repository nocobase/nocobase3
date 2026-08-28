import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import type { AppClientRefineConfig } from '@nocobase/app-client';

import { configureAuthorizationClient } from './runtime.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient, refine }) => {
  const authz = configureAuthorizationClient(appClient);
  const accessControlProvider: NonNullable<
    AppClientRefineConfig['accessControlProvider']
  > = {
    async can({ resource, action }) {
      if (!resource) return { can: false };
      if (resource === 'authorization') return { can: true };
      if (resource.startsWith('authorization.settings.')) {
        return {
          can: await authz.can(
            {
              type: 'authorization.settings',
              id: resource.slice('authorization.settings.'.length),
            },
            administrationAction(action),
          ),
        };
      }
      return {
        can: await authz.can({ type: 'page', id: resource }, 'access'),
      };
    },
  };

  refine.setAccessControlProvider(accessControlProvider);
};

export default bootstrap;

function administrationAction(action: string): string {
  switch (action) {
    case 'list':
    case 'show':
      return 'read';
    case 'edit':
      return 'update';
    case 'delete':
      return 'delete';
    default:
      return action;
  }
}
