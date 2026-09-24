import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionSetsAuthorizationApi } from '@nocobase/authorization/permission-sets';
import { AUTHORIZATION_NAMESPACE } from '../../shared.js';
import type { AuthorizationExtensionHost } from '../host.js';
import type { SettingsAuthorizationApi } from '../settings.js';
import { AUTHORIZATION_SETTINGS_SECTION } from '../ui.js';
import { createInspectorHandler, INSPECTOR_SETTINGS } from './inspector.js';
import {
  createPermissionSetHandler,
  PERMISSION_SETS_SETTINGS,
} from './permission-sets.js';

const text = (key: string) => ({ key, ns: AUTHORIZATION_NAMESPACE });
const action = (name: string) => ({
  name,
  title: text(`options.actions.${name}`),
});

/** The Permission Set and inspector settings items and their routes. */
export function installAuthorizationAdministration(
  authz: Authorization &
    AuthorizationExtensionHost &
    SettingsAuthorizationApi &
    PermissionSetsAuthorizationApi,
): void {
  authz.settings.add({
    id: PERMISSION_SETS_SETTINGS,
    title: text('options.settings.permission-sets'),
    actions: ['read', 'create', 'update', 'delete', 'assign'].map(action),
  });
  authz.settings.add({
    id: INSPECTOR_SETTINGS,
    title: text('options.settings.inspector'),
    actions: [action('inspect')],
  });
  for (const id of [PERMISSION_SETS_SETTINGS, INSPECTOR_SETTINGS])
    authz.ui.place(
      { type: 'settings', id },
      { section: AUTHORIZATION_SETTINGS_SECTION },
    );
  authz.routes.add(
    '/permission-sets',
    createPermissionSetHandler(authz, authz.permissionSets),
  );
  authz.routes.add(
    '/inspector',
    createInspectorHandler(authz, authz.permissionSets),
  );
}
