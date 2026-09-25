// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PermissionSetAssignment,
  SubjectTypeOption,
} from '../../client/authorization-client.js';
const api = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  revision: () => 0,
  onInvalidated: vi.fn(() => () => {}),
  resolveSubjects: vi.fn(),
  listSubjectMembers: vi.fn(),
}));
vi.mock('../../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => api,
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('../helpers/locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { Assignments } from '../../client/pages/permission-sets/assignments-tab.js';
import en from '../../client/locales/en-US.js';
import { translate } from '../helpers/locale-harness.js';

const types: readonly SubjectTypeOption[] = [
  { value: 'user', label: 'Users', selection: { type: 'collection' } },
  {
    value: 'department',
    label: 'Departments',
    selection: { type: 'collection' },
    members: true,
    manage: true,
  },
  { value: 'project', label: 'Projects', selection: { type: 'collection' } },
];
const assignments: readonly PermissionSetAssignment[] = [
  { id: 'a1', permissionSet: 'sales', subject: { type: 'user', id: 'alice' } },
  {
    id: 'a2',
    permissionSet: 'sales',
    subject: { type: 'department', id: 'east' },
  },
  {
    id: 'a3',
    permissionSet: 'sales',
    subject: { type: 'project', id: 'apollo' },
  },
];
const titles: Record<string, string> = {
  alice: 'Alice',
  east: 'East region',
  apollo: 'Apollo',
};

function Location() {
  const location = useLocation();
  return (
    <output data-testid='location'>
      {location.pathname}
      {location.search}
    </output>
  );
}

function mount() {
  render(
    <MemoryRouter initialEntries={['/sets']}>
      <Location />
      <Routes>
        <Route
          path='*'
          element={
            <Assignments
              assignments={assignments}
              canAssign
              canRevoke
              busy={false}
              subjectTypes={types}
              onAssign={() => Promise.resolve()}
              onRevoke={() => Promise.resolve()}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const row = (name: string) =>
  screen.getByRole('cell', { name }).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  api.can.mockResolvedValue(true);
  api.resolveSubjects.mockImplementation(
    (_settings: string, type: string, ids: readonly string[]) =>
      Promise.resolve(
        ids.map((id) => ({
          id,
          title: titles[id] ?? id,
          ...(type === 'department' ? { manage: `/settings/org/${id}` } : {}),
        })),
      ),
  );
  api.listSubjectMembers.mockImplementation(
    (
      _settings: string,
      _type: string,
      _id: string,
      query: { search?: string; page: number },
    ) =>
      Promise.resolve(
        query.search === 'nobody'
          ? { items: [], total: 0 }
          : {
              items: [
                {
                  id: `member-${query.page}`,
                  title: `Member ${query.page}`,
                  description: 'East region',
                },
              ],
              total: 45,
            },
      ),
  );
});

describe('subject members on the assignments tab', () => {
  it('offers members and manage only where the subject type provides them', async () => {
    mount();
    await screen.findByRole('cell', { name: 'East region' });
    const department = within(row('East region'));
    expect(
      department.getByRole('button', {
        name: translate('members.openNamed', { label: 'East region' }),
      }),
    ).toBeInTheDocument();
    expect(
      department.getByRole('link', {
        name: translate('members.manageNamed', { label: 'East region' }),
      }),
    ).toHaveAttribute('href', '/settings/org/east');
    for (const name of ['Alice', 'Apollo']) {
      const plain = within(row(name));
      expect(
        plain.queryByRole('button', { name: /Members/ }),
      ).not.toBeInTheDocument();
      expect(plain.queryByRole('link')).not.toBeInTheDocument();
      expect(
        plain.getByRole('button', {
          name: en.permissionSets.assignments.revoke,
        }),
      ).toBeInTheDocument();
    }
  });

  it('lists members read-only with search, paging, an empty state and inspector links', async () => {
    mount();
    await screen.findByRole('cell', { name: 'East region' });
    fireEvent.click(
      within(row('East region')).getByRole('button', {
        name: translate('members.openNamed', { label: 'East region' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('East region · Departments'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: en.members.manage }),
    ).toHaveAttribute('href', '/settings/org/east');
    expect(await within(dialog).findByText('Member 1')).toBeInTheDocument();
    expect(api.listSubjectMembers).toHaveBeenLastCalledWith(
      'permission-sets',
      'department',
      'east',
      { page: 1, pageSize: 30 },
    );
    const inspect = await within(dialog).findByRole('link', {
      name: translate('members.inspectNamed', { label: 'Member 1' }),
    });
    expect(inspect).toHaveAttribute(
      'href',
      '/settings/authorization/inspector?subjectType=user&subjectId=member-1',
    );

    fireEvent.click(
      within(dialog).getByRole('button', { name: en.subjects.next }),
    );
    expect(await within(dialog).findByText('Member 2')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: en.subjects.next }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole('link', {
        name: translate('members.inspectNamed', { label: 'Member 2' }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/settings/authorization/inspector?subjectType=user&subjectId=member-2',
      ),
    );

    fireEvent.change(
      within(dialog).getByRole('textbox', { name: en.members.search }),
      { target: { value: 'nobody' } },
    );
    expect(
      await within(dialog).findByText(en.members.emptyFiltered),
    ).toBeInTheDocument();
    expect(api.listSubjectMembers).toHaveBeenLastCalledWith(
      'permission-sets',
      'department',
      'east',
      { search: 'nobody', page: 1, pageSize: 30 },
    );
  });

  it('hides the inspector link without the inspect permission and reports a failure', async () => {
    api.can.mockImplementation(async (check: unknown) =>
      JSON.stringify(check).includes('inspect') ? false : true,
    );
    api.listSubjectMembers.mockRejectedValueOnce(
      new Error('Directory offline'),
    );
    mount();
    await screen.findByRole('cell', { name: 'East region' });
    fireEvent.click(
      within(row('East region')).getByRole('button', {
        name: translate('members.openNamed', { label: 'East region' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Directory offline'),
    ).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: en.members.search }),
      { target: { value: 'mem' } },
    );
    expect(await within(dialog).findByText('Member 1')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('link', { name: /Inspect/ }),
    ).not.toBeInTheDocument();
  });
});
