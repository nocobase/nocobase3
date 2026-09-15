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

const { ResourceAccess } =
  await import('../client/pages/permission-sets/resource-access.js');
const { SetDiff } = await import('../client/pages/permission-sets/set-diff.js');
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

function chooseResource(name: string): void {
  fireEvent.change(screen.getByLabelText('Search resources'), {
    target: { value: name },
  });
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
}

describe('resource access', () => {
  function renderResourceAccess(): void {
    render(
      <ResourceAccess
        options={options}
        sets={sets}
        onBack={() => undefined}
        onOpen={() => undefined}
      />,
    );
  }

  it('shows nothing until a resource is chosen', () => {
    renderResourceAccess();
    expect(screen.getByText('No resource chosen yet')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('lists a row per set granting the chosen resource, with the kind\u2019s own actions as columns', () => {
    renderResourceAccess();
    chooseResource('Orders');

    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual(['Permission set', 'Create', 'Read', 'Update', 'Delete']);

    // Member grants articles alone, so it is not a row here.
    const rows = bodyRows();
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Root'),
      expect.stringContaining('Order operators'),
    ]);
    expect(screen.queryByText('Member')).toBeNull();

    const ops = within(rows[1] as HTMLElement);
    expect(ops.getByLabelText('Every record')).toBeInTheDocument();
    expect(ops.getByLabelText('Scoped records')).toBeInTheDocument();
    expect(ops.getAllByLabelText('Not granted')).toHaveLength(2);
  });

  it('marks an unrestricted set as a bypass across the row', () => {
    renderResourceAccess();
    chooseResource('Orders');
    const root = within(bodyRows()[0] as HTMLElement);
    expect(root.getAllByLabelText('Unrestricted')).toHaveLength(4);
  });

  it('opens the set it names', () => {
    const opened: string[] = [];
    render(
      <ResourceAccess
        options={options}
        sets={sets}
        onBack={() => undefined}
        onOpen={(set) => opened.push(set.key)}
      />,
    );
    chooseResource('Articles');
    fireEvent.click(screen.getByRole('button', { name: 'Member' }));
    expect(opened).toEqual(['member']);
  });

  it('returns to the empty state when the choice is cleared', () => {
    renderResourceAccess();
    chooseResource('Orders');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByText('No resource chosen yet')).toBeInTheDocument();
  });
});

describe('compare two sets', () => {
  function renderDiff(initialKey?: string): void {
    render(
      <SetDiff
        options={options}
        sets={sets}
        {...(initialKey === undefined ? {} : { initialKey })}
        onBack={() => undefined}
      />,
    );
  }

  it('opens on the set the administrator came from and shows only differing rows', () => {
    renderDiff('member');
    expect(screen.getByLabelText('First set')).toHaveValue('member');
    expect(screen.getByLabelText('Second set')).toHaveValue('root');

    fireEvent.change(screen.getByLabelText('Second set'), {
      target: { value: 'order-ops' },
    });
    // Member reads articles; order operators read and update orders and access the page.
    const rows = bodyRows().filter(
      (row) => row.querySelectorAll('td').length > 1,
    );
    expect(
      rows.map((row) =>
        [...row.querySelectorAll('td')]
          .slice(0, 2)
          .map((cell) => cell.textContent)
          .join(' '),
      ),
    ).toEqual(['Articles Read', 'Orders Read', 'Orders Update', 'Home Access']);
  });

  it('shows every row on the toggle, including the ones the two sets share', () => {
    renderDiff('member');
    fireEvent.change(screen.getByLabelText('Second set'), {
      target: { value: 'order-ops' },
    });
    const differing = bodyRows().length;
    fireEvent.click(screen.getByRole('button', { name: /All rows/ }));
    expect(bodyRows().length).toBeGreaterThanOrEqual(differing);
    expect(screen.getByRole('button', { name: /All rows/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('reports an empty state when the two sets grant the same thing', () => {
    const twin: PermissionSet = {
      ...member,
      key: 'member-twin',
      title: 'Twin',
    };
    render(
      <SetDiff
        options={options}
        sets={[member, twin]}
        onBack={() => undefined}
      />,
    );
    expect(
      screen.getByText(/These two sets grant exactly the same thing/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /All rows/ }));
    expect(
      bodyRows().filter((row) => /Articles/.test(row.textContent ?? '')),
    ).toHaveLength(1);
  });

  it('explains the bypass rather than comparing an unrestricted set grant by grant', () => {
    renderDiff('root');
    expect(
      screen.getByText('Root confers unrestricted access.'),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('Unrestricted').length).toBeGreaterThan(0);
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
