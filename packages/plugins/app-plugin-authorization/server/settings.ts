import { isDeepStrictEqual } from 'node:util';
import {
  ResourceItems,
  type AuthorizationPlugin,
  type AuthorizationTitle,
  type PermissionGrant,
  type SectionRegistry,
} from '@nocobase/authorization/core';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

/** One administration surface and the actions it exposes. */
export interface SettingsItemDefinition {
  readonly id: string;
  readonly title: AuthorizationTitle;
  /** A subsection from `authz.sections`; omitted, the item is listed under administration's "Other". */
  readonly section?: string;
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

/** The subsection every authorization settings item is listed under. */
export const AUTHORIZATION_SETTINGS_SECTION = 'authorization';

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
      ...(item.section === undefined ? {} : { section: item.section }),
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

/** Registers the `settings` catalog type, its `authorization` subsection and `authz.settings`. */
export function settingsPlugin(): SettingsPlugin {
  const service = new SettingsService();
  return {
    id: 'settings',
    authorizationApi: { settings: service },
    setup(authz): void {
      addAuthorizationSection(authz.sections);
      authz.resourceTypes.add({
        type: 'settings',
        title: {
          key: 'options.resourceTypes.settings',
          ns: AUTHORIZATION_NAMESPACE,
        },
        defaultSection: 'administration',
        items: service.items,
      });
    },
  };
}

function addAuthorizationSection(sections: SectionRegistry): void {
  sections.add({
    name: AUTHORIZATION_SETTINGS_SECTION,
    parent: 'administration',
    title: {
      key: 'options.settingsModules.authorization',
      ns: AUTHORIZATION_NAMESPACE,
    },
  });
}
