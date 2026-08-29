export function providerErrorCode(error: unknown): string | undefined {
  let current = error;
  const seen = new Set<object>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if (
      'code' in current &&
      (typeof current.code === 'string' || typeof current.code === 'number')
    )
      return String(current.code);
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}
