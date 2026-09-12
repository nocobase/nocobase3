import type {
  DatabaseActionGrant,
  DatabaseAuthorizationFieldRequest,
  DatabaseCollectionDefinition,
} from './model.js';

export interface ResolvedDatabaseFields {
  input: '*' | readonly string[];
  output: '*' | readonly string[];
}

export function resolveDatabaseFields(
  configs: readonly DatabaseActionGrant[],
): ResolvedDatabaseFields {
  return {
    input: unionFields(configs.map((config) => config.fields?.input)),
    output: unionFields(configs.map((config) => config.fields?.output)),
  };
}

export function databaseFieldsAllowed(
  requested: DatabaseAuthorizationFieldRequest | undefined,
  allowed: ResolvedDatabaseFields,
): boolean {
  const includes = (
    fields: readonly string[] | undefined,
    permitted: '*' | readonly string[],
  ): boolean =>
    fields === undefined ||
    permitted === '*' ||
    fields.every((field) => permitted.includes(field));
  return (
    includes(requested?.input, allowed.input) &&
    includes(requested?.output, allowed.output) &&
    includes(requested?.filter, allowed.output) &&
    includes(requested?.sort, allowed.output) &&
    includes(requested?.group, allowed.output)
  );
}

export function databaseCollectionFieldsKnown(
  collection: DatabaseCollectionDefinition,
  requested: DatabaseAuthorizationFieldRequest | undefined,
): boolean {
  const registered = new Set(collection.fields);
  return [
    requested?.input,
    requested?.output,
    requested?.filter,
    requested?.sort,
    requested?.group,
  ].every(
    (fields) =>
      fields === undefined || fields.every((field) => registered.has(field)),
  );
}

function unionFields(
  values: readonly ('*' | readonly string[] | undefined)[],
): '*' | readonly string[] {
  return values.includes('*')
    ? '*'
    : [...new Set(values.flatMap((value) => value ?? []))];
}
