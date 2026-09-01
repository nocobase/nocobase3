import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { HubApplicationsProvider } from '../client/components/hub-applications-provider.js';
import ApplicationDetailPage from '../client/pages/application-detail-page.js';

function renderPage(entry = '/apps/crm'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HubApplicationsProvider>
        <Routes>
          <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
        </Routes>
      </HubApplicationsProvider>
    </MemoryRouter>,
  );
}

describe('ApplicationDetailPage', () => {
  it('provides every approved detail tab and copyable development commands', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderPage();

    for (const tab of [
      'Overview',
      'Development',
      'Releases',
      'Deployments',
      'Activity',
      'Permissions',
      'Settings',
    ]) {
      expect(screen.getByRole('tab', { name: tab })).toBeVisible();
    }

    await user.click(screen.getByRole('tab', { name: 'Development' }));
    expect(screen.getByText('Local development')).toBeVisible();
    expect(screen.getByText('First deployment')).toBeVisible();
    expect(screen.getByText('Release update')).toBeVisible();
    await user.click(
      screen.getAllByRole('button', { name: 'Copy command' })[0],
    );
    expect(writeText).toHaveBeenCalledOnce();
  });

  it('supports release and permission mutations inside the page', async () => {
    const user = userEvent.setup();
    renderPage('/apps/analytics?tab=releases');

    await user.click(screen.getByRole('button', { name: 'Pin version 1.4.0' }));
    expect(screen.getAllByText('Pinned')).toHaveLength(2);

    await user.click(screen.getByRole('tab', { name: 'Permissions' }));
    await user.click(screen.getByRole('button', { name: 'Add authorization' }));
    await user.selectOptions(screen.getByLabelText('Member'), 'member-2');
    await user.selectOptions(screen.getByLabelText('Role'), 'operator');
    await user.click(screen.getByRole('button', { name: 'Add access' }));
    expect(screen.getByText('Lin Chen')).toBeVisible();
  });

  it('links application deployments to the registered detail route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps/warehouse?tab=deployments']}>
        <HubApplicationsProvider>
          <Routes>
            <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
            <Route
              path='/deployments/:deploymentId'
              element={<h1>Deployment destination</h1>}
            />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'DEP-1042' }));
    expect(
      screen.getByRole('heading', { name: 'Deployment destination' }),
    ).toBeVisible();
  });

  it('keeps locally generated deployment ids unique after remounting the route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps/warehouse?tab=deployments']}>
        <HubApplicationsProvider>
          <Routes>
            <Route
              path='/apps/:appId'
              element={
                <>
                  <ApplicationDetailPage />
                  <Link to='/away'>Leave details</Link>
                </>
              }
            />
            <Route
              path='/away'
              element={
                <Link to='/apps/warehouse?tab=deployments'>
                  Return to details
                </Link>
              }
            />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Redeploy' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );
    await user.click(screen.getByRole('link', { name: 'Leave details' }));
    await user.click(screen.getByRole('link', { name: 'Return to details' }));
    await user.click(screen.getAllByRole('button', { name: 'Redeploy' })[0]);
    await user.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );

    const localDeploymentIds = screen
      .getAllByText(/^DEP-LOCAL-/)
      .map((element) => element.textContent);
    expect(new Set(localDeploymentIds).size).toBe(localDeploymentIds.length);
  });
});
