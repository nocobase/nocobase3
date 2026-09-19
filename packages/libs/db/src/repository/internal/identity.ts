import type {
  CollectionDefinition,
  PrimaryConstraintDefinition,
  UniqueConstraintDefinition,
} from '../../collection/types.js';
import { RepositoryError } from '../errors.js';
import type { RepositoryRecord, UniqueSelector } from '../types.js';

export function identityConstraints(
  collection: CollectionDefinition,
): Array<PrimaryConstraintDefinition | UniqueConstraintDefinition> {
  return (collection.constraints ?? [])
    .filter(
      (
        constraint,
      ): constraint is
        PrimaryConstraintDefinition | UniqueConstraintDefinition =>
        (constraint.type === 'primary' ||
          (constraint.type === 'unique' && !constraint.predicate)) &&
        constraint.fields.length > 0,
    )
    .sort(
      (left, right) =>
        Number(right.type === 'primary') - Number(left.type === 'primary'),
    );
}

export function recordSelector(
  collection: CollectionDefinition,
  record: RepositoryRecord,
): UniqueSelector {
  const constraint = identityConstraints(collection).find((candidate) =>
    candidate.fields.every(
      (field) => record[field] !== undefined && record[field] !== null,
    ),
  );
  if (!constraint) {
    throw new RepositoryError(
      'INVALID_UNIQUE_SELECTOR',
      'Repository record requires a complete, non-null primary or unconditional unique selector.',
      { collection: collection.name },
    );
  }
  return {
    kind: 'unique',
    fields: [...constraint.fields],
    values: Object.fromEntries(
      constraint.fields.map((field) => [field, record[field]]),
    ),
  };
}

export function createdRecordSelector(
  collection: CollectionDefinition,
  values: RepositoryRecord,
  returned: unknown,
): UniqueSelector {
  const record = { ...values };
  const generated = (collection.fields ?? []).filter(
    (field) =>
      !('target' in field) &&
      (field.autoIncrement || field.type === 'increments'),
  );
  const insertId: unknown = Array.isArray(returned) ? returned[0] : undefined;
  // Drivers without RETURNING may supply one generated numeric identity, not a value for every primary field.
  if (
    generated.length === 1 &&
    (typeof insertId === 'number' ||
      typeof insertId === 'string' ||
      typeof insertId === 'bigint')
  ) {
    const field = generated[0].name;
    if (record[field] === undefined) record[field] = insertId;
  }
  return recordSelector(collection, record);
}
