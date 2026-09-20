// @vitest-environment jsdom
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { listLLMServices } from '../client/llm-service-service.js';
import LLMServicePage from '../client/pages/llm-service-page.js';

const api = {};
vi.mock('@nocobase/app-client', () => ({
  apiClientToken: {},
  createApiClient: () => ({}),
  resolveAppUrl: (path: string) => path,
  useService: () => api,
  useApiClient: () => api,
}));
vi.mock('../client/llm-service-service.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listLLMServices: vi.fn(),
  listLLMProviders: async () => [],
}));

beforeEach(() => {
  vi.mocked(listLLMServices).mockReset();
});

async function renderPage() {
  const runtime = new I18nRuntime({
    applicationNamespace: 'app',
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerApplicationNamespace('app', {
    'en-US': async () => ({ default: {} }),
  });
  runtime.registerNamespace('@nocobase/app-plugin-ai-employee', locales);
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <LLMServicePage />
    </I18nProvider>,
  );
  return runtime;
}

it('shows loading before the localized empty state spanning all columns', async () => {
  let resolve!: (value: []) => void;
  vi.mocked(listLLMServices).mockReturnValue(
    new Promise<[]>((done) => {
      resolve = done;
    }),
  );
  const runtime = await renderPage();
  expect(screen.getByText('Loading…')).toBeVisible();
  expect(
    screen.queryByText('No LLM services configured.'),
  ).not.toBeInTheDocument();
  await act(async () => resolve([]));
  expect(
    screen.getByRole('cell', { name: 'No LLM services configured.' }),
  ).toHaveAttribute('colspan', '6');
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(screen.getByText('暂无 LLM 服务配置。')).toBeVisible();
});

it('does not treat a failed request as an empty configuration', async () => {
  vi.mocked(listLLMServices).mockRejectedValue(new Error('Request failed'));
  await renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  await waitFor(() =>
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByText('No LLM services configured.'),
  ).not.toBeInTheDocument();
});

it('renders configured services without an empty state', async () => {
  vi.mocked(listLLMServices).mockResolvedValue([
    {
      name: 'test-service',
      title: 'Test service',
      provider: 'openai',
      enabled: true,
    },
  ]);
  await renderPage();
  expect(await screen.findByText('Test service')).toBeVisible();
  expect(
    screen.queryByText('No LLM services configured.'),
  ).not.toBeInTheDocument();
});
