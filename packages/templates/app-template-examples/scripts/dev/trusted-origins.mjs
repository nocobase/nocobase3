/**
 * Better Auth appends these origins to configured trustedOrigins instead of
 * replacing the application's array. Only pass them to the local dev backend.
 * @param {string | undefined} existing
 * @param {number} port Actual allocated application server port.
 */
export function resolveDevTrustedOrigins(existing, port) {
  return [
    ...new Set([
      ...(existing ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ]),
  ].join(',');
}
