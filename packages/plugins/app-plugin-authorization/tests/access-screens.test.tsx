// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type {
  AuthorizationOptions,
  AuthorizationUser,
  PermissionSet,
  PermissionSetAssignment,
  RestrictionRule,
  SharingRule,
} from '../client/authorization-client.js';

const { CompareSets } =
  await import('../client/pages/permission-sets/compare.js');
const { UserAccess } =
  await import('../client/pages/permission-sets/user-access.js');
const { setsHeldBy, userGrants } =
  await import('../client/pages/permission-sets/access-report.js');

const options: AuthorizationOptions = {
  plugins: [],
  resourceTypes: [
    {
      value: 'database.collection',
      label: 'Collections',
      resources: [
        { value: 'orders', label: 'Orders' },
        { value: 'articles', label: 'Articles' },
      ],
      actions: [
        { value: 'read', label: 'Read' },
        { value: 'create', label: 'Create' },
        { value: 'update', label: 'Update' },
        { value: 'delete', label: 'Delete' },
      ],
    },
    {
      value: 'page',
      label: 'Pages',
      resources: [{ value: 'home', label: 'Home' }],
      actions: [{ value: 'access', label: 'Access' }],
    },
  ],
  subjectTypes: [],
  collections: [
    { name: 'orders', fields: ['id', 'status'] },
    { name: 'articles', fields: ['id'] },
  ],
  recordAccessPolicies: [
    { value: 'allRecords', label: 'All records' },
    { value: 'recordsIOwn', label: 'Records I own' },
  ],
};

function collectionPolicy(
  recordAccess: string,
): Readonly<Record<string, unknown>> & { type: string } {
  return {
    type: 'database',
    fields: { output: '*' },
    recordAccess: [recordAccess],
  };
}

const root: PermissionSet = {
  key: 'root',
  title: 'Root',
  grants: [],
  unrestricted: true,
};

const member: PermissionSet = {
  key: 'member',
  title: 'Member',
  grants: [
    {
      resource: { type: 'database.collection', id: 'articles' },
      actions: [{ action: 'read', policy: collectionPolicy('allRecords') }],
    },
  ],
};

const orderOps: PermissionSet = {
  key: 'order-ops',
  title: 'Order operators',
  grants: [
    {
      resource: { type: 'database.collection', id: 'orders' },
      actions: [
        { action: 'read', policy: collectionPolicy('allRecords') },
        { action: 'update', policy: collectionPolicy('recordsIOwn') },
      ],
    },
    {
      resource: { type: 'page', id: 'home' },
      actions: [{ action: 'access' }],
    },
  ],
};

const sets: readonly PermissionSet[] = [root, member, orderOps];

const assignments: readonly PermissionSetAssignment[] = [
  {
    id: 'authenticated:*:member',
    subject: { type: 'authenticated', id: '*' },
    permissionSet: 'member',
  },
  {
    id: 'user:mia:order-ops',
    subject: { type: 'user', id: 'mia' },
    permissionSet: 'order-ops',
  },
  {
    id: 'user:ravi:root',
    subject: { type: 'user', id: 'ravi' },
    permissionSet: 'root',
  },
];

const users: readonly AuthorizationUser[] = [
  { id: 'mia', name: 'Mia Chen', email: 'mia@example.test' },
  { id: 'ravi', name: 'Ravi Patel', email: 'ravi@example.test' },
  { id: 'nina', name: 'Nina Rossi', email: 'nina@example.test' },
];

const sharing: readonly SharingRule[] = [
  {
    key: 'regional-orders',
    title: 'Regional orders',
    resource: { type: 'database.collection', id: 'orders' },
    actions: [
      {
        action: 'read',
        selection: { type: 'policy', policy: { type: 'all' } },
      },
    ],
    subjects: [{ type: 'user', id: 'mia' }],
  },
];

const restriction: readonly RestrictionRule[] = [
  {
    key: 'archived-orders',
    title: 'Archived orders',
    resource: { type: 'database.collection', id: 'orders' },
    actions: [{ action: 'read', scope: { type: 'all' } }],
    subjects: [{ type: 'authenticated', id: '*' }],
  },
];

function bodyRows(): readonly HTMLElement[] {
  const [body] = screen.getAllByRole('rowgroup').slice(1);
  return within(body as HTMLElement).getAllByRole('row');
}

function choosePerson(name: string): void {
  fireEvent.change(screen.getByLabelText('Search people'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}

describe('compare sets', () => {
  it('renders a column per set and marks every record, scoped and not granted', () => {
    render(
      <CompareSets options={options} sets={sets} onBack={() => undefined} />,
    );
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual([
      'Resource',
      expect.stringContaining('Root'),
      expect.stringContaining('Member'),
      expect.stringContaining('Order operators'),
    ]);

    // One row per resource for the chosen action, which opens on read.
    const rows = bodyRows();
    const ordersRead = rows.find((row) => /Orders/.test(row.textContent ?? ''));
    expect(ordersRead).toBeDefined();
    const read = within(ordersRead as HTMLElement);
    expect(read.getByLabelText('Unrestricted')).toBeInTheDocument();
    expect(read.getAllByLabelText('Not granted')).toHaveLength(1);
    expect(read.getByLabelText('Every record')).toBeInTheDocument();
  });

  it('changes the rows with the action selector', () => {
    render(
      <CompareSets options={options} sets={sets} onBack={() => undefined} />,
    );
    // Read is granted on both collections; update on orders alone.
    expect(
      bodyRows().filter((row) => /Articles/.test(row.textContent ?? '')),
    ).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Compared action'), {
      target: { value: 'update' },
    });
    const rows = bodyRows();
    expect(
      rows.filter((row) => /Articles/.test(row.textContent ?? '')),
    ).toEqual([]);
    const ordersUpdate = rows.find((row) =>
      /Orders/.test(row.textContent ?? ''),
    );
    expect(
      within(ordersUpdate as HTMLElement).getByLabelText('Scoped records'),
    ).toBeInTheDocument();
  });

  it('shows the unrestricted mark for the set that confers it, on every row', () => {
    render(
      <CompareSets options={options} sets={sets} onBack={() => undefined} />,
    );
    // Two read rows — orders and articles — plus the legend entry.
    expect(screen.getAllByLabelText('Unrestricted')).toHaveLength(3);
    expect(
      screen.getByText('Unrestricted: grants are not consulted'),
    ).toBeInTheDocument();
  });

  it('narrows the rows to one resource type and offers to clear the filter', () => {
    render(
      <CompareSets options={options} sets={sets} onBack={() => undefined} />,
    );
    // Pages declare no read, so the selector falls back to the action they do declare.
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }));
    expect(screen.getByLabelText('Compared action')).toHaveValue('access');
    expect(
      bodyRows().filter((row) => row.textContent?.includes('Home')),
    ).toHaveLength(1);
    expect(screen.queryByText(/Orders/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBeNull();
  });
});

describe('sets held by one person', () => {
  it('derives a direct assignment and the signed-in baseline', () => {
    expect(
      setsHeldBy('mia', sets, assignments).map((held) => [
        held.set.key,
        held.via,
      ]),
    ).toEqual([
      ['member', 'authenticated'],
      ['order-ops', 'assigned'],
    ]);
  });

  it('gives a person with no assignment the baseline alone', () => {
    expect(
      setsHeldBy('nina', sets, assignments).map((held) => held.set.key),
    ).toEqual(['member']);
  });

  it('reports the records and the set each action came from', () => {
    const grants = userGrants(options, setsHeldBy('mia', sets, assignments));
    expect(
      grants.map((grant) => [
        grant.label,
        grant.actions.map((action) => [
          action.action,
          action.records,
          action.grantedBy,
        ]),
      ]),
    ).toEqual([
      ['Articles', [['read', 'All records', 'Member']]],
      [
        'Orders',
        [
          ['read', 'All records', 'Order operators'],
          ['update', 'Records I own', 'Order operators'],
        ],
      ],
      ['Home', [['access', '—', 'Order operators']]],
    ]);
  });
});

describe('user access', () => {
  function renderUserAccess(
    directoryUsers: readonly AuthorizationUser[] = users,
  ): void {
    render(
      <UserAccess
        assignments={assignments}
        directory={{ users: directoryUsers }}
        options={options}
        rules={{ defaultAccess: [], sharing, restriction }}
        sets={sets}
        onBack={() => undefined}
      />,
    );
  }

  it('reports the sets held and the grants that follow', () => {
    renderUserAccess();
    choosePerson('Mia Chen');

    expect(
      screen.getByText('Member · Held by every signed-in user'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Order operators · Assigned directly'),
    ).toBeInTheDocument();
    expect(screen.getByText('Records I own')).toBeInTheDocument();
    expect(screen.getAllByText('Order operators').length).toBeGreaterThan(0);
  });

  it('lists the rules that may adjust those grants and says they resolve per request', () => {
    renderUserAccess();
    choosePerson('Mia Chen');

    expect(screen.getByText('Regional orders')).toBeInTheDocument();
    expect(screen.getByText('Archived orders')).toBeInTheDocument();
    expect(screen.getByText(/Rules resolve per request/)).toBeInTheDocument();
  });

  it('explains the bypass for an unrestricted holder and shows no permission table', () => {
    renderUserAccess();
    choosePerson('Ravi Patel');

    expect(
      screen.getByText('Ravi Patel has unrestricted access.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/grants are not consulted/)).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Starts from' }),
    ).toBeNull();
    // Restrictions are not bypassed, so they are still listed.
    expect(screen.getByText('Archived orders')).toBeInTheDocument();
  });

  it('shows an empty state for a person holding no set', () => {
    render(
      <UserAccess
        assignments={[]}
        directory={{ users }}
        options={options}
        rules={{}}
        sets={sets}
        onBack={() => undefined}
      />,
    );
    choosePerson('Nina Rossi');
    expect(screen.getByText('No permission sets')).toBeInTheDocument();
    expect(screen.getByText('Holds no permission sets.')).toBeInTheDocument();
  });

  it('disables the search and explains why when the directory cannot be read', () => {
    render(
      <UserAccess
        assignments={assignments}
        directory={{ users: [], unavailable: 'Users could not be loaded.' }}
        options={options}
        rules={{}}
        sets={sets}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Search people')).toBeDisabled();
    expect(screen.getByText('Users could not be loaded.')).toBeInTheDocument();
  });

  it('moves through the matches with the arrow keys and takes one with Enter', () => {
    renderUserAccess();
    const field = screen.getByLabelText('Search people');
    fireEvent.change(field, { target: { value: 'a' } });
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(
      screen.getByText('Order operators · Assigned directly'),
    ).toBeInTheDocument();
  });
});
