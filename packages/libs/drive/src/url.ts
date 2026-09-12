export function joinDriveUrl(baseUrl: string, key: string): string {
  const encodedKey = encodeDriveKey(key);

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(baseUrl)) {
    return new URL(encodedKey, ensureTrailingSlash(baseUrl)).toString();
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}/${encodedKey}`;
}

function encodeDriveKey(key: string): string {
  return key
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
