const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export function normalizeFileBasePath(basePath: string): string {
  const value = basePath.trim();
  if (
    !value ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\\') ||
    ABSOLUTE_URL_PATTERN.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 0x20)
  ) {
    throw new Error(
      'File basePath must be a relative App API path without a query or hash.',
    );
  }

  const segments = value.split('/').filter(Boolean);
  if (!segments.length || segments.some(isParentSegment)) {
    throw new Error('File basePath must not contain parent path segments.');
  }
  return segments.join('/');
}

function isParentSegment(segment: string): boolean {
  if (segment === '..') return true;
  try {
    return decodeURIComponent(segment) === '..';
  } catch {
    return true;
  }
}
