import { readStoredLocale } from '@nocobase/app-client';
import { I18nProvider } from '@nocobase/i18n/client';
import { I18nRuntime } from '@nocobase/i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { LanguageSwitcher } from '@/shell/language-switcher';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

const APP = '@nocobase/app-template-default';
const FALLBACK_NOTICE = '服务端不支持该语言，服务端内容已回落为英文。';
const CHANGE_FAILED_NOTICE = '未能完成语言切换，请重试。';
const fetchMock = vi.fn();

function createServerResponse(fallback = false): Response {
  return new Response(
    JSON.stringify({
      locale: fallback ? 'en-US' : 'zh-CN',
      requestedLocale: 'zh-CN',
      fallback,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

async function createRuntime(locales: string[]): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales,
    applicationNamespace: APP,
  });
  runtime.registerApplicationNamespace(APP, {
    'en-US': () =>
      Promise.resolve({
        default: {
          actions: { language: 'Language' },
          notices: {
            serverLocaleFallback:
              'The server does not support this language, so server messages will use English.',
            languageChangeFailed:
              'Unable to complete the language change. Please try again.',
          },
        },
      }),
    'zh-CN': () =>
      Promise.resolve({
        default: {
          actions: { language: '语言' },
          notices: {
            serverLocaleFallback: FALLBACK_NOTICE,
            languageChangeFailed: CHANGE_FAILED_NOTICE,
          },
        },
      }),
  });
  await runtime.init('en-US');
  return runtime;
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
  fetchMock.mockImplementation(() => Promise.resolve(createServerResponse()));
  vi.stubGlobal('fetch', fetchMock);
});

function renderMenu(runtime: I18nRuntime) {
  return render(
    <I18nProvider runtime={runtime}>
      <DropdownMenu>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <LanguageSwitcher />
        </DropdownMenuContent>
      </DropdownMenu>
    </I18nProvider>,
  );
}

describe('LanguageSwitcher', () => {
  it('shows the current language by name rather than by locale code', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);

    renderMenu(runtime);
    screen.getByRole('button', { name: 'Account' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    const trigger = await screen.findByRole('menuitem', {
      name: /Language\s*English/,
    });
    expect(trigger).toHaveTextContent('English');
    expect(trigger).not.toHaveTextContent('en-US');
    await userEvent.click(trigger);
    expect(
      await screen.findByRole('menuitemradio', { name: 'English' }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: '中文' }),
    ).not.toBeChecked();
  });

  it('switches the language when another is chosen', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);
    const user = userEvent.setup();

    renderMenu(runtime);
    screen.getByRole('button', { name: 'Account' }).focus();
    await userEvent.keyboard('{ArrowDown}');

    await user.click(
      await screen.findByRole('menuitem', { name: /Language\s*English/ }),
    );
    // jsdom has no submenu geometry for the pointer safe corridor.
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '中文' }));

    await waitFor(() => expect(runtime.getLocale()).toBe('zh-CN'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole('menuitem', { name: /语言\s*中文/ })).toBeVisible();
    expect(
      await screen.findByRole('menuitemradio', { name: '中文' }),
    ).toBeChecked();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the control pending and shows an informational notice when the server falls back', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    renderMenu(runtime);
    screen.getByRole('button', { name: 'Account' }).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(
      await screen.findByRole('menuitem', { name: /Language\s*English/ }),
    );
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '中文' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(runtime.getLocale()).toBe('zh-CN');
    expect(readStoredLocale()).toBe('zh-CN');
    expect(screen.getByRole('menuitemradio', { name: '中文' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    if (!resolveRequest) throw new Error('Locale request did not start.');
    resolveRequest(createServerResponse(true));

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(FALLBACK_NOTICE),
    );
    expect(
      screen.getByRole('menuitemradio', { name: '中文' }),
    ).not.toHaveAttribute('aria-disabled');
    expect(toast.error).not.toHaveBeenCalled();
    await user.keyboard('{Escape}{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Account' })).toHaveFocus(),
    );
  });

  it('keeps the interface language and reports a server synchronization failure', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));

    renderMenu(runtime);
    screen.getByRole('button', { name: 'Account' }).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(
      await screen.findByRole('menuitem', { name: /Language\s*English/ }),
    );
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '中文' }));

    await waitFor(() => expect(runtime.getLocale()).toBe('zh-CN'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(CHANGE_FAILED_NOTICE),
    );
    expect(readStoredLocale()).toBe('zh-CN');
    expect(toast.info).not.toHaveBeenCalled();
    await user.keyboard('{Escape}{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Account' })).toHaveFocus(),
    );
  });

  it('supports switching from the keyboard', async () => {
    const runtime = await createRuntime(['en-US', 'zh-CN']);
    const user = userEvent.setup();
    renderMenu(runtime);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(
        screen.getByRole('menuitem', { name: /Language\s*English/ }),
      ).toHaveFocus(),
    );
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(
        screen.getByRole('menuitemradio', { name: 'English' }),
      ).toHaveFocus(),
    );
    await user.keyboard('{ArrowDown}{Enter}');
    expect(runtime.getLocale()).toBe('zh-CN');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole('menuitemradio', { name: '中文' })).toBeChecked();
    await user.keyboard('{Escape}{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Account' })).toHaveFocus(),
    );
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
