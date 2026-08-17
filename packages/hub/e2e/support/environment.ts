import {
  normalizePortalBase,
  resolveNocoBaseAppName,
  resolveNocoBasePortalName,
} from "@nocobase/portal-sdk/runtime";

export type PortalE2EStorageType = "localStorage" | "sessionStorage";

export type PortalE2EEnvironment = {
  origin: string;
  port: number;
  baseURL: string;
  apiURL: string;
  portalBase: string;
  portalName?: string;
  appName: string;
  authenticator: string;
  role?: string;
  locale?: string;
  storagePrefix: string;
  storageType: PortalE2EStorageType;
  shareToken: boolean;
};

export type PortalE2ECredentials = {
  account: string;
  password: string;
  authenticator: string;
  role?: string;
};

type EnvironmentSource = Record<string, string | undefined>;

const readValue = (source: EnvironmentSource, name: string) => {
  const value = source[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const resolvePort = (source: EnvironmentSource) => {
  const configured = readValue(source, "NOCOBASE_E2E_PORT");
  if (!configured) return 4173;
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("NOCOBASE_E2E_PORT must be a valid TCP port.");
  }
  return port;
};

const resolveApiURL = (value: string | undefined, baseURL: string) => {
  if (!value) return new URL("/api", baseURL).toString().replace(/\/$/, "");
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return new URL(`/${value.replace(/^\/+|\/+$/g, "")}`, baseURL)
    .toString()
    .replace(/\/$/, "");
};

const parseBoolean = (value?: string) => /^true$/i.test(value ?? "");

export function loadPortalE2EEnvironment(
  source: EnvironmentSource = process.env
): PortalE2EEnvironment {
  const port = resolvePort(source);
  const origin = `http://127.0.0.1:${port}`;
  const portalBase = normalizePortalBase(
    readValue(source, "NOCOBASE_PORTAL_BASE")
  );
  const baseURL = new URL(portalBase, `${origin}/`).toString();
  const apiURL = resolveApiURL(
    readValue(source, "NOCOBASE_E2E_API_URL") ??
      readValue(source, "NOCOBASE_API_URL"),
    baseURL
  );
  const storageTypeValue = readValue(source, "API_CLIENT_STORAGE_TYPE");

  return {
    origin,
    port,
    baseURL,
    apiURL,
    portalBase,
    portalName:
      readValue(source, "NOCOBASE_E2E_PORTAL") ??
      resolveNocoBasePortalName(portalBase),
    appName: resolveNocoBaseAppName(portalBase, apiURL),
    authenticator:
      readValue(source, "NOCOBASE_E2E_AUTHENTICATOR") ??
      readValue(source, "NOCOBASE_AUTHENTICATOR") ??
      "basic",
    role: readValue(source, "NOCOBASE_E2E_ROLE"),
    locale: readValue(source, "NOCOBASE_E2E_LOCALE"),
    storagePrefix:
      readValue(source, "API_CLIENT_STORAGE_PREFIX") ?? "NOCOBASE_",
    storageType:
      storageTypeValue === "sessionStorage" ? "sessionStorage" : "localStorage",
    shareToken: parseBoolean(readValue(source, "API_CLIENT_SHARE_TOKEN")),
  };
}

export function requirePortalE2ECredentials(
  environment: PortalE2EEnvironment,
  source: EnvironmentSource = process.env
): PortalE2ECredentials {
  const account = readValue(source, "NOCOBASE_E2E_ACCOUNT");
  const password = source.NOCOBASE_E2E_PASSWORD;

  if (!account || typeof password !== "string" || !password.trim()) {
    throw new Error(
      "NOCOBASE_E2E_ACCOUNT and NOCOBASE_E2E_PASSWORD are required for the login E2E test. Copy .env.e2e.example to .env.e2e and provide test credentials."
    );
  }

  return {
    account,
    password,
    authenticator: environment.authenticator,
    role: environment.role,
  };
}

export function resolvePortalTestURL(
  environment: Pick<PortalE2EEnvironment, "baseURL">,
  path = "/"
) {
  const relativePath = path.replace(/^\/+/, "");
  return new URL(relativePath, environment.baseURL).toString();
}

export function resolvePortalApiActionURL(
  environment: Pick<PortalE2EEnvironment, "apiURL">,
  resource: string,
  action: string
) {
  return `${environment.apiURL.replace(/\/$/, "")}/${resource}:${action}`;
}
