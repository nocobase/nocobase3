export function resolvePortalBase(
  configured: unknown,
  fallback: unknown,
): string {
  const normalized =
    typeof configured === 'string' && configured.trim()
      ? configured.trim()
      : typeof fallback === 'string'
        ? fallback.trim()
        : '';
  if (!normalized || normalized === '/') return '';
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}
