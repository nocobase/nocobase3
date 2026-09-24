import type { Authorization } from '@nocobase/authorization/core';
import type { PermissionSetsAuthorizationApi } from '@nocobase/authorization/permission-sets';
import { AUTHORIZATION_NAMESPACE } from '../../shared.js';
import type { AuthorizationExtensionHost } from '../host.js';
import {
  AUTHORIZATION_SETTINGS_GROUP,
  type SettingsAuthorizationApi,
} from '../settings.js';
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
    group: AUTHORIZATION_SETTINGS_GROUP,
    actions: ['read', 'create', 'update', 'delete', 'assign'].map(action),
  });
  authz.settings.add({
    id: INSPECTOR_SETTINGS,
    title: text('options.settings.inspector'),
    group: AUTHORIZATION_SETTINGS_GROUP,
    actions: [action('inspect')],
  });
  authz.routes.add(
    '/permission-sets',
    createPermissionSetHandler(authz, authz.permissionSets),
  );
  authz.routes.add(
    '/inspector',
    createInspectorHandler(authz, authz.permissionSets),
  );
}
