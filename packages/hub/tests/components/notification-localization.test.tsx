import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@nocobase/app-portal-sdk/i18n';

import { useNotificationProvider } from '@/components/notifications/use-notification-provider';
import '@/locales';
import { portalI18nReady } from '@/providers/i18n/runtime';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    dismiss: vi.fn(),
    error: toastError,
    success: vi.fn(),
  }),
}));

describe('Hub notification localization', () => {
  beforeEach(async () => {
    toastError.mockReset();
    await portalI18nReady;
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('does not expose the raw login error in Simplified Chinese', () => {
    useNotificationProvider().open?.({
      key: 'login-error',
      type: 'error',
      message: 'HubApiError',
      description: 'Username is invalid',
    });

    expect(toastError).toHaveBeenCalledWith('无法登录', {
      id: 'login-error',
      description: '用户名、邮箱或密码错误。',
      richColors: true,
    });
  });
});
