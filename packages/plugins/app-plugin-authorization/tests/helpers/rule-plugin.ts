import type { AuthorizationPlugin } from '@nocobase/authorization/core';
import {
  createRouteHandler,
  createRuleSupportRoutes,
  type AuthorizationExtensionHost,
} from '../../server/extension/index.js';
import {
  AUTHORIZATION_SETTINGS_SECTION,
  type DatabaseAuthorizationApi,
  type SettingsAuthorizationApi,
  type UiAuthorizationApi,
} from '../../server/index.js';

/**
 * A rule plugin reduced to what the rule packages register through this
 * plugin: a settings item placed in the Authorization subsection and the
 * `/<rule>` support routes.
 */
export function testRulePlugin(
  rule: string,
): AuthorizationPlugin<
  object,
  unknown,
  SettingsAuthorizationApi & DatabaseAuthorizationApi & UiAuthorizationApi
> {
  return {
    id: `test-${rule}`,
    dependencies: ['settings', 'database', 'ui'],
    setup(authz) {
      const id = `authorization.${rule}`;
      authz.settings.add({
        id,
        title: rule,
        actions: ['read', 'create', 'update', 'delete'].map((name) => ({
          name,
        })),
      });
      authz.ui.place(
        { type: 'settings', id },
        { section: AUTHORIZATION_SETTINGS_SECTION },
      );
      authz.routes.add(
        `/${rule}`,
        createRouteHandler(
          createRuleSupportRoutes(
            authz as unknown as AuthorizationExtensionHost,
            rule,
          ),
        ),
      );
    },
  };
}
