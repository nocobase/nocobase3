// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { expect, it, vi } from 'vitest';
import { useAuthorizationPageData } from '../client/pages/page-support.js';
import { useSubjectNames } from '../client/components/use-subject-names.js';
import { localizeOptions } from '../client/components/localized-options.js';
import type {
  AuthorizationOptions,
  LocalizedText,
} from '../client/authorization-client.js';
import locales from '../client/locales/index.js';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

const mocks = vi.hoisted(() => ({
  loadOptions: vi.fn(),
  resolveSubjects: vi.fn(),
}));
vi.mock('../client/runtime.js', () => ({
  getAuthorizationClient: () => mocks,
}));

it('switches option labels and fixed subjects without refetching or losing edits', async () => {
  mocks.loadOptions.mockResolvedValue({
    plugins: [],
    resourceTypes: [],
    collections: [],
    recordAccessPolicies: [],
    subjectTypes: [
      {
        value: 'authenticated',
        label: {
          key: 'options.subjectTypes.authenticated',
          ns: AUTHORIZATION_NAMESPACE,
        },
        selection: { type: 'fixed', id: '*' },
      },
      {
        value: 'user',
        label: {
          key: 'options.subjectTypes.user',
          ns: AUTHORIZATION_NAMESPACE,
        },
        selection: { type: 'collection' },
      },
    ],
  });
  mocks.resolveSubjects.mockResolvedValue([{ id: '1', title: 'Alice' }]);
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
  });
  runtime.registerNamespace(AUTHORIZATION_NAMESPACE, locales);
  await runtime.init();
  function Page() {
    const { options } = useAuthorizationPageData('authz/sharing-rules/options');
    const [draft, setDraft] = useState('');
    const names = useSubjectNames(
      'sharing-rules',
      options?.subjectTypes ?? [],
      [{ type: 'user', id: '1' }],
    );
    return (
      <>
        <input
          aria-label='draft'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p>{options?.subjectTypes[1]?.label}</p>
        {Object.entries(names).map(([key, name]) => (
          <p key={key}>{name}</p>
        ))}
      </>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <Page />
    </I18nProvider>,
  );
  await screen.findByText('All signed-in users');
  await screen.findByText('Alice');
  fireEvent.change(screen.getByLabelText('draft'), {
    target: { value: 'Unsaved' },
  });
  await act(() => runtime.changeLanguage('zh-CN'));
  await screen.findByText('所有已登录用户');
  await waitFor(() =>
    expect(screen.queryByText('All signed-in users')).toBeNull(),
  );
  expect(screen.getByLabelText('draft')).toHaveValue('Unsaved');
  expect(mocks.loadOptions).toHaveBeenCalledTimes(1);
  expect(mocks.resolveSubjects).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Alice')).toBeInTheDocument();
});

it('resolves nested groups and plugin namespaces while preserving literal names and fallbacks', () => {
  const descriptor = {
    key: 'resourceTitle',
    ns: '@example/plugin',
    defaultValue: 'Fallback',
  };
  const raw: AuthorizationOptions<LocalizedText> = {
    plugins: [],
    collections: [],
    subjectTypes: [],
    recordAccessPolicies: [
      { value: 'custom', label: 'Custom', description: descriptor },
    ],
    resourceTypes: [
      {
        value: 'settings',
        label: descriptor,
        actions: [{ value: 'read', label: descriptor }],
        resources: [
          { value: 'literal', label: 'resourceTitle', description: descriptor },
        ],
        groups: [
          {
            value: 'parent',
            label: 'Parent',
            children: [{ value: 'child', label: descriptor }],
          },
        ],
      },
    ],
  };
  const t = vi.fn((_key: string, options?: Readonly<Record<string, unknown>>) =>
    String(options?.defaultValue),
  );
  const result = localizeOptions(raw, t);
  expect(result.resourceTypes[0]?.groups?.[0]?.children?.[0]?.label).toBe(
    'Fallback',
  );
  expect(result.resourceTypes[0]?.resources[0]?.label).toBe('resourceTitle');
  expect(result.recordAccessPolicies[0]?.description).toBe('Fallback');
  expect(t).toHaveBeenCalledWith('resourceTitle', {
    ns: '@example/plugin',
    defaultValue: 'Fallback',
  });
  expect(raw.resourceTypes[0]?.label).toBe(descriptor);
});
