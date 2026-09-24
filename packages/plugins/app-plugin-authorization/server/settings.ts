import { isDeepStrictEqual } from 'node:util';
import {
  ResourceItems,
  type AuthorizationPlugin,
  type AuthorizationTitle,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

/** One administration surface and the actions it exposes. */
export interface SettingsItemDefinition {
  readonly id: string;
  readonly title: AuthorizationTitle;
  readonly actions: readonly {
    readonly name: string;
    readonly title?: AuthorizationTitle;
  }[];
}

/** `authz.settings`. */
export interface SettingsApi {
  /** Re-adding an identical item is a no-op; a different one throws. */
  add(item: SettingsItemDefinition): void;
  /** A grant of registered actions on a registered item. */
  grant(id: string, actions: readonly string[]): PermissionGrant;
}

export interface SettingsAuthorizationApi {
  settings: SettingsApi;
}

export type SettingsPlugin = AuthorizationPlugin<SettingsAuthorizationApi>;

class SettingsService implements SettingsApi {
  readonly items: ResourceItems = new ResourceItems();
  private readonly definitions = new Map<string, SettingsItemDefinition>();

  add(item: SettingsItemDefinition): void {
    const existing = this.definitions.get(item.id);
    if (existing) {
      if (isDeepStrictEqual(existing, structuredClone({ ...item }))) return;
      throw new Error(`Settings item already registered: ${item.id}`);
    }
    this.definitions.set(item.id, structuredClone({ ...item }));
    this.items.add({
      id: item.id,
      title: item.title,
      actions: item.actions,
    });
  }

  grant(id: string, actions: readonly string[]): PermissionGrant {
    const item = this.items.get(id);
    if (!item) throw new TypeError(`Unknown settings item: ${id}`);
    for (const action of actions)
      if (!item.actions.some((entry) => entry.name === action))
        throw new TypeError(`Settings item ${id} has no action ${action}`);
    return {
      resource: { type: 'settings', id },
      actions: actions.map((action) => ({ action })),
    };
  }
}

/**
 * Registers the `settings` catalog type and `authz.settings`. Where an item is
 * listed is `authz.ui.place`'s concern.
 */
export function settingsPlugin(): SettingsPlugin {
  const service = new SettingsService();
  return {
    id: 'settings',
    authorizationApi: { settings: service },
    setup(authz): void {
      authz.resourceTypes.add({
        type: 'settings',
        title: {
          key: 'options.resourceTypes.settings',
          ns: AUTHORIZATION_NAMESPACE,
        },
        items: service.items,
      });
    },
  };
}
