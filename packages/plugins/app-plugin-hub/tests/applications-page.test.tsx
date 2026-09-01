import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { HubApplicationsProvider } from '../client/components/hub-applications-provider.js';
import ApplicationsPage from '../client/pages/applications-page.js';
import ApplicationDetailPage from '../client/pages/application-detail-page.js';

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/apps']}>
      <HubApplicationsProvider>
        <ApplicationsPage />
      </HubApplicationsProvider>
    </MemoryRouter>,
  );
}

describe('ApplicationsPage', () => {
  it('filters applications and switches between card and table views', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('heading', { name: 'Applications' })).toBeVisible();
    expect(screen.getByText('Warehouse Management')).toBeVisible();
    expect(screen.getByText('Customer Relationship Management')).toBeVisible();

    await user.type(screen.getByRole('searchbox'), 'crm');
    expect(screen.getByText('Customer Relationship Management')).toBeVisible();
    expect(screen.queryByText('Warehouse Management')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(
      screen.getByRole('columnheader', { name: 'Application' }),
    ).toBeVisible();
  });

  it('creates an application and completes a confirmed runtime action locally', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Create application' }),
    );
    await user.type(screen.getByLabelText('Name'), 'Support Portal');
    await user.type(screen.getByLabelText('Slug'), 'support-portal');
    await user.type(
      screen.getByLabelText('Description'),
      'Customer support workspace',
    );
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Support Portal')).toBeVisible();

    const warehouseCard = screen
      .getByText('Warehouse Management')
      .closest('[data-application-card]');
    expect(warehouseCard).not.toBeNull();
    await user.click(
      within(warehouseCard as HTMLElement).getByRole('button', {
        name: 'Start',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm start' }));
    expect(
      within(warehouseCard as HTMLElement).getByText('Running'),
    ).toBeVisible();
  });

  it('opens a newly created application from the application list', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps']}>
        <HubApplicationsProvider>
          <Routes>
            <Route path='/apps' element={<ApplicationsPage />} />
            <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Create application' }),
    );
    await user.type(screen.getByLabelText('Name'), 'Support Portal');
    await user.type(screen.getByLabelText('Slug'), 'support-portal');
    await user.type(
      screen.getByLabelText('Description'),
      'Customer support workspace',
    );
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const supportPortalCard = screen
      .getByText('Support Portal')
      .closest('[data-application-card]');
    expect(supportPortalCard).not.toBeNull();
    await user.click(
      within(supportPortalCard as HTMLElement).getByRole('button', {
        name: 'Manage',
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Support Portal' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeVisible();
  });

  it('keeps application entity ids independent from slug values', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/apps']}>
        <HubApplicationsProvider>
          <Routes>
            <Route path='/apps' element={<ApplicationsPage />} />
            <Route path='/apps/:appId' element={<ApplicationDetailPage />} />
          </Routes>
        </HubApplicationsProvider>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Create application' }),
    );
    await user.type(screen.getByLabelText('Name'), 'Warehouse ID Collision');
    await user.type(screen.getByLabelText('Slug'), 'warehouse');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const newApplicationCard = screen
      .getByText('Warehouse ID Collision')
      .closest('[data-application-card]');
    expect(newApplicationCard).not.toBeNull();
    await user.click(
      within(newApplicationCard as HTMLElement).getByRole('button', {
        name: 'Manage',
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Warehouse ID Collision' }),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Back to applications' }),
    );
    const existingWarehouseCard = screen
      .getByText('Warehouse Management')
      .closest('[data-application-card]');
    expect(existingWarehouseCard).not.toBeNull();
    await user.click(
      within(existingWarehouseCard as HTMLElement).getByRole('button', {
        name: 'Manage',
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'Warehouse Management' }),
    ).toBeVisible();
  });

  it('does not start an application before its first release exists', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Create application' }),
    );
    await user.type(screen.getByLabelText('Name'), 'Empty Application');
    await user.type(screen.getByLabelText('Slug'), 'empty-application');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const emptyApplicationCard = screen
      .getByText('Empty Application')
      .closest('[data-application-card]');
    expect(emptyApplicationCard).not.toBeNull();
    expect(
      within(emptyApplicationCard as HTMLElement).queryByRole('button', {
        name: 'Start',
      }),
    ).not.toBeInTheDocument();
  });
});
