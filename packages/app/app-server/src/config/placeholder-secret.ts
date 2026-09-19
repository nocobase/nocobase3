/**
 * The value `config.example.yml` ships for every secret it declares.
 *
 * The example carries live keys rather than commented-out ones, so that `@nocobase/create-app` can fill them in by
 * replacing a value instead of by uncommenting a line. That makes one thing possible that a commented placeholder did
 * not: a `config.yml` copied from the example by hand starts with a secret that is present, non-empty, identical
 * across every installation, and published in this repository. Nothing downstream can tell it apart from a real one,
 * so it is rejected here instead.
 */
export const PLACEHOLDER_SECRET = 'replace-with-a-unique-secret';

export function isPlaceholderSecret(value: string | undefined): boolean {
  return value?.trim() === PLACEHOLDER_SECRET;
}

/**
 * Rejects a secret still left at the example's placeholder.
 *
 * `key` names the setting as it is written in configuration, such as `auth.secret`, because that is what the reader
 * has to go and change.
 */
export function assertSecretIsNotPlaceholder(
  value: string | undefined,
  key: string,
): void {
  if (!isPlaceholderSecret(value)) {
    return;
  }

  throw new Error(
    `${key} is still set to the placeholder from config.example.yml. Replace it with a unique value, for example one generated with: openssl rand -hex 32`,
  );
}
