import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface AppNoticeData {
  readonly description: string;
  readonly title: string;
  readonly tone: 'info' | 'success' | 'warning';
}

export interface AppNoticeService {
  getDefaultNotice(): AppNoticeData;
}

export const appNoticeServiceToken: ServiceToken<AppNoticeService> =
  createServiceToken<AppNoticeService>(
    '@nocobase/app-plugin-skills-example/service',
  );
