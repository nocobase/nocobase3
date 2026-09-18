import {
  ResourceActionRegistry,
  type ResourceActionDeclaration,
} from '@nocobase/authorization/core';
import { sameOptionText, type OptionText } from '../i18n.js';

/**
 * A Collection an application declared part of the permission model.
 *
 * Intent only: no fields, no primary key. db owns that metadata and is read at
 * authorize time, so the two can never disagree.
 */
export interface DatabaseCollectionRegistration {
  readonly name: string;
  readonly title?: OptionText;
  readonly description?: OptionText;
  readonly actions?: readonly ResourceActionDeclaration[];
}

/**
 * Which Collections can be granted on. Registration is the opt-in: a table db
 * happens to hold is not part of the model until an application says so, which
 * keeps system and bookkeeping tables out of the permission UI and out of
 * every grant.
 */
export class DatabaseCollectionRegistry {
  readonly actionRegistry: ResourceActionRegistry =
    new ResourceActionRegistry();
  private readonly registrations = new Map<
    string,
    DatabaseCollectionRegistration
  >();

  /** Runs at boot, before a connection is usable, so it never reaches db. */
  add(collection: string | DatabaseCollectionRegistration): void {
    const registration =
      typeof collection === 'string' ? { name: collection } : collection;
    if (!registration.name) {
      throw new Error('A database Collection registration needs a name');
    }
    const existing = this.registrations.get(registration.name);
    if (existing) {
      // Boot runs more than once in some hosts, so repeating the same
      // declaration is not a mistake; disagreeing about it is.
      if (
        sameOptionText(existing.title, registration.title) &&
        sameOptionText(existing.description, registration.description) &&
        (existing.actions ?? []).length ===
          (registration.actions ?? []).length &&
        (existing.actions ?? []).every(
          (action, index) => action === registration.actions?.[index],
        )
      )
        return;
      throw new Error(
        `Database Collection already registered: ${registration.name}`,
      );
    }
    const actions = registration.actions ?? [
      'read',
      'create',
      'update',
      'delete',
    ];
    this.actionRegistry.add(registration.name, actions);
    this.registrations.set(registration.name, {
      ...registration,
      ...(registration.actions ? { actions: [...registration.actions] } : {}),
    });
  }

  has(name: string): boolean {
    return this.registrations.has(name);
  }

  list(): readonly DatabaseCollectionRegistration[] {
    return [...this.registrations.values()].map((registration) => ({
      ...registration,
      ...(registration.actions ? { actions: [...registration.actions] } : {}),
    }));
  }
}
