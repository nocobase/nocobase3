export function resolveSafeFileUrl(
  value: string,
  trustedBlobUrls: ReadonlySet<string> = new Set(),
): string | undefined {
  const url = value.trim();
  if (!url) return undefined;
  if (trustedBlobUrls.has(url) && url.startsWith('blob:')) return url;
  try {
    const base =
      typeof window === 'undefined'
        ? 'http://localhost/'
        : window.location.href;
    const resolved = new URL(url, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

export function fileUrlCredentials(url: string): RequestCredentials {
  if (typeof window === 'undefined') return 'omit';
  return new URL(url, window.location.href).origin === window.location.origin
    ? 'include'
    : 'omit';
}

export function publicDownloadUrl(url: string): string | undefined {
  const safeUrl = resolveSafeFileUrl(url);
  if (!safeUrl) return undefined;
  if (typeof window === 'undefined') return safeUrl;
  const parsed = new URL(safeUrl, window.location.href);
  if (parsed.origin === window.location.origin) {
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  }
  return safeUrl;
}
