import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
}

const mocks = vi.hoisted(() => ({
  request: vi.fn<(options: RequestOptions) => Promise<unknown>>(),
  canUpdate: true,
}));

vi.mock('@nocobase/app-client', () => {
  const api = { request: mocks.request };
  class ApiClientError extends Error {
    public readonly status: number = 500;
  }
  return { useApiClient: () => api, ApiClientError };
});

vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({
    can: mocks.canUpdate,
    isPending: false,
    error: undefined,
    retry: vi.fn(),
  }),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import routes from '../../client/routes.js';
import DepartmentPage from '../../client/pages/settings/organization/department.js';
import OrganizationPage from '../../client/pages/settings/organization/index.js';

const DEPARTMENTS = [
  {
    id: 'hq',
    title: 'Headquarters',
    parentId: null,
    active: true,
    sortOrder: 0,
  },
  { id: 'sales', title: 'Sales', parentId: 'hq', active: true, sortOrder: 0 },
  { id: 'old', title: 'Archive', parentId: 'hq', active: false, sortOrder: 1 },
];

function respond(options: RequestOptions): Promise<unknown> {
  if (options.path === 'departments-example/departments' && !options.method)
    return Promise.resolve({ data: DEPARTMENTS });
  if (options.path === 'departments-example/departments/sales/members')
    return Promise.resolve({
      data: [
        {
          userId: 'u1',
          title: 'Alice',
          description: 'alice@example.test',
          primary: true,
        },
        { userId: 'u2', title: 'Bob', primary: false },
      ],
    });
  return Promise.resolve({ data: {} });
}

function renderAt(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path='/settings/organization' element={<OrganizationPage />}>
          <Route
            path='departments/:departmentId'
            element={<DepartmentPage />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('organization routes', () => {
  it('gate the settings page and its department child with the organization item, and the directory with its page', () => {
    const [app, settings] = routes as unknown as {
      parent: string;
      routes: {
        path: string;
        authz: unknown;
        children?: { path: string; authz?: unknown }[];
      }[];
    }[];
    expect(app?.routes[0]).toMatchObject({
      path: '/department-directory',
      authz: {
        resource: { type: 'page', id: 'org.directory' },
        action: 'access',
      },
    });
    expect(settings?.routes[0]).toMatchObject({
      path: '/organization',
      authz: {
        resource: { type: 'settings', id: 'organization' },
        action: 'read',
      },
    });
    // The child inherits the entry page's authz; its path is the one the subject type's `manage` returns.
    expect(settings?.routes[0]?.children).toEqual([
      expect.objectContaining({ path: 'departments/:departmentId' }),
    ]);
    expect(settings?.routes[0]?.children?.[0]?.authz).toBeUndefined();
  });
});

describe('the organization settings page', () => {
  beforeEach(() => {
    mocks.canUpdate = true;
    mocks.request.mockReset().mockImplementation(respond);
  });

  it('shows the tree and the selected department member panel', async () => {
    renderAt('/settings/organization/departments/sales');

    expect(await screen.findByText('Headquarters')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('department.primary')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'department.setPrimary' }),
    ).toBeInTheDocument();
  });

  it('disables a department and reloads the tree', async () => {
    renderAt('/settings/organization');
    await screen.findByText('Sales');
    const [disableHq] = screen.getAllByRole('button', {
      name: 'organization.disable',
    });
    if (!disableHq) throw new Error('No disable button');
    fireEvent.click(disableHq);

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'departments-example/departments/hq/active',
        method: 'PUT',
        json: { active: false },
      }),
    );
    await waitFor(() =>
      expect(
        mocks.request.mock.calls.filter(
          ([options]) =>
            options.path === 'departments-example/departments' &&
            !options.method,
        ),
      ).toHaveLength(2),
    );
  });

  it('hides every write without update', async () => {
    mocks.canUpdate = false;
    renderAt('/settings/organization/departments/sales');

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
