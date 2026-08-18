import { getRuntimeApiUrl } from "./config.ts";

const rawApiUrl =
  getRuntimeApiUrl() ?? "http://127.0.0.1:13000/api";

const getDefaultProxyTarget = (apiUrl?: string): string | undefined => {
  if (!apiUrl || apiUrl.startsWith("/")) return undefined;

  try {
    return new URL(apiUrl).origin;
  } catch {
    return undefined;
  }
};

export const API_URL: string = rawApiUrl;
export const API_ORIGIN: string | undefined = getDefaultProxyTarget(rawApiUrl);
export const NOCOBASE_AUTHENTICATOR: string =
  import.meta.env?.NOCOBASE_AUTHENTICATOR ?? "basic";
