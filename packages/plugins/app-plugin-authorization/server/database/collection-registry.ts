/**
 * A Collection an application declared part of the permission model.
 *
 * Intent only: no fields, no primary key. db owns that metadata and is read at
 * authorize time, so the two can never disagree.
 */
export interface DatabaseCollectionRegistration {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
}

/**
 * Which Collections can be granted on. Registration is the opt-in: a table db
 * happens to hold is not part of the model until an application says so, which
 * keeps system and bookkeeping tables out of the permission UI and out of
 * every grant.
 */
export class DatabaseCollectionRegistry {
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
        existing.title === registration.title &&
        existing.description === registration.description
      )
        return;
      throw new Error(
        `Database Collection already registered: ${registration.name}`,
      );
    }
    this.registrations.set(registration.name, registration);
  }

  has(name: string): boolean {
    return this.registrations.has(name);
  }

  list(): readonly DatabaseCollectionRegistration[] {
    return [...this.registrations.values()];
  }
}
