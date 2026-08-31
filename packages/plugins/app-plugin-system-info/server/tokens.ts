import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface SystemInfoService {
  getInfo(): SystemInfo;
}

export interface SystemInfo {
  readonly packageName: string;
  readonly version: string;
  readonly nodeVersion: string;
  readonly serverTime: string;
}

export const systemInfoServiceToken: ServiceToken<SystemInfoService> =
  createServiceToken<SystemInfoService>(
    '@nocobase/app-plugin-system-info/service',
  );
