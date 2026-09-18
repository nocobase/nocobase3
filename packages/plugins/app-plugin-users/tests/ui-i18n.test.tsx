// @vitest-environment jsdom
import { render, cleanup, act } from '@testing-library/react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { expect, it } from 'vitest';
import locales from '../client/locales/index.js';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../client/components/ui/dialog.js';

it('translates dialog controls in the plugin namespace', async () => {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-users', locales);
  await runtime.init('zh-CN');

  try {
    await act(async () =>
      render(
        <I18nProvider runtime={runtime}>
          <Dialog open>
            <DialogContent>
              <DialogTitle>Test</DialogTitle>
            </DialogContent>
          </Dialog>
        </I18nProvider>,
      ),
    );
    expect(document.querySelector('[aria-label="关闭"]')).not.toBeNull();
  } finally {
    cleanup();
  }
});
