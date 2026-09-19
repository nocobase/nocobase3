import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';

export function writableRepository(
  database: DatabaseManager,
  collection: string,
  policy: RepositoryPolicy,
  fields: string[],
) {
  const write = policy.update;
  if (!policy.read || !write) return undefined;

  if (write !== true) {
    const writableFields = write.fields;
    if (writableFields === false) return undefined;
    if (
      writableFields !== undefined &&
      !fields.every((field) => writableFields.includes(field))
    )
      return undefined;
  }

  return database
    .repository(collection)
    .withPolicy(policy)
    .narrow({ read: write === true ? true : { scope: write.scope } });
}

export function editableValues(
  body: unknown,
  fields: readonly string[],
): Record<string, string | number> {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Object.keys(body).length
  )
    throw new TypeError('Expected fields');

  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!fields.includes(key)) throw new TypeError('Unexpected field');
    if (key === 'amount') {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
      )
        throw new TypeError('Invalid amount');
    } else if (typeof value !== 'string' || value.length > 500)
      throw new TypeError('Invalid text');

    values[key] = value;
  }

  return values;
}

export class StateConflictError extends Error {}

export function stateConflict(error: unknown): never {
  if (error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND')
    throw new StateConflictError('Record changed during the operation');

  throw error;
}
