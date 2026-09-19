import type { PhysicalCollectionSummary } from '../types.js';

export interface PhysicalCollectionCursorFilter {
  readonly schemas?: readonly string[];
  readonly tableNamePrefixes?: readonly string[];
  readonly kinds?: readonly string[];
}

export interface DecodedPhysicalCollectionCursor {
  readonly after: Pick<PhysicalCollectionSummary, 'schema' | 'tableName'>;
  readonly filter: PhysicalCollectionCursorFilter;
}

interface StoredPhysicalCollectionCursor extends DecodedPhysicalCollectionCursor {
  readonly version: 1;
}

export function encodePhysicalCollectionCursor(
  cursor: DecodedPhysicalCollectionCursor,
): string {
  const stored: StoredPhysicalCollectionCursor = { version: 1, ...cursor };
  return Buffer.from(JSON.stringify(stored)).toString('base64url');
}

export function decodePhysicalCollectionCursor(
  cursor: string,
): DecodedPhysicalCollectionCursor | undefined {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<StoredPhysicalCollectionCursor>;
    if (
      parsed.version !== 1 ||
      !parsed.after ||
      !nonEmptyString(parsed.after.schema) ||
      !nonEmptyString(parsed.after.tableName) ||
      !parsed.filter ||
      typeof parsed.filter !== 'object' ||
      !optionalStringArray(parsed.filter.schemas, false) ||
      !optionalStringArray(parsed.filter.tableNamePrefixes, true) ||
      !optionalStringArray(parsed.filter.kinds, false)
    ) {
      return undefined;
    }
    return {
      after: parsed.after,
      filter: parsed.filter,
    };
  } catch {
    return undefined;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function optionalStringArray(value: unknown, allowEmpty: boolean): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (item) =>
          typeof item === 'string' && (allowEmpty || item.trim() !== ''),
      ))
  );
}

export function sameCursorFilter(
  left: PhysicalCollectionCursorFilter,
  right: PhysicalCollectionCursorFilter,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
