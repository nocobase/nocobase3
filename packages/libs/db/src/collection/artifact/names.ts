export type CollectionArtifactNameErrorCode =
  'COLLECTION_ARTIFACT_NAME_INVALID' | 'COLLECTION_ARTIFACT_NAME_CONFLICT';

export class CollectionArtifactNameError extends Error {
  constructor(
    readonly code: CollectionArtifactNameErrorCode,
    message: string,
    readonly names: readonly string[],
  ) {
    super(message);
    this.name = 'CollectionArtifactNameError';
  }
}

// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;
const WINDOWS_INVALID_CHARACTERS = /[<>:"|?*]/;
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/**
 * A logical Collection name has to survive as a directory name on every
 * platform a repository is checked out on. `@nocobase/db` only requires the
 * name to be non-empty without surrounding whitespace, so the artifact layer
 * adds what file systems demand.
 */
export function validateCollectionArtifactDirectoryName(name: string): void {
  const reject = (reason: string): never => {
    throw new CollectionArtifactNameError(
      'COLLECTION_ARTIFACT_NAME_INVALID',
      `Collection name ${JSON.stringify(name)} cannot be used as an artifact directory: ${reason}.`,
      [name],
    );
  };
  if (typeof name !== 'string' || name.length === 0) reject('it is empty');
  if (name === '.' || name === '..') reject('it is a relative path segment');
  if (name.includes('/') || name.includes('\\'))
    reject('it contains a path separator');
  if (name.startsWith('.')) reject('it starts with a dot');
  if (name.startsWith('_'))
    reject('the underscore prefix is reserved for connection-level files');
  if (name !== name.trim()) reject('it has surrounding whitespace');
  if (name.endsWith('.')) reject('it ends with a dot');
  if (CONTROL_CHARACTERS.test(name)) reject('it contains control characters');
  if (WINDOWS_INVALID_CHARACTERS.test(name))
    reject('it contains a character Windows forbids in file names');
  if (WINDOWS_RESERVED_NAMES.has(name.toLowerCase()))
    reject('it is a reserved device name on Windows');
}

/**
 * Two names that differ only by case land in one directory on the default
 * file systems of macOS and Windows. Report every such group at once so the
 * caller can fix them together rather than one per run.
 */
export function findCollectionArtifactNameConflicts(
  names: readonly string[],
): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = name.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(name);
    else groups.set(key, [name]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => [...group].sort());
}

export function assertCollectionArtifactDirectoryNames(
  names: readonly string[],
): void {
  for (const name of names) validateCollectionArtifactDirectoryName(name);
  const conflicts = findCollectionArtifactNameConflicts(names);
  if (conflicts.length > 0) {
    throw new CollectionArtifactNameError(
      'COLLECTION_ARTIFACT_NAME_CONFLICT',
      `Collection names differ only by case and would share one directory on a case-insensitive file system: ${conflicts
        .map((group) => group.join(' / '))
        .join('; ')}.`,
      conflicts.flat(),
    );
  }
}
