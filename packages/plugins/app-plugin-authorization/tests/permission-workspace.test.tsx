// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  listPermissionSets: vi.fn(),
  listAssignments: vi.fn(),
  updatePermissionSet: vi.fn(),
  createPermissionSet: vi.fn(),
  invalidatePermissions: vi.fn(),
}));
vi.mock('../client/runtime.js', () => ({ getAuthorizationClient: () => api }));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { PermissionSetsPanel } from '../client/pages/permission-sets/panel.js';
import EditPage from '../client/pages/permission-set-edit-page.js';
import NewPage from '../client/pages/permission-set-new-page.js';
import DetailsPage from '../client/pages/permission-set-details-page.js';
import AssignmentsPage from '../client/pages/permission-set-assignments-page.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import type { UserDirectory } from '../client/components/user-directory.js';
const options: AuthorizationOptions = {
  plugins: [],
  subjectTypes: [],
  recordAccessPolicies: [],
  collections: [],
  resourceTypes: [
    {
      value: 'settings',
      label: 'Settings',
      actions: [{ value: 'read', label: 'Read' }],
      resources: [
        { value: 'authorization.permission-sets', label: 'Permission sets' },
      ],
    },
  ],
};
const directory: UserDirectory = { users: [] };
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid='url'>{location.pathname}</output>
      <button onClick={() => void navigate(-1)}>History back</button>
    </>
  );
}
function mount(path = '/sets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route
          path='/sets'
          element={
            <PermissionSetsPanel options={options} directory={directory} />
          }
        >
          <Route path='new' element={<NewPage />} />
          <Route path='edit/:permissionSetKey' element={<EditPage />}>
            <Route path='assignments' element={<AssignmentsPage />} />
            <Route path='details' element={<DetailsPage />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.listPermissionSets.mockResolvedValue([
    { key: 'staff', title: 'Staff', grants: [] },
    { key: 'sales', title: 'Sales', grants: [] },
  ]);
  api.listAssignments.mockResolvedValue([]);
});
describe('permission set workspace', () => {
  it('selects the first set, retains sidebar collapse across routes and supports browser back', async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('/sets/edit/staff'),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'User assignments',
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(api.listAssignments).toHaveBeenCalledWith('staff'),
    );
    expect(screen.getByTestId('url')).toHaveTextContent(
      '/sets/edit/staff/assignments',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse permission sets' }),
    );
    expect(
      screen.queryByPlaceholderText('Search permission sets'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await screen.findByRole('button', { name: 'Permission sets: Read' });
    expect(
      screen.getByRole('button', { name: 'Expand permission sets' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand permission sets' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('/sets/edit/sales'),
    );
  });
  it('opens assignment deep links and confirms unsaved changes before switching sets', async () => {
    mount('/sets/edit/staff/assignments');
    await waitFor(() =>
      expect(api.listAssignments).toHaveBeenCalledWith('staff'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Permissions', exact: true }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Permission sets: Read' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/sets/edit/staff');
  });
  it('saves in place and creates a set without returning to a list', async () => {
    api.updatePermissionSet.mockImplementation((key: string, input: object) =>
      Promise.resolve({ key, ...input }),
    );
    api.createPermissionSet.mockImplementation((input: object) =>
      Promise.resolve(input),
    );
    mount('/sets/edit/staff');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Permission sets: Read' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save permission set' }),
    );
    await waitFor(() => expect(api.updatePermissionSet).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save permission set' }),
      ).toBeDisabled(),
    );
    expect(screen.getByTestId('url')).toHaveTextContent('/sets/edit/staff');
    fireEvent.click(screen.getByRole('button', { name: 'New permission set' }));
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Name', exact: true }),
      { target: { value: 'Support' } },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Key', exact: true }),
      { target: { value: 'support' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save permission set' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('/sets/edit/support'),
    );
    expect(screen.getByRole('button', { name: 'Support' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
  it('does not allow changing protected sets but keeps user assignments accessible', async () => {
    api.listPermissionSets.mockResolvedValue([
      {
        key: 'staff',
        title: 'Staff',
        grants: [],
        protection: { allow: ['assign', 'revoke'] },
      },
    ]);
    mount('/sets/edit/staff');
    expect(
      await screen.findByRole('button', { name: 'Permission sets: Read' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Delete', exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'User assignments', exact: true }),
    );
    await waitFor(() =>
      expect(api.listAssignments).toHaveBeenCalledWith('staff'),
    );
  });
  it('routes basic information last and saves it within its tab', async () => {
    api.updatePermissionSet.mockImplementation((key: string, input: object) =>
      Promise.resolve({ key, ...input }),
    );
    mount('/sets/edit/staff/details');
    const name = await screen.findByRole('textbox', {
      name: 'Name',
      exact: true,
    });
    expect(
      screen.getByRole('button', { name: 'Basic information' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(name).toHaveValue('Staff');
    fireEvent.change(name, { target: { value: 'Staff updated' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save permission set' }),
    );
    await waitFor(() =>
      expect(api.updatePermissionSet).toHaveBeenCalledWith(
        'staff',
        expect.objectContaining({ title: 'Staff updated', grants: [] }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save permission set' }),
      ).toBeDisabled(),
    );
    expect(screen.getByTestId('url')).toHaveTextContent(
      '/sets/edit/staff/details',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'User assignments', exact: true }),
    );
    await waitFor(() =>
      expect(api.listAssignments).toHaveBeenCalledWith('staff'),
    );
    expect(
      screen.queryByRole('button', { name: 'Save permission set' }),
    ).not.toBeInTheDocument();
  });
});
