// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  resolveAppClientContributions,
  defineSettingsRoutes,
} from '@nocobase/app-client/plugins';
import routes from '../client/routes.js';
import { RestrictionRulesPanel } from '../client/pages/restriction-rules-panel.js';
import {
  englishRuntime,
  renderPanel,
  translate,
  withSubsections,
} from './helpers.js';

const client = vi.hoisted(() => ({
  listRestrictionRules: vi.fn(() => Promise.resolve([])),
  listRestrictionRecords: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../client/api.js', () => ({
  useRestrictionRulesClient: () => client,
}));
it('contributes its page to the authorization group with its own namespace, gated by its settings item', () => {
  const result = resolveAppClientContributions([
    { packageName: '@nocobase/app-plugin-authz-restriction-rules', routes },
    {
      packageName: '@nocobase/app-plugin-authorization',
      routes: defineSettingsRoutes([
        {
          name: 'authorization',
          path: '/authorization',
          navigation: { title: 'Authorization' },
          children: [],
        },
      ]),
    },
  ]);
  expect(result.settings[0]).toMatchObject({
    id: 'restriction-rules',
    path: '/settings/authorization/restriction-rules',
    packageName: '@nocobase/app-plugin-authz-restriction-rules',
    groupId: 'authorization',
    authz: {
      resource: { type: 'settings', id: 'authorization.restriction-rules' },
      action: 'read',
    },
  });
});

it('disables creation and ignores a new-rule URL when no resource can take a restriction rule', async () => {
  const runtime = await englishRuntime();
  renderPanel(
    runtime,
    <RestrictionRulesPanel
      options={{
        sections: withSubsections({}),
        subjectTypes: [],
        collections: [],
        recordAccess: [],
      }}
    />,
    '/?new=1',
  );
  expect(
    await screen.findByText(translate(runtime, 'restrictionRules.noResources')),
  ).toBeVisible();
  expect(
    screen.getByRole('button', {
      name: translate(runtime, 'restrictionRules.create'),
    }),
  ).toBeDisabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('database.collection')).not.toBeInTheDocument();
  expect(
    screen.queryByPlaceholderText('read, create, update'),
  ).not.toBeInTheDocument();
});
