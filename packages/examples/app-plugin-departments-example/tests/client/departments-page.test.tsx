import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
  readonly query?: unknown;
}

const mocks = vi.hoisted(() => ({
  request: vi.fn<(options: RequestOptions) => Promise<unknown>>(),
  canUpdate: true,
}));

vi.mock('@nocobase/app-client', () => {
  const api = { request: mocks.request };
  class ApiClientError extends Error {
    public readonly status: number;
    public readonly code?: string;
    public constructor(
      message: string,
      options: { status: number; code?: string },
    ) {
      super(message);
      this.status = options.status;
      this.code = options.code;
    }
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

// Keys stand for their translations; a descriptor shows its namespace, proving it went through `t`.
vi.mock('@nocobase/i18n/client', () => {
  const t = (key: string, options?: { ns?: string }): string =>
    options?.ns?.includes('departments-example') ? `[dept] ${key}` : key;
  return { useTranslation: () => ({ t }) };
});

import { ApiClientError } from '@nocobase/app-client';

import routes from '../../client/routes.js';
import DepartmentPage from '../../client/pages/settings/departments/department.js';
import DepartmentsPage from '../../client/pages/settings/departments/index.js';

const NS = '@nocobase/app-plugin-departments-example';
const DEPARTMENTS = [
  {
    id: 'trading',
    title: { key: 'seed.trading', ns: NS },
    parentId: null,
    region: null,
    active: true,
    sortOrder: 0,
  },
  {
    id: 'north-sales',
    title: { key: 'seed.northSales', ns: NS },
    parentId: 'trading',
    region: 'North',
    active: true,
    sortOrder: 0,
  },
  {
    id: 'archive',
    title: 'Archive',
    parentId: 'trading',
    region: null,
    active: false,
    sortOrder: 1,
  },
];

function respond(options: RequestOptions): Promise<unknown> {
  if (options.path === 'departments-example/departments' && !options.method)
    return Promise.resolve({ data: DEPARTMENTS });
  if (
    options.path === 'departments-example/departments/north-sales/members' &&
    !options.method
  )
    return Promise.resolve({
      data: [
        {
          userId: 'u1',
          title: 'Leo Wang',
          description: 'leo@departments.example',
          primary: true,
        },
        { userId: 'u2', title: 'Nina Li', primary: false },
      ],
    });
  if (options.path === 'departments-example/users')
    return Promise.resolve({
      data: {
        items: [
          { id: 'u2', title: 'Nina Li' },
          {
            id: 'u3',
            title: 'Mia Zhao',
            description: 'mia@departments.example',
          },
        ],
      },
    });
  return Promise.resolve({ data: {} });
}

function failure(status: number, code: string): ApiClientError {
  return new ApiClientError('Request failed', {
    status,
    code,
    method: 'PUT',
    url: '/api',
  });
}

function renderAt(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path='/settings/departments' element={<DepartmentsPage />}>
          <Route path=':departmentId' element={<DepartmentPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('departments routes', () => {
  it('gate the single settings page and its department child with the departments item', () => {
    expect(routes).toHaveLength(1);
    const [settings] = routes as unknown as {
      routes: {
        path: string;
        navigation: { title: string };
        authz: unknown;
        children?: { path: string; authz?: unknown }[];
      }[];
    }[];
    expect(settings?.routes).toHaveLength(1);
    expect(settings?.routes[0]).toMatchObject({
      path: '/departments',
      navigation: { title: 'navigation.departments' },
      authz: {
        resource: { type: 'settings', id: 'departments' },
        action: 'read',
      },
    });
    // The child inherits the entry page's authz.
    expect(settings?.routes[0]?.children).toEqual([
      expect.objectContaining({ path: ':departmentId' }),
    ]);
    expect(settings?.routes[0]?.children?.[0]?.authz).toBeUndefined();
  });
});

describe('the Departments settings page', () => {
  beforeEach(() => {
    mocks.canUpdate = true;
    mocks.request.mockReset().mockImplementation(respond);
  });

  it('shows the example notice, the translated tree and the selected department members', async () => {
    renderAt('/settings/departments/north-sales');

    expect(screen.getByText('notice.title')).toBeInTheDocument();
    expect(await screen.findByText('[dept] seed.trading')).toBeInTheDocument();
    // A user-created department keeps its plain text.
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '[dept] seed.northSales' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Leo Wang')).toBeInTheDocument();
    const leo = screen.getByText('Leo Wang').closest('tr');
    if (!leo) throw new Error('No row for Leo');
    expect(within(leo).getByText('members.primary')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'members.setPrimaryNamed' }),
    ).toBeInTheDocument();
  });

  it('filters the tree by the translated title and keeps the ancestors', async () => {
    renderAt('/settings/departments');
    await screen.findByText('Archive');
    fireEvent.change(screen.getByLabelText('tree.search'), {
      target: { value: 'northsales' },
    });
    expect(screen.getByText('[dept] seed.northSales')).toBeInTheDocument();
    expect(screen.getByText('[dept] seed.trading')).toBeInTheDocument();
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('tree.search'), {
      target: { value: 'nothing here' },
    });
    expect(screen.getByText('tree.noMatch')).toBeInTheDocument();
  });

  it('adds a member through the user picker and marks existing members', async () => {
    renderAt('/settings/departments/north-sales');
    await screen.findByText('Leo Wang');
    fireEvent.change(screen.getByLabelText('members.search'), {
      target: { value: 'a' },
    });
    expect(await screen.findByText('Mia Zhao')).toBeInTheDocument();
    expect(screen.getByText('members.alreadyMember')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'members.add' }));

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'departments-example/departments/north-sales/members',
        method: 'POST',
        json: { userId: 'u3' },
      }),
    );
  });

  it('asks before disabling a department, then reloads the tree', async () => {
    renderAt('/settings/departments');
    await screen.findByText('Archive');
    const [disableTrading] = screen.getAllByRole('button', {
      name: 'tree.disable',
    });
    if (!disableTrading) throw new Error('No disable button');
    fireEvent.click(disableTrading);
    fireEvent.click(
      await screen.findByRole('button', { name: 'dialog.disable' }),
    );

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'departments-example/departments/trading/active',
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

  it('saves the basic info, including the region', async () => {
    renderAt('/settings/departments/north-sales?tab=basic');
    const title = await screen.findByDisplayValue('[dept] seed.northSales');
    fireEvent.change(title, { target: { value: 'North Sales Team' } });
    fireEvent.click(screen.getByRole('button', { name: 'basic.save' }));

    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        path: 'departments-example/departments/north-sales',
        method: 'PATCH',
        json: { title: 'North Sales Team' },
      }),
    );
  });

  it('translates an error by its code', async () => {
    mocks.request.mockImplementation((options) =>
      options.method === 'PUT'
        ? Promise.reject(failure(404, 'DEPARTMENT_NOT_FOUND'))
        : respond(options),
    );
    renderAt('/settings/departments');
    await screen.findByText('Archive');
    fireEvent.click(screen.getByRole('button', { name: 'tree.enable' }));
    expect(
      await screen.findByText('errors.DEPARTMENT_NOT_FOUND'),
    ).toBeInTheDocument();
  });

  it('shows the forbidden state', async () => {
    mocks.request.mockRejectedValue(failure(403, 'FORBIDDEN'));
    renderAt('/settings/departments');
    expect(await screen.findByText('page.forbidden')).toBeInTheDocument();
  });

  it('hides every write without update', async () => {
    mocks.canUpdate = false;
    renderAt('/settings/departments/north-sales');

    expect(await screen.findByText('Leo Wang')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /tree\.|members\.(add|remove|setPrimary)/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('members.search')).not.toBeInTheDocument();
  });
});
