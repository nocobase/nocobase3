// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});
import { PermissionSetEditor } from '../client/pages/permission-sets/editor.js';
import type { AuthorizationOptions } from '../client/authorization-client.js';
import type { Draft } from '../client/pages/permission-sets/types.js';
import {
  pageSubsection,
  sections,
  subsection,
  withSubsections,
} from './workspace-options.js';

const read = { value: 'read', label: 'Read' };
const view = { value: 'view', label: 'View' };
const options: AuthorizationOptions = {
  sections: withSubsections({
    administration: [
      subsection(
        'administration.authorization',
        'Authorization',
        [
          {
            type: 'settings',
            value: 'authorization.permission-sets',
            label: 'Permission sets',
            actions: [read],
          },
        ],
        { groups: [] },
      ),
    ],
  }),
  subjectTypes: [],
  recordAccess: [],
  collections: [],
};

const workspace: AuthorizationOptions = {
  ...options,
  sections: withSubsections({
    pages: [pageSubsection([{ value: 'orders', label: 'Orders' }])],
    business: [
      subsection('example.sales', 'Sales', [
        { type: 'business', value: 'orders', label: 'Orders', actions: [view] },
      ]),
      subsection('example.delivery', 'Delivery', [
        {
          type: 'business',
          value: 'shipments',
          label: 'Shipments',
          actions: [view],
        },
      ]),
    ],
    administration: options.sections[2].subsections,
  }),
};

function Location() {
  return <output data-testid='location'>{useLocation().search}</output>;
}

function Harness({
  resourceOptions = options,
  grants = [],
  url = '/',
  onChange,
}: {
  resourceOptions?: AuthorizationOptions;
  grants?: Draft['grants'];
  url?: string;
  onChange?: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    originalKey: 'staff',
    key: 'staff',
    title: 'Staff',
    grants,
  });
  return (
    <MemoryRouter initialEntries={[url]}>
      <PermissionSetEditor
        dirty={true}
        options={resourceOptions}
        draft={draft}
        busy={false}
        onChange={(next) => {
          onChange?.(next);
          setDraft(next);
        }}
        onClose={() => {}}
        onSave={(event) => {
          event.preventDefault();
          return Promise.resolve();
        }}
      />
      <Location />
    </MemoryRouter>
  );
}

function sidebar(): string[] {
  return [
    ...screen.getByRole('navigation', { name: 'Resource types' }).children,
  ].map((element) => element.textContent ?? '');
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

it('lists section headers, then one entry per subsection, without resource types', () => {
  render(<Harness resourceOptions={workspace} />);
  expect(sidebar()).toEqual([
    'Page permissions',
    'Pages',
    'Business permissions',
    'Sales',
    'Delivery',
    'Administration',
    'Authorization',
  ]);
  expect(screen.queryByText('Business features')).not.toBeInTheDocument();
});

it('marks each subsection holding a grant as configured', () => {
  render(
    <Harness
      resourceOptions={workspace}
      grants={[
        {
          id: 1,
          resource: { type: 'business', id: 'shipments' },
          actions: ['view'],
        },
        { id: 2, resource: { type: 'page', id: '*' }, actions: ['access'] },
      ]}
    />,
  );
  const shield = (name: string) =>
    within(screen.getByRole('button', { name, exact: true })).queryByRole(
      'img',
      { name: 'Configured in this set' },
    );
  expect(shield('Pages')).not.toBeNull();
  expect(shield('Delivery')).not.toBeNull();
  expect(shield('Sales')).toBeNull();
  expect(shield('Authorization')).toBeNull();
});

it('keeps the selected subsection in the URL', () => {
  const { unmount } = render(<Harness resourceOptions={workspace} />);
  expect(screen.getByRole('button', { name: 'Pages' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
  expect(screen.getByTestId('location')).toHaveTextContent(
    '?section=example.delivery',
  );
  unmount();
  render(
    <Harness resourceOptions={workspace} url='/?section=example.delivery' />,
  );
  expect(screen.getByRole('button', { name: 'Delivery' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(screen.getByRole('group', { name: 'Shipments' })).toBeVisible();
  expect(
    screen.queryByRole('group', { name: 'Orders' }),
  ).not.toBeInTheDocument();
});

it('edits page entry independently from a business resource with the same ID', () => {
  let current: Draft | undefined;
  render(
    <Harness
      resourceOptions={workspace}
      grants={[
        {
          id: 1,
          resource: { type: 'business', id: 'orders' },
          actions: ['view'],
        },
      ]}
      onChange={(next) => {
        current = next;
      }}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Pages', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  expect(
    screen
      .getAllByRole('group', { name: 'Orders' })[0]
      .querySelectorAll('button'),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Sales', exact: true }));
  expect(screen.getByRole('button', { name: 'Orders: View' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Pages', exact: true }));
  const access = screen.getByRole('button', { name: 'Orders: Access' });
  expect(access).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(access);
  expect(
    current?.grants.find((grant) => grant.resource.type === 'page')?.actions,
  ).toEqual(['access']);
  expect(
    current?.grants.find((grant) => grant.resource.type === 'business')
      ?.actions,
  ).toEqual(['view']);
  fireEvent.click(access);
  expect(
    current?.grants.find((grant) => grant.resource.type === 'page'),
  ).toBeUndefined();
  expect(
    current?.grants.find((grant) => grant.resource.type === 'business')
      ?.actions,
  ).toEqual(['view']);
});

it('keeps empty page and business sections discoverable with development guidance', () => {
  render(
    <Harness
      resourceOptions={{
        ...options,
        sections: withSubsections({
          pages: [pageSubsection()],
          administration: options.sections[2].subsections,
        }),
      }}
    />,
  );
  expect(sidebar()).toEqual([
    'Page permissions',
    'Page permissions',
    'Business permissions',
    'Business permissions',
    'Administration',
    'Authorization',
  ]);
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Page permissions' })[0],
  );
  expect(screen.getByText(/No pages requiring authorization/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Business permissions' }));
  expect(
    screen.getByText(/No business permissions have been defined/),
  ).toBeVisible();
  expect(screen.queryByText(/Try telling AI:/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('img', { name: 'Configured in this set' }),
  ).not.toBeInTheDocument();
});

it('keeps an empty workspace on the first placeholder', () => {
  render(<Harness resourceOptions={{ ...options, sections }} />);
  expect(screen.getByText(/No pages requiring authorization/)).toBeVisible();
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
