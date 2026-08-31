import { I18nProvider } from '@nocobase/i18n/client';
import { I18nRuntime } from '@nocobase/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageSwitcher } from '@/shell/language-switcher';

const APP = '@nocobase/app-template-hub';

async function createRuntime(locales: string[]): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales,
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () =>
      Promise.resolve({ default: { actions: { language: 'Language' } } }),
    'zh-CN': () =>
      Promise.resolve({ default: { actions: { language: '语言' } } }),
  });
  await runtime.init('en-US');
  return runtime;
}

beforeEach(() => {
  // The switch tells the server which language to answer in; the interface must not depend on that succeeding.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
});

describe('LanguageSwitcher', () => {
  it('shows the current language by name rather than by locale code', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);

    render(
      <I18nProvider runtime={runtime}>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('English');
    expect(trigger).not.toHaveTextContent('en-US');
  });

  it('switches the language when another is chosen', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);
    const user = userEvent.setup();

    render(
      <I18nProvider runtime={runtime}>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: '中文' }));

    expect(runtime.getLocale()).toBe('zh-CN');
  });

  it('renders nothing when the application offers one language', async () => {
    const runtime = await createRuntime(['en-US']);

    const { container } = render(
      <I18nProvider runtime={runtime}>
        <LanguageSwitcher />
      </I18nProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
