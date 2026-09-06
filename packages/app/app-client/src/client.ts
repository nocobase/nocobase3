/**
 * The path the application is mounted at, always with a leading and a trailing slash: `/main/` for an application
 * served from `/main`, and `/` for one served from the origin root.
 *
 * The server injects `window.APP_BASE_PATH` at runtime; `import.meta.env.BASE_URL` is what the bundler knows at build
 * time and covers the development server, where nothing is injected.
 */
export function resolveAppBase(): string {
  const trimmed = readAppBasePath().replace(/^\/+|\/+$/gu, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export function resolveAppUrl(path: string = '/'): string {
  if (typeof window === 'undefined') {
    return path;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    return path;
  }
  const url = new URL(
    path.replace(/^\/+/, ''),
    `${window.location.origin}${resolveAppBase()}`,
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

function readAppBasePath(): string {
  const runtime =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { APP_BASE_PATH?: unknown });
  if (typeof runtime?.APP_BASE_PATH === 'string') {
    return runtime.APP_BASE_PATH;
  }
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: { BASE_URL?: string };
    }
  ).env;
  return viteEnv?.BASE_URL ?? '/';
}
