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
import type { AuthorizationOptionsResponse } from '../client/authorization-client.js';
import locales from '../client/locales/index.js';
import { AUTHORIZATION_NAMESPACE } from '../shared.js';

const mocks = vi.hoisted(() => ({
  loadOptions: vi.fn(),
  resolveSubjects: vi.fn(),
}));
vi.mock('../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => mocks,
}));

it('switches option labels and fixed subjects without refetching or losing edits', async () => {
  mocks.loadOptions.mockResolvedValue({
    sections: [],
    collections: [],
    recordAccess: [],
    subjectTypes: [
      {
        type: 'authenticated',
        title: {
          key: 'options.subjectTypes.authenticated',
          ns: AUTHORIZATION_NAMESPACE,
        },
        selection: { type: 'fixed', id: '*' },
      },
      {
        type: 'user',
        title: {
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
    const { options } = useAuthorizationPageData('sharing-rules');
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

it('resolves groups, sections, subsections and plugin namespaces while preserving literal names and fallbacks', () => {
  const descriptor = {
    key: 'resourceTitle',
    ns: '@example/plugin',
    defaultValue: 'Fallback',
  };
  const raw: AuthorizationOptionsResponse = {
    sections: [
      {
        name: 'administration',
        title: {
          key: 'sections.administration',
          ns: AUTHORIZATION_NAMESPACE,
        },
        order: 200,
        subsections: [
          {
            name: 'administration.other',
            title: { key: 'sections.other', ns: AUTHORIZATION_NAMESPACE },
            resources: [
              {
                type: 'settings',
                id: 'literal',
                title: 'resourceTitle',
                description: descriptor,
                group: 'child',
                actions: [{ name: 'read', title: descriptor }],
              },
              {
                type: 'settings',
                id: 'first',
                title: 'First',
                group: 'late',
                actions: [],
              },
              { type: 'settings', id: 'loose', title: 'Loose', actions: [] },
            ],
          },
        ],
      },
      {
        name: 'pages',
        title: 'Pages',
        order: 0,
        subsections: [
          {
            name: 'page',
            title: 'Pages',
            recordType: {
              type: 'page',
              actions: [{ name: 'access', title: 'Access' }],
            },
            resources: [],
          },
        ],
      },
    ],
    resourceGroups: [
      { name: 'parent', title: 'Parent' },
      { name: 'late', title: 'Late', parent: 'parent', order: 10 },
      { name: 'child', title: descriptor, parent: 'parent' },
      { name: 'unused', title: 'Unused' },
    ],
    collections: [],
    subjectTypes: [],
    recordAccess: [
      {
        key: 'custom',
        title: 'Custom',
        description: descriptor,
        collections: [],
      },
    ],
  };
  const t = vi.fn((_key: string, options?: Readonly<Record<string, unknown>>) =>
    String(options?.defaultValue),
  );
  const result = localizeOptions(raw, t);
  const other = result.sections[1]?.subsections[0];
  expect(other?.label).toBe('sections.other');
  // Groups nest under their parent, by order then registration; unused ones drop.
  expect(other?.groups).toEqual([
    {
      value: 'parent',
      label: 'Parent',
      children: [
        { value: 'child', label: 'Fallback' },
        { value: 'late', label: 'Late' },
      ],
    },
  ]);
  // Ungrouped resources first, then each group's in tree order.
  expect(other?.resources.map((item) => item.value)).toEqual([
    'loose',
    'literal',
    'first',
  ]);
  expect(other?.resources[1]).toMatchObject({
    type: 'settings',
    label: 'resourceTitle',
    description: 'Fallback',
  });
  expect(other?.actions).toEqual([{ value: 'read', label: 'Fallback' }]);
  expect(result.sections[0]?.subsections[0]).toEqual({
    value: 'page',
    label: 'Pages',
    recordType: 'page',
    actions: [{ value: 'access', label: 'Access' }],
    groups: [],
    resources: [],
  });
  expect(result.recordAccess[0]?.description).toBe('Fallback');
  expect(result.sections.map((section) => section.value)).toEqual([
    'pages',
    'administration',
  ]);
  // Section titles are catalogued in this plugin's namespace.
  expect(t).toHaveBeenCalledWith('sections.administration', {
    ns: AUTHORIZATION_NAMESPACE,
    defaultValue: 'sections.administration',
  });
  expect(t).toHaveBeenCalledWith('resourceTitle', {
    ns: '@example/plugin',
    defaultValue: 'Fallback',
  });
  expect(raw.sections[0]?.subsections[0]?.resources[0]?.description).toBe(
    descriptor,
  );
});
