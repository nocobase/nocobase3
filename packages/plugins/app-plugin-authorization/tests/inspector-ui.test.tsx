import { selectOption } from './select-option.js';
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationDecision,
  AuthorizationOptions,
} from '../client/authorization-client.js';

const mocks = vi.hoisted(() => ({
  authz: {
    loadOptions: vi.fn(),
    listUsers: vi.fn(),
    inspect: vi.fn(),
  },
}));

vi.mock('../client/runtime.js', () => ({
  getAuthorizationClient: () => mocks.authz,
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import InspectorPage from '../client/pages/inspector-page.js';
import { translate } from './locale-harness.js';

const options: AuthorizationOptions = {
  plugins: [],
  resourceTypes: [
    {
      value: 'database.collection',
      label: 'Database collections',
      resources: [{ value: 'orders', label: 'Orders' }],
      actions: [
        { value: 'read', label: 'Read' },
        { value: 'update', label: 'Update' },
      ],
    },
  ],
  subjectTypes: [],
  collections: [],
  recordAccessPolicies: [],
};

const alice = {
  id: 'alice',
  name: 'Alice',
  username: 'alice',
  email: 'alice@example.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authz.loadOptions.mockResolvedValue(options);
  mocks.authz.listUsers.mockResolvedValue([alice]);
});

/** Fills in the three choices and asks, then settles the decision. */
async function ask(decision: AuthorizationDecision): Promise<void> {
  mocks.authz.inspect.mockResolvedValue(decision);
  render(<InspectorPage />);
  await screen.findByText(translate('inspector.empty'));

  await selectOption(
    screen.getByLabelText(translate('inspector.person')),
    'Alice · alice',
  );
  await selectOption(
    screen.getByLabelText(translate('editors.resource')),
    'Orders',
  );
  await selectOption(
    screen.getByLabelText(translate('inspector.action')),
    'Read',
  );
  fireEvent.click(
    screen.getByRole('button', { name: translate('inspector.inspect') }),
  );
  await waitFor(() => expect(mocks.authz.inspect).toHaveBeenCalled());
}

describe('the permission inspector page', () => {
  it('asks about the chosen person, resource and action', async () => {
    await ask({ effect: 'permit', reasons: [] });

    expect(mocks.authz.inspect).toHaveBeenCalledWith({
      subject: { type: 'user', id: 'alice' },
      resource: { type: 'database.collection', id: 'orders' },
      action: 'read',
    });
  });

  it('waits for all three choices before it asks anything', async () => {
    render(<InspectorPage />);

    expect(
      await screen.findByText(translate('inspector.empty')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: translate('inspector.inspect') }),
    ).toBeDisabled();
    expect(mocks.authz.inspect).not.toHaveBeenCalled();
  });

  it('names each reason and the plugin it came from', async () => {
    await ask({
      effect: 'permit',
      reasons: [
        {
          code: 'GRANTED',
          message: 'A permission set grants it',
          plugin: '@example/app-plugin-invented',
        },
        { code: 'CORE', message: 'The core said so' },
      ],
    });

    expect(
      await screen.findByText(translate('inspector.effects.permit')),
    ).toBeInTheDocument();
    expect(screen.getByText('A permission set grants it')).toBeInTheDocument();
    // Rendered generically: a plugin nothing here has heard of names itself.
    expect(
      screen.getByText(
        new RegExp(
          translate('inspector.reasonFrom', {
            plugin: '@example/app-plugin-invented',
          }),
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(translate('inspector.reasonFromCore'))),
    ).toBeInTheDocument();
  });

  it('reports a denial as it was given', async () => {
    await ask({
      effect: 'deny',
      reasons: [{ code: 'NO_GRANT', message: 'Nothing grants it' }],
    });

    expect(
      await screen.findByText(translate('inspector.effects.deny')),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing grants it')).toBeInTheDocument();
  });

  it('shows the conditions of a conditional decision rather than reading them', async () => {
    await ask({
      effect: 'conditional',
      conditions: { type: 'filter', field: 'ownerId' },
      reasons: [{ code: 'SCOPED', message: 'Records the person owns' }],
    });

    expect(
      await screen.findByText(translate('inspector.effects.conditional')),
    ).toBeInTheDocument();
    expect(screen.getByText(/"field": "ownerId"/)).toBeInTheDocument();
  });
});
