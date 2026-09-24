// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { PermissionSetEditor } from '../client/pages/permission-sets/editor.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import type { Draft } from '../client/pages/permission-sets/types.js';
import { sections } from './workspace-options.js';
const options: AuthorizationOptions = {
  sections,
  subjectTypes: [],
  recordAccess: [],
  collections: [],
  resourceTypes: [
    {
      value: 'settings',
      label: 'Admin settings',
      section: 'administration',
      groups: [{ value: 'administration', label: 'Authorization' }],
      actions: [{ value: 'read', label: 'Read' }],
      resources: [
        {
          value: 'authorization.permission-sets',
          label: 'Permission sets',
          group: 'administration',
        },
      ],
    },
  ],
};
function Harness({
  resourceOptions = options,
}: {
  resourceOptions?: AuthorizationOptions;
}) {
  const [draft, setDraft] = useState<Draft>({
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: [],
  });
  return (
    <PermissionSetEditor
      dirty={true}
      options={resourceOptions}
      draft={draft}
      busy={false}
      onChange={setDraft}
      onClose={() => {}}
      onSave={(event) => {
        event.preventDefault();
        return Promise.resolve();
      }}
    />
  );
}
describe('scope controls', () => {
  it('toggles simple permissions directly with no menu', () => {
    render(<Harness />);
    const button = screen.getByRole('button', {
      name: 'Permission sets: Read',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });
});

it('edits page entry independently from a business resource with the same ID', () => {
  const options: AuthorizationOptions = {
    sections,
    subjectTypes: [],
    recordAccess: [],
    collections: [],
    resourceTypes: [
      {
        value: 'business',
        label: 'Business',
        section: 'business',
        groups: [{ value: 'sales', label: 'Sales' }],
        actions: [{ value: 'view', label: 'View' }],
        resources: [{ value: 'orders', group: 'sales', label: 'Orders' }],
      },
      {
        value: 'page',
        label: 'Pages',
        section: 'pages',
        actions: [{ value: 'access', label: 'Access' }],
        resources: [{ value: 'orders', label: 'Orders' }],
      },
    ],
  };
  let current: Draft = {
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants: [
      {
        id: 1,
        resource: { type: 'business', id: 'orders' },
        actions: ['view'],
      },
    ],
  };
  function Editor() {
    const [draft, setDraft] = useState(current);
    return (
      <PermissionSetEditor
        dirty={true}
        options={options}
        draft={draft}
        busy={false}
        onChange={(next) => {
          current = next;
          setDraft(next);
        }}
        onClose={() => {}}
        onSave={async () => {}}
      />
    );
  }
  render(<Editor />);
  expect(
    screen.getByRole('button', { name: 'Pages', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  expect(
    screen
      .getAllByRole('group', { name: 'Orders' })[0]
      .querySelectorAll('button'),
  ).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Business', exact: true }),
  );
  expect(screen.getByRole('button', { name: 'Orders: View' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pages', exact: true }));
  const access = screen.getByRole('button', { name: 'Orders: Access' });
  expect(access).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(access);
  expect(
    current.grants.find((grant) => grant.resource.type === 'page')?.actions,
  ).toEqual(['access']);
  expect(
    current.grants.find((grant) => grant.resource.type === 'business')?.actions,
  ).toEqual(['view']);
  fireEvent.click(access);
  expect(
    current.grants.find((grant) => grant.resource.type === 'page'),
  ).toBeUndefined();
  expect(
    current.grants.find((grant) => grant.resource.type === 'business')?.actions,
  ).toEqual(['view']);
});

it('keeps empty page and business types discoverable with development guidance', () => {
  render(
    <Harness
      resourceOptions={{
        ...options,
        resourceTypes: [
          {
            value: 'page',
            label: 'Pages',
            section: 'pages',
            actions: [],
            resources: [],
          },
          {
            value: 'business',
            label: 'Business features',
            section: 'business',
            actions: [],
            resources: [],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('Page permissions')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Pages' })).toBeVisible();
  expect(screen.getByText(/No pages requiring authorization/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Business features' }));
  expect(
    screen.getByText(/No business permissions have been defined/),
  ).toBeVisible();
  expect(screen.queryByText(/Try telling AI:/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('img', { name: 'Configured in this set' }),
  ).not.toBeInTheDocument();
});

it('distinguishes empty search results from missing business permission development', () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search resources' }), {
    target: { value: 'missing' },
  });
  expect(
    screen.queryByText(/No business permissions have been defined/),
  ).not.toBeInTheDocument();
});
