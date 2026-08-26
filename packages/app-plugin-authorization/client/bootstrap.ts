import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import {
  KeyRound,
  LockKeyhole,
  Share2,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';
import { createElement } from 'react';

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
  refine.addResources([
    {
      name: 'authorization',
      meta: { label: 'Authorization', icon: createElement(ShieldCheck) },
    },
    {
      name: 'authorization.settings.permission-sets',
      list: '/settings/authorization/permission-sets',
      meta: {
        label: 'Permission Sets',
        parent: 'authorization',
        icon: createElement(KeyRound),
      },
    },
    {
      name: 'authorization.settings.default-access',
      list: '/settings/authorization/default-access',
      meta: {
        label: 'Default Access',
        parent: 'authorization',
        icon: createElement(LockKeyhole),
      },
    },
    {
      name: 'authorization.settings.sharing-rules',
      list: '/settings/authorization/sharing-rules',
      meta: {
        label: 'Sharing Rules',
        parent: 'authorization',
        icon: createElement(Share2),
      },
    },
    {
      name: 'authorization.settings.restriction-rules',
      list: '/settings/authorization/restriction-rules',
      meta: {
        label: 'Restriction Rules',
        parent: 'authorization',
        icon: createElement(ShieldBan),
      },
    },
  ]);
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
