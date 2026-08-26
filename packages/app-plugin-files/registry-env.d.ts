interface ImportMeta {
  readonly env?: {
    readonly API_CLIENT_SHARE_TOKEN?: string;
    readonly API_CLIENT_STORAGE_PREFIX?: string;
    readonly API_CLIENT_STORAGE_TYPE?: string;
    readonly BASE_URL?: string;
    readonly NOCOBASE_API_URL?: string;
    readonly NOCOBASE_API_TOKEN?: string;
    readonly NOCOBASE_AUTHENTICATOR?: string;
    readonly NOCOBASE_WS_PATH?: string;
    readonly NOCOBASE_WS_URL?: string;
  };
}

interface Window {
  [key: string]: unknown;
}
