import { describe, expect, it } from 'vitest';

import { presentReleaseControlError } from '../../client/features/apps/release-control-error';
import {
  appStateLabel,
  isAppDeployed,
} from '../../client/features/apps/presentation';
import type { AppReleaseOverview } from '@nocobase/hub-release-management/types';

describe('presentReleaseControlError', () => {
  it('separates authentication and authorization failures from App Host health', () => {
    expect(
      presentReleaseControlError('需要重新登录', 'RELEASE_AUTH_REQUIRED', 401)
        .kind,
    ).toBe('authentication');
    expect(
      presentReleaseControlError('需要管理员权限', 'RELEASE_FORBIDDEN', 403)
        .kind,
    ).toBe('authorization');
  });

  it('only reports an App Host outage for App Host connection errors', () => {
    expect(
      presentReleaseControlError(
        'connection refused',
        'APP_HOST_UNAVAILABLE',
        503,
      ).kind,
    ).toBe('app-host');
    expect(
      presentReleaseControlError(
        'release service unavailable',
        'RELEASE_AUTH_UNAVAILABLE',
        503,
      ).kind,
    ).toBe('control-plane');
  });
});

describe('App runtime presentation', () => {
  it('presents an idle App with an active Release as deployed and started on access', () => {
    const app = {
      id: 'crm',
      name: 'CRM',
      basePath: '/crm',
      accessUrl: '/crm/',
      activeReleaseId: 'release-v1',
      activeVersion: '1.0.0',
      state: 'idle',
      releases: [],
    } satisfies AppReleaseOverview;

    expect(isAppDeployed(app)).toBe(true);
    expect(appStateLabel(app.state)).toBe('已部署 · 访问时启动');
  });

  it('uses clear labels for other runtime states', () => {
    expect(appStateLabel('active')).toBe('运行中');
    expect(appStateLabel('not-deployed')).toBe('待部署');
    expect(appStateLabel('failed')).toBe('运行异常');
  });
});
