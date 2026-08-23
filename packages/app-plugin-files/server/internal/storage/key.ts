export function normalizeStorageKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\\')) {
    throw new Error('Invalid Files storage key.');
  }

  const segments = trimmed.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid Files storage key.');
  }

  return segments.join('/');
}
