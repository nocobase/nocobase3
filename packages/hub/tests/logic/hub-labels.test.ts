import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { i18n, translate } from '@nocobase/app-portal-sdk/i18n';

import {
  getHubAuditActionLabel,
  getHubAuditResourceLabel,
  getHubAuditSourceLabel,
  getHubCapabilityActionLabel,
  getHubCapabilityResourceLabel,
  getHubDeploymentFailureLabel,
  getHubEnvironmentLabel,
  getHubRoleLabel,
  getHubRoleScopeLabel,
} from '@/features/hub/labels';
import '@/locales';
import { portalI18nReady } from '@/providers/i18n/runtime';

describe('Hub dynamic labels', () => {
  beforeEach(async () => {
    await portalI18nReady;
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('localizes built-in roles and capabilities', () => {
    expect(getHubRoleLabel('Deployer', translate)).toBe('部署者');
    expect(getHubRoleScopeLabel('application', translate)).toBe('应用');
    expect(getHubCapabilityResourceLabel('hub.deployment', translate)).toBe(
      '部署',
    );
    expect(getHubCapabilityActionLabel('rollback', translate)).toBe('回滚');
  });

  it('localizes audit and environment values', () => {
    expect(getHubAuditActionLabel('deployment.succeeded', translate)).toBe(
      '部署成功',
    );
    expect(getHubAuditResourceLabel('deployment', translate)).toBe('部署');
    expect(getHubAuditSourceLabel('web', translate)).toBe('网页');
    expect(getHubEnvironmentLabel('default', translate)).toBe('默认环境');
  });

  it('replaces server failure messages with a localized explanation', () => {
    expect(
      getHubDeploymentFailureLabel(
        'READINESS_FAILED',
        'Health check failed',
        translate,
      ),
    ).toEqual({
      title: '就绪检查失败',
      message: '运行时就绪检查失败。',
    });
  });
});
