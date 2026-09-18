import { Toaster, toast } from 'sonner';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AppOverview,
  AppPageResponse,
  AppSummary,
  ReleaseRecord,
} from '../client/pages/hub/types.js';

const mocks = vi.hoisted(() => ({
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
  resolveAppUrl: (value: string) => value,
  useApiClient: () => mocks.client,
  useService: (token: unknown) => {
    expect(token).toBe(mocks.authorizationClientToken);
    return mocks.authorization;
  },
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
    // Date formatting reads the application's language from here, so the mock has to carry it as the real hook does.
    i18n: { language: 'en-US' },
  }),
}));

import AppPage from '../client/pages/hub/app-page.js';
import DevelopmentPage from '../client/pages/hub/tabs/development-page.js';
import DeploymentsPage from '../client/pages/hub/tabs/deployments-page.js';
import SettingsPage from '../client/pages/hub/tabs/settings-page.js';
import { Detail } from '../client/pages/hub/detail.js';
import { ApplicationsCatalog } from '../client/pages/hub-page.js';
import { ErrorNotification } from '../client/pages/hub/shared.js';
import { readError } from '../client/pages/hub/utils.js';

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
  function HistoryControls(): ReactElement {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => void navigate(-1)}>History back</button>
        <button onClick={() => void navigate(1)}>History forward</button>
      </>
    );
  }
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
    if (path === 'hub/apps/customer/releases')
      return Promise.resolve({ data: [] });
    if (path === 'hub/apps/customer/deployments') {
      return Promise.resolve({
        data: { items: [], page: 1, pageSize: 20, total: 0 },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HistoryControls />
      <Routes>
        <Route path='/apps'>
          <Route index element={<div>Applications catalog</div>} />
          <Route path=':appId' element={<AppPage />}>
            <Route path='deployments' element={<DeploymentsTab />} />
            <Route path='releases' element={<div>Releases tab</div>} />
            <Route path='development' element={<DevelopmentPage />} />
            <Route path='settings' element={<SettingsPage />} />
            <Route path='*' element={<div>Unknown tab</div>} />
          </Route>
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
    render(<Toaster position='top-right' />);
    mocks.client.request.mockReset();
    mocks.authorization.can.mockReset().mockResolvedValue(true);
    mocks.authorization.invalidatePermissions.mockReset();
    mocks.authorization.onPermissionsInvalidated
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  afterEach(() => {
    toast.dismiss();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires confirmation before deleting an owned App and returns to the catalog', async () => {
    renderAppPage('/apps/customer/settings');
    const requestedDeletion = () =>
      mocks.client.request.mock.calls.some(
        ([request]) => request.method === 'DELETE',
      );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove application' }),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(requestedDeletion()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestedDeletion()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove application' }));
    mocks.client.request.mockResolvedValueOnce({ data: { success: true } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove', exact: true }),
    );
    await screen.findByText('Applications catalog');
    expect(mocks.client.request).toHaveBeenCalledWith({
      path: 'hub/apps/customer',
      method: 'DELETE',
    });
  });

  it('hides deletion when the App removal permission is denied', async () => {
    mocks.authorization.can.mockImplementation(
      (_resource: unknown, action: string) =>
        Promise.resolve(action !== 'remove'),
    );
    renderAppPage('/apps/customer/settings');
    await screen.findByText('Application settings');
    expect(
      screen.queryByRole('button', { name: 'Remove application' }),
    ).not.toBeInTheDocument();
  });

  it('edits the App name, rejects blank input, and refreshes the saved heading', async () => {
    renderAppPage('/apps/customer/settings');
    const input = await screen.findByLabelText('Application name');
    const save = screen.getByRole('button', { name: 'Save settings' });
    expect(input).toHaveValue('Customer');
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '  New name  ' } });
    expect(save).toBeEnabled();
    mocks.client.request.mockImplementation(
      ({ path, method }: { path: string; method?: string }) => {
        if (method === 'PUT')
          return Promise.resolve({ data: { success: true } });
        if (path === 'hub/apps/customer')
          return Promise.resolve({
            data: detail({ app: { ...detail().app, name: 'New name' } }),
          });
        return Promise.resolve({
          data: { items: [], total: 0, page: 1, pageSize: 20 },
        });
      },
    );
    fireEvent.click(save);
    await screen.findByRole('heading', { name: 'New name' });
    expect(mocks.client.request).toHaveBeenCalledWith({
      path: 'hub/apps/customer/settings',
      method: 'PUT',
      json: { name: 'New name', activation: 'eager' },
    });
    expect(screen.getByLabelText('Application name')).toHaveValue('New name');
    expect(
      screen.getByRole('button', { name: 'Save settings' }),
    ).toBeDisabled();
  });

  it('keeps an unsaved name and shows a notification when saving fails', async () => {
    renderAppPage('/apps/customer/settings');
    fireEvent.change(await screen.findByLabelText('Application name'), {
      target: { value: 'Draft name' },
    });
    mocks.client.request.mockRejectedValueOnce(
      new Error('Could not save name'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Could not save name');
    expect(screen.getByLabelText('Application name')).toHaveValue('Draft name');
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
  });

  it('generates different IDs for repeated application names', async () => {
    mocks.client.request.mockImplementation(({ method }: { method?: string }) =>
      Promise.resolve(method === 'POST' ? { data: {} } : { data: page([]) }),
    );
    renderCatalog();
    const ids: string[] = [];
    for (let count = 0; count < 2; count += 1) {
      fireEvent.click(
        await screen.findByRole('button', { name: 'New application' }),
      );
      fireEvent.change(screen.getByLabelText('Application name'), {
        target: { value: 'TMS' },
      });
      ids.push(
        (screen.getByLabelText(/Application ID/) as HTMLInputElement).value,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Create application' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(mocks.client.request).toHaveBeenCalledWith({
        path: 'hub/apps',
        method: 'POST',
        json: { id: ids[count], name: 'TMS' },
      });
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('generates editable IDs and reports conflicts above an open create dialog', async () => {
    const conflict = Object.assign(new Error('ID conflict'), {
      payload: {
        error: {
          code: 'APP_EXISTS',
          message: 'Application ID is unavailable.',
        },
      },
    });
    mocks.client.request.mockImplementation(
      ({ method }: { method?: string }) =>
        method === 'POST'
          ? Promise.reject(conflict)
          : Promise.resolve({ data: page([]) }),
    );
    renderCatalog();
    fireEvent.click(
      await screen.findByRole('button', { name: 'New application' }),
    );
    const name = screen.getByLabelText('Application name');
    const id = screen.getByLabelText(/Application ID/);
    fireEvent.change(name, { target: { value: 'TMS' } });
    expect((id as HTMLInputElement).value).toMatch(/^tms-[a-f0-9]{8}$/);
    fireEvent.change(id, { target: { value: 'tms' } });
    fireEvent.change(name, { target: { value: 'My TMS' } });
    expect(id).toHaveValue('tms');
    fireEvent.click(screen.getByRole('button', { name: 'Create application' }));
    expect(
      await screen.findByText('Application ID is unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(name).toHaveValue('My TMS');
    expect(id).toHaveValue('tms');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const notification = screen
      .getByText('Application ID is unavailable')
      .closest('[data-sonner-toaster]');
    expect(notification).toHaveAttribute('data-x-position', 'right');
    expect(notification).toHaveAttribute('data-y-position', 'top');
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

  it('uses a user-facing label for an unresolved catalog status', async () => {
    mocks.client.request.mockResolvedValue({
      data: page([
        {
          ...appSummary('customer', 'Customer Portal'),
          runtime: { hostAvailable: true, state: 'unknown' },
        },
      ]),
    });
    renderCatalog();

    await waitFor(() =>
      expect(screen.getByText('Customer Portal')).toBeInTheDocument(),
    );
    expect(screen.getByText('Status unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  it('notifies a friendly restart failure while keeping raw details collapsed', async () => {
    const rawMessage = 'Restart failed: App "hdsp" failed to reload';
    const apiError = Object.assign(new Error(rawMessage), {
      payload: {
        error: {
          code: 'RESTART_FAILED',
          message: rawMessage,
        },
      },
    });
    render(<ErrorNotification error={readError(apiError)} />);

    expect(await screen.findByText('Restart failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The application could not be restarted. Check its deployment status and try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    expect(screen.getByText('Show technical details')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Show technical details'));
    expect(
      screen.getByText((content) => content.includes('failed to reload')),
    ).toBeInTheDocument();
  });

  it('closes the lifecycle confirmation before showing a restart failure', async () => {
    const rawMessage = 'Restart failed: App "hdsp" failed to reload';
    const apiError = Object.assign(new Error(rawMessage), {
      payload: {
        error: {
          code: 'RESTART_FAILED',
          message: rawMessage,
        },
      },
    });
    renderAppPage('/apps/customer/deployments');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled(),
    );
    mocks.client.request.mockImplementation(({ path }: { path: string }) =>
      path === 'hub/apps/customer/restart'
        ? Promise.reject(apiError)
        : Promise.reject(new Error(`Unexpected request: ${path}`)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByText('Restart Customer?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    await waitFor(() =>
      expect(screen.getByText('Restart failed')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Restart Customer?')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'The application could not be restarted. Check its deployment status and try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Show technical details')).toBeInTheDocument();
  });

  it('opens Deployments for a deployed app and preserves the parent query', async () => {
    renderAppPage('/apps/customer?filter=recent');

    await waitFor(() =>
      expect(screen.getByText('Deployments tab')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/apps/customer/deployments?filter=recent',
    );
  });

  it('opens Releases before the first deployment', async () => {
    renderAppPage(
      '/apps/customer',
      detail({ app: { ...detail().app, currentDeploymentId: null } }),
    );
    expect(await screen.findByText('Releases tab')).toBeInTheDocument();
  });

  it('keeps an explicit Releases URL for an already deployed application', async () => {
    renderAppPage('/apps/customer/releases');
    expect(await screen.findByText('Releases tab')).toBeInTheDocument();
    expect(screen.queryByText('Deployments tab')).not.toBeInTheDocument();
  });

  it('guides new and existing projects and links to Releases with the query intact', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, { clipboard: { value: { writeText } } }),
    );
    renderAppPage(
      '/apps/customer?filter=recent',
      detail({
        hasReleases: false,
        app: { ...detail().app, currentDeploymentId: null },
      }),
    );
    expect(await screen.findByText('New project')).toBeInTheDocument();
    expect(screen.getByText('Existing project')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Existing project' }));
    expect(
      screen.queryByRole('button', { name: 'Copy create-app command' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Prepare your project')).not.toBeInTheDocument();
    expect(screen.getByText('Build the release')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(
      screen.getByRole('button', { name: 'Copy create-app command' }),
    ).toBeInTheDocument();
    expect(screen.getByText('pnpm build --tar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy build command' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('pnpm build --tar'),
    );
    expect(
      screen.getByRole('link', { name: 'Go to Releases' }),
    ).toHaveAttribute('href', '/apps/customer/releases?filter=recent');
    fireEvent.click(screen.getByRole('link', { name: 'Go to Releases' }));
    expect(await screen.findByText('Releases tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(await screen.findByText('Existing project')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(await screen.findByText('Releases tab')).toBeInTheDocument();
  });

  it('reports clipboard failures and hides inaccessible onboarding destinations', async () => {
    vi.stubGlobal(
      'navigator',
      Object.create(navigator, {
        clipboard: {
          value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
        },
      }),
    );
    mocks.authorization.can.mockImplementation(
      (_resource: unknown, action: string) =>
        Promise.resolve(
          action !== 'read-release' && action !== 'read-deployment',
        ),
    );
    renderAppPage(
      '/apps/customer',
      detail({
        hasReleases: false,
        app: { ...detail().app, currentDeploymentId: null },
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy build command' }),
    );
    expect(
      await screen.findByText(
        'Could not copy. Select and copy the command manually.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Go to Releases' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Go to Deployments' }),
    ).not.toBeInTheDocument();
  });

  it('opens deployment history after the first failed attempt', async () => {
    renderAppPage(
      '/apps/customer?filter=recent',
      detail({
        hasDeployments: true,
        hasReleases: true,
        app: { ...detail().app, currentDeploymentId: null },
      }),
    );
    expect(await screen.findByText('Deployments tab')).toBeInTheDocument();
  });

  it('defaults the deploy dialog to the newest release rather than the running one', async () => {
    // Two uploads of the same version: "release-2" is newer, "release-1" is what the App is running (see detail()).
    const release = (id: string, createdAt: string): ReleaseRecord => ({
      id,
      version: '1.0.0-beta.22',
      size: 1,
      checksum: `${id}-checksum-abcdef`,
      hasConfigTemplate: false,
      createdAt,
    });
    mocks.client.request.mockImplementation(({ path }: { path: string }) => {
      if (path === 'hub/apps/customer') {
        return Promise.resolve({ data: detail() });
      }
      if (path === 'hub/apps/customer/deployments') {
        return Promise.resolve({
          data: { items: [], page: 1, pageSize: 20, total: 0 },
        });
      }
      if (path === 'hub/apps/customer/releases') {
        return Promise.resolve({
          data: [
            release('release-2', '2026-09-14T00:00:00Z'),
            release('release-1', '2026-09-13T00:00:00Z'),
          ],
        });
      }
      if (path === 'hub/apps/customer/config') {
        return Promise.resolve({ data: { mode: 'external', content: null } });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    render(
      <MemoryRouter initialEntries={['/apps/customer/deployments']}>
        <Routes>
          <Route path='/apps' element={<div>Applications catalog</div>} />
          <Route path='/apps/:appId' element={<AppPage />}>
            <Route path='deployments' element={<DeploymentsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Deploy release' }),
    );

    const rows = await screen.findAllByRole('button', {
      name: /v1\.0\.0-beta\.22/,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('release-2-ch');
    expect(rows[0]).toHaveTextContent('Latest');
    expect(rows[0]).toHaveClass('bg-primary/5');
    expect(rows[1]).toHaveTextContent('Current');
    expect(rows[1]).not.toHaveClass('bg-primary/5');
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

  it('visibly explains unavailable detail actions and keeps them accessible', () => {
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
