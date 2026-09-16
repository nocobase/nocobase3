import type {
  CollectionDefinition,
  PhysicalCollectionSchema,
} from '@nocobase/db';

import type { PhysicalCollectionDetail } from '../database-explorer-client.js';

/**
 * One Field of a Collection definition. Reached through an indexed access
 * rather than imported by name: `@nocobase/db` guards its public entry with a
 * public-API check and does not export the Field union.
 */
export type CollectionField = NonNullable<
  CollectionDefinition['fields']
>[number];

export type PhysicalColumn = PhysicalCollectionSchema['columns'][number];

/** One row of the field table, flattened out of a Field definition for display. */
export interface FieldRow {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly defaultValue?: string;
  /** Target Collection of a relation Field, absent on a scalar one. */
  readonly target?: string;
  readonly foreignKey?: string;
}

/**
 * Flattens a resolved Collection into the rows the field table renders.
 *
 * Key membership comes from the Collection's constraints rather than from each
 * Field. A resolved Field does not carry `primaryKey`: the resolver reports an
 * auto-incrementing identifier as `{ type: 'integer', autoIncrement: true }`
 * and records the key itself as a `primary` constraint, which is also the only
 * representation a composite key has.
 */
export function describeFields(
  collection: CollectionDefinition,
): readonly FieldRow[] {
  const primary = constraintFields(collection, 'primary');
  const unique = constraintFields(collection, 'unique');
  return (collection.fields ?? []).map((field) =>
    describeField(field, primary, unique),
  );
}

export function describeField(
  field: CollectionField,
  primaryKeyFields: ReadonlySet<string> = new Set(),
  uniqueFields: ReadonlySet<string> = new Set(),
): FieldRow {
  const candidate = field as Partial<Record<'target' | 'foreignKey', unknown>>;
  const primaryKey =
    (field.primaryKey ?? false) || primaryKeyFields.has(field.name);
  return {
    name: field.name,
    type: field.type,
    // A Field is nullable unless it says otherwise, and a key never is.
    nullable: field.nullable ?? !primaryKey,
    primaryKey,
    unique: (field.unique ?? false) || uniqueFields.has(field.name),
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: formatDefault(field.defaultValue) }),
    ...(typeof candidate.target === 'string'
      ? { target: candidate.target }
      : {}),
    ...(typeof candidate.foreignKey === 'string'
      ? { foreignKey: candidate.foreignKey }
      : {}),
  };
}

/** Renders a relation Field's target, including the key it joins on when one is declared. */
export function describeTarget(field: FieldRow): string {
  if (field.target === undefined) return '';
  return field.foreignKey === undefined
    ? field.target
    : `${field.target} (${field.foreignKey})`;
}

export function physicalColumns(
  detail: PhysicalCollectionDetail,
): readonly PhysicalColumn[] {
  return [...detail.schema.physical.columns].sort(
    (left, right) => left.ordinalPosition - right.ordinalPosition,
  );
}

function constraintFields(
  collection: CollectionDefinition,
  type: 'primary' | 'unique',
): ReadonlySet<string> {
  const names = (collection.constraints ?? [])
    .filter((constraint) => constraint.type === type)
    .flatMap((constraint) =>
      'fields' in constraint ? (constraint.fields ?? []) : [],
    );
  return new Set(names);
}

function formatDefault(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}
