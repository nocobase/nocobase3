const getWindowValue = (key: "NOCOBASE_PORTAL_BASE" | "NOCOBASE_API_URL") => {
  if (typeof window === "undefined") return undefined;
  const value = window[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export const normalizePortalBase = (base?: string) => {
  const normalized = String(base || "/").trim();
  if (!normalized || normalized === "/") return "/";
  return `/${normalized.replace(/^\/+|\/+$/g, "")}/`;
};

export const getPortalBase = () =>
  normalizePortalBase(
    getWindowValue("NOCOBASE_PORTAL_BASE") ?? import.meta.env?.BASE_URL
  );

export const getRuntimeApiUrl = () =>
  getWindowValue("NOCOBASE_API_URL") ?? import.meta.env?.NOCOBASE_API_URL;

export const resolveNocoBasePortalName = (portalBase: string) =>
  portalBase.match(/\/x\/(?:apps\/[^/]+\/)?([^/?#]+)(?:[/?#]|$)/)?.[1];

export const getNocoBasePortalName = () =>
  resolveNocoBasePortalName(getPortalBase());

const getAppNameFromPortalBase = (base: string) =>
  base.match(/\/x\/apps\/([^/]+)(?:\/|$)/)?.[1];

const getAppNameFromApiUrl = (apiUrl?: string) =>
  apiUrl?.match(/\/api\/__app\/([^/?#]+)(?:[/?#]|$)/)?.[1];

export const resolveNocoBaseAppName = (portalBase: string, apiUrl?: string) =>
  getAppNameFromPortalBase(portalBase) ??
  getAppNameFromApiUrl(apiUrl) ??
  "main";

export const getNocoBaseAppName = () =>
  resolveNocoBaseAppName(getPortalBase(), getRuntimeApiUrl());

export const resolveNocoBaseServerUrl = (path = "/") => {
  if (typeof window === "undefined") return path;

  const apiUrl = new URL(
    getRuntimeApiUrl() || "/api",
    window.location.origin
  );
  const apiPathMatch = apiUrl.pathname.match(/\/api(?:\/|$)/);
  const serverBasePath = apiPathMatch
    ? apiUrl.pathname.slice(0, apiPathMatch.index)
    : "";

  return new URL(
    path.replace(/^\/+/, ""),
    `${apiUrl.origin}${serverBasePath}/`
  ).toString();
};

export const resolveNocoBaseSettingsUrl = () => {
  const appName = getNocoBaseAppName();
  const settingsPath =
    appName === "main"
      ? "/settings"
      : `/settings/apps/${encodeURIComponent(appName)}`;

  return resolveNocoBaseServerUrl(settingsPath);
};

export const resolvePortalUrl = (path = "/") => {
  if (typeof window === "undefined") return path;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;

  const portalBase = getPortalBase();
  const relativePath = path.replace(/^\/+/, "");
  const portalUrl = new URL(
    relativePath,
    `${window.location.origin}${portalBase}`
  );
  const apiUrl = new URL(
    getRuntimeApiUrl() || "/api",
    window.location.origin
  );

  // Same-origin deployments should use a root-relative callback. Besides
  // avoiding unnecessary origin coupling, this remains compatible with older
  // SSO plugins that only accept NocoBase-local redirect paths. A standalone
  // Portal dev server keeps the absolute URL so the callback can return to
  // Vite instead of the deployed Portal route.
  if (apiUrl.origin === portalUrl.origin) {
    return `${portalUrl.pathname}${portalUrl.search}${portalUrl.hash}`;
  }
  return portalUrl.toString();
};
