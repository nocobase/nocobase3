function getUrlOrigin(value: string, baseUrl?: string) {
  try {
    return new URL(value, baseUrl).origin;
  } catch {
    return "";
  }
}

export function isNocoBaseManagedFileUrl(
  value: string,
  apiUrl: string,
  browserUrl?: string
) {
  if (!value || /^(blob|data):/i.test(value)) return false;
  if (!/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith("//")) {
    return true;
  }

  const apiOrigin = getUrlOrigin(apiUrl, browserUrl);
  return Boolean(apiOrigin && getUrlOrigin(value, browserUrl) === apiOrigin);
}
