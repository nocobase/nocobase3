interface ImportMetaEnv {
  readonly BASE_URL?: string;
  readonly DEV?: boolean;
  readonly NOCOBASE_API_URL?: string;
  readonly NOCOBASE_API_TOKEN?: string;
  readonly NOCOBASE_AUTHENTICATOR?: string;
  readonly NOCOBASE_WS_PATH?: string;
  readonly NOCOBASE_WS_URL?: string;
  readonly API_CLIENT_STORAGE_PREFIX?: string;
  readonly API_CLIENT_STORAGE_TYPE?: string;
  readonly API_CLIENT_SHARE_TOKEN?: string;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}

interface Window {
  NOCOBASE_PORTAL_BASE?: string;
  NOCOBASE_API_URL?: string;
  NOCOBASE_WS_PATH?: string;
  NOCOBASE_WS_URL?: string;
  __nocobase_api_client_storage_prefix__?: string;
  __nocobase_api_client_storage_type__?: string;
  __nocobase_api_client_share_token__?: boolean | string;
  __nocobase_ws_path__?: string;
  __nocobase_ws_url__?: string;
}
