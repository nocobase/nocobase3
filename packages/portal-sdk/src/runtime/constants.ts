import { getRuntimeApiUrl } from "./config.ts";

const rawApiUrl =
  getRuntimeApiUrl() ?? "http://127.0.0.1:13000/api";

const getDefaultProxyTarget = (apiUrl?: string) => {
  if (!apiUrl || apiUrl.startsWith("/")) return undefined;

  try {
    return new URL(apiUrl).origin;
  } catch {
    return undefined;
  }
};

export const API_URL = rawApiUrl;
export const API_ORIGIN = getDefaultProxyTarget(rawApiUrl);
export const NOCOBASE_AUTHENTICATOR =
  import.meta.env?.NOCOBASE_AUTHENTICATOR ?? "basic";
