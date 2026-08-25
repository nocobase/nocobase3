import type { SpaRuntimeGlobals } from '@nocobase/app-runtime/spa';

export interface PortalSpaRuntimeConfig {
  appBasePath: string;
  apiUrl: string;
  storagePrefix?: string;
  storageType?: string;
  shareToken?: boolean;
}

export function createPortalSpaRuntimeGlobals(
  config: PortalSpaRuntimeConfig,
): SpaRuntimeGlobals {
  return {
    NOCOBASE_PORTAL_BASE: toBrowserBasePath(config.appBasePath),
    NOCOBASE_API_URL: config.apiUrl,
    __nocobase_api_client_storage_prefix__:
      config.storagePrefix?.trim() || 'NOCOBASE_',
    __nocobase_api_client_storage_type__:
      config.storageType?.trim() || 'localStorage',
    __nocobase_api_client_share_token__: config.shareToken ?? false,
  };
}

function toBrowserBasePath(value: string): string {
  return value ? `${value.replace(/\/+$/, '')}/` : '/';
}
