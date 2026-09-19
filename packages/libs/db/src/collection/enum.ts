import type { FieldDefinition } from './types.js';

/** V1 domains are bounded independently from physical character capacity. */
export function validateEnumMembers(
  values: unknown,
): asserts values is readonly string[] {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 256 ||
    [...values].some(
      (value) =>
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length > 255 ||
        /[\uD800-\uDFFF]/u.test(value) ||
        value.includes('\0'),
    ) ||
    new Set(values).size !== values.length
  )
    throw new Error(
      'Enum values must contain 1–256 distinct, non-empty, well-formed strings of at most 255 UTF-16 units without NUL.',
    );
}

export function validateEnumDefinition(field: FieldDefinition): void {
  if (field.type !== 'enum') {
    if (field.values !== undefined)
      throw new Error('Allowed values are only supported on enum Fields.');
    return;
  }
  validateEnumMembers(field.values);
  if (field.primaryKey || field.unique || field.autoIncrement)
    throw new Error(
      'V1 enum Fields cannot be identity or auto-increment Fields.',
    );
  if (
    field.length !== undefined &&
    (!Number.isSafeInteger(field.length) ||
      field.length < 1 ||
      field.length > 255 ||
      field.values.some((value) => value.length > field.length!))
  )
    throw new Error(
      'Enum length must accommodate every member and must not exceed 255.',
    );
  if (
    field.defaultValue !== undefined &&
    !(field.defaultValue === null && field.nullable !== false) &&
    !(
      typeof field.defaultValue === 'string' &&
      field.values.includes(field.defaultValue)
    )
  )
    throw new Error(
      'Enum default must be an allowed member, or null for a nullable Field.',
    );
  if (field.db?.nativeType)
    throw new Error('V1 enum creation does not accept native type overrides.');
}

export function assertEnumExpansion(
  previous: readonly string[] | undefined,
  next: readonly string[],
): void {
  if (previous?.some((value) => !next.includes(value)))
    throw new Error(
      'Removing or renaming enum members requires an explicit data migration; ordinary metadata updates may only add or reorder members.',
    );
}
