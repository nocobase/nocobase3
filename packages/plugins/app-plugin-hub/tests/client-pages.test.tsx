import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AppOverview,
  AppPageResponse,
  AppSummary,
} from '../client/pages/hub/types.js';

const mocks = vi.hoisted(() => ({
  apiClientToken: Symbol('api-client'),
  authorizationClientToken: Symbol('authorization-client'),
  client: {
    request: vi.fn(),
  },
  authorization: {
    can: vi.fn(),
    invalidatePermissions: vi.fn(),
    onPermissionsInvalidated: vi.fn(() => () => undefined),
  },
}));

vi.mock('@nocobase/app-client', () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiClientToken: mocks.apiClientToken,
  resolveAppUrl: (value: string) => value,
  useService: (token: unknown) =>
    token === mocks.apiClientToken ? mocks.client : mocks.authorization,
}));

vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  authorizationClientToken: mocks.authorizationClientToken,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: {
        readonly defaultValue?: string;
        readonly [key: string]: unknown;
      },
    ) => options?.defaultValue ?? key,
  }),
}));

import AppPage from '../client/pages/hub/app-page.js';
import { Detail } from '../client/pages/hub/detail.js';
import { ApplicationsCatalog } from '../client/pages/hub-page.js';

const appSummary = (id: string, name = id): AppSummary => ({
  app: {
    id,
    name,
    currentDeploymentId: 'deployment-1',
    updatedAt: '2026-09-11T00:00:00Z',
  },
  runtime: { hostAvailable: true, state: 'running' },
  currentVersion: '1.0.0',
  hasReleases: true,
  hasPendingDeployment: false,
  enabled: true,
  startupMode: 'eager',
});

const page = (
  items: readonly AppSummary[],
  overrides: Partial<AppPageResponse> = {},
): AppPageResponse => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 24,
  ...overrides,
});

const renderCatalog = (): void => {
  render(
    <MemoryRouter initialEntries={['/apps']}>
      <ApplicationsCatalog />
    </MemoryRouter>,
  );
};

const deferred = <T,>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const detail = (overrides: Partial<AppOverview> = {}): AppOverview => ({
  app: {
    id: 'customer',
    name: 'Customer',
    currentDeploymentId: 'deployment-1',
    updatedAt: '2026-09-11T00:00:00Z',
  },
  runtime: { hostAvailable: true, state: 'running' },
  currentVersion: '1.0.0',
  hasReleases: true,
  hasPendingDeployment: false,
  enabled: true,
  startupMode: 'eager',
  deployment: {
    desiredReleaseId: 'release-1',
    observedReleaseId: 'release-1',
    observedState: 'running',
    activation: 'eager',
    basePath: '/customer',
    updatedAt: '2026-09-11T00:00:00Z',
  },
  hostUrl: null,
  ...overrides,
});

const renderAppPage = (
  initialEntry: string,
  appDetail: AppOverview = detail(),
): void => {
  function DeploymentsTab(): ReactElement {
    const location = useLocation();
    return (
      <>
        <div>Deployments tab</div>
        <output data-testid='location'>
          {location.pathname}
          {location.search}
        </output>
      </>
    );
  }
  mocks.client.request.mockImplementation(({ path }: { path: string }) => {
    if (path === 'hub/apps/customer') {
      return Promise.resolve({ data: appDetail });
    }
    if (path === 'hub/apps/customer/deployments') {
      return Promise.resolve({
        data: { items: [], page: 1, pageSize: 20, total: 0 },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path='/apps/:appId' element={<AppPage />}>
          <Route path='deployments' element={<DeploymentsTab />} />
          <Route path='releases' element={<div>Releases tab</div>} />
          <Route path='*' element={<div>Unknown tab</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
};

const getPaginationControl = (label: string): HTMLElement => {
  const control = document.querySelector<HTMLElement>(
    `[data-slot='pagination-link'][aria-label='${label}']`,
  );
  if (!control) {
    throw new Error(`Pagination control not found: ${label}`);
  }
  return control;
};

describe('Hub client pages', () => {
  beforeEach(() => {
    mocks.client.request.mockReset();
    mocks.authorization.can.mockReset().mockResolvedValue(true);
    mocks.authorization.invalidatePermissions.mockReset();
    mocks.authorization.onPermissionsInvalidated
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces catalog search and sends the trimmed query to the server', async () => {
    mocks.client.request.mockResolvedValue({
      data: page([appSummary('customer', 'Customer Portal')]),
    });
    renderCatalog();

    await waitFor(() =>
      expect(mocks.client.request).toHaveBeenCalledWith({
        path: 'hub/apps',
        query: { search: undefined, page: 1, pageSize: 24 },
      }),
    );
    const input = screen.getByPlaceholderText('Search applications…');
    fireEvent.change(input, { target: { value: ' customer ' } });

    await new Promise((resolve) => window.setTimeout(resolve, 320));
    expect(mocks.client.request).toHaveBeenLastCalledWith({
      path: 'hub/apps',
      query: { search: 'customer', page: 1, pageSize: 24 },
    });
  });

  it('resets the catalog page when the search changes', async () => {
    mocks.client.request.mockImplementation(
      ({ query }: { query?: { page?: number } }) =>
        Promise.resolve({
          data: page([appSummary(`app-${query?.page ?? 1}`)], {
            total: 48,
            page: query?.page ?? 1,
          }),
        }),
    );
    renderCatalog();

    await waitFor(() =>
      expect(getPaginationControl('Go to page 2')).toBeInTheDocument(),
    );
    fireEvent.click(getPaginationControl('Go to page 2'));
    await waitFor(() =>
      expect(mocks.client.request).toHaveBeenLastCalledWith({
        path: 'hub/apps',
        query: { search: undefined, page: 2, pageSize: 24 },
      }),
    );

    fireEvent.change(screen.getByPlaceholderText('Search applications…'), {
      target: { value: 'customer' },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    expect(mocks.client.request).toHaveBeenLastCalledWith({
      path: 'hub/apps',
      query: { search: 'customer', page: 1, pageSize: 24 },
    });
  });

  it('keeps the previous catalog visible while loading another page', async () => {
    const nextPage = deferred<{ data: AppPageResponse }>();
    mocks.client.request.mockImplementation(
      ({ query }: { query?: { page?: number } }) =>
        query?.page === 2
          ? nextPage.promise
          : Promise.resolve({
              data: page([appSummary('first', 'First application')], {
                total: 48,
              }),
            }),
    );
    renderCatalog();

    await waitFor(() =>
      expect(screen.getByText('First application')).toBeInTheDocument(),
    );
    fireEvent.click(getPaginationControl('Go to next page'));
    expect(screen.getByText('First application')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.client.request).toHaveBeenLastCalledWith({
        path: 'hub/apps',
        query: { search: undefined, page: 2, pageSize: 24 },
      }),
    );

    nextPage.resolve({
      data: page([appSummary('second', 'Second application')], {
        total: 48,
        page: 2,
      }),
    });
    await waitFor(() =>
      expect(screen.getByText('Second application')).toBeInTheDocument(),
    );
  });

  it('ignores an older search response when a newer query finishes first', async () => {
    const firstSearch = deferred<{ data: AppPageResponse }>();
    const secondSearch = deferred<{ data: AppPageResponse }>();
    mocks.client.request.mockImplementation(
      ({ query }: { query?: { search?: string } }) => {
        if (query?.search === 'a') return firstSearch.promise;
        if (query?.search === 'ab') return secondSearch.promise;
        return Promise.resolve({ data: page([]) });
      },
    );
    renderCatalog();
    await waitFor(() => expect(mocks.client.request).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Search applications…');
    fireEvent.change(input, { target: { value: 'a' } });
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    await waitFor(() =>
      expect(mocks.client.request).toHaveBeenLastCalledWith({
        path: 'hub/apps',
        query: { search: 'a', page: 1, pageSize: 24 },
      }),
    );

    fireEvent.change(input, { target: { value: 'ab' } });
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    secondSearch.resolve({
      data: page([appSummary('ab', 'AB application')]),
    });
    await waitFor(() =>
      expect(screen.getByText('AB application')).toBeInTheDocument(),
    );

    firstSearch.resolve({
      data: page([appSummary('a', 'A application')]),
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(screen.queryByText('A application')).not.toBeInTheDocument();
    expect(screen.getByText('AB application')).toBeInTheDocument();
  });

  it('uses the same catalog data source for Grid and List views', async () => {
    mocks.client.request.mockResolvedValue({
      data: page([appSummary('customer', 'Customer Portal')]),
    });
    renderCatalog();
    await waitFor(() =>
      expect(screen.getByText('Customer Portal')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByText('Customer Portal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByText('Customer Portal')).toBeInTheDocument();
  });

  it('replaces the detail parent URL with the first accessible Tab', async () => {
    renderAppPage('/apps/customer?filter=recent');

    await waitFor(() =>
      expect(screen.getByText('Deployments tab')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/apps/customer/deployments?filter=recent',
    );
  });

  it('renders an unavailable state for an explicit Tab without access', async () => {
    mocks.authorization.can.mockImplementation(
      (_resource: unknown, action: string) =>
        Promise.resolve(action !== 'read-release'),
    );
    renderAppPage('/apps/customer/releases');

    await waitFor(() =>
      expect(
        screen.getByText('This application page is not available.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Releases tab')).not.toBeInTheDocument();
  });

  it('keeps unavailable action reasons accessible without rendering a visible hint panel', () => {
    render(
      <MemoryRouter>
        <Detail
          app={{
            ...detail({
              runtime: { hostAvailable: true, state: 'deploying' },
              hasPendingDeployment: true,
            }),
            deployments: [],
            releases: [],
          }}
          busy={false}
          capabilities={{
            create: true,
            'update-settings': true,
            remove: true,
            'read-release': true,
            'upload-release': true,
            'read-config-template': true,
            'read-deployment': true,
            deploy: true,
            rollback: true,
            'read-config': true,
            'update-config': true,
            refresh: true,
            start: true,
            restart: true,
            stop: true,
          }}
          onBack={vi.fn()}
          onRefresh={vi.fn()}
          onRestart={vi.fn()}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onTab={vi.fn()}
          tab='deployments'
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toHaveAttribute(
      'aria-describedby',
      'hub-lifecycle-action-reason',
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute(
      'aria-describedby',
      'hub-stop-action-reason',
    );
    expect(screen.getByRole('button', { name: 'Visit' })).toHaveAttribute(
      'aria-describedby',
      'hub-visit-action-reason',
    );
  });
});
