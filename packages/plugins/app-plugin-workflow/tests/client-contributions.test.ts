import { describe, expect, it } from 'vitest';

import packageJson from '../package.json' with { type: 'json' };
import workflow, { WORKFLOW_ROUTE_IDS } from '../client/index.js';
import routes from '../client/routes.js';

describe('workflow client contributions', () => {
  it('uses the explicit client plugin registration surface', () => {
    expect(packageJson).not.toHaveProperty('nocobase');
    expect(packageJson.exports).toHaveProperty('./client');
    expect(packageJson.publishConfig.exports).toHaveProperty('./client');
    expect(workflow().serviceProviders).toHaveLength(1);
  });

  it('keeps collection definitions internal to the plugin', () => {
    expect(packageJson.exports).not.toHaveProperty('./collections');
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      './collections',
    );
  });

  it('contributes workflow management settings and nested detail routes', () => {
    const settings = routes.find((route) => route.parent === 'settings');
    const appRoutes = routes.find((route) => route.parent === 'app');

    expect(settings?.routes[0]).toMatchObject({
      name: 'automation',
      path: '/automation',
      navigation: { title: 'Automation' },
      children: [
        {
          name: 'workflows',
          path: '/workflows',
          navigation: { title: 'Workflows' },
        },
        {
          name: 'workflow-runs',
          path: '/workflow-runs',
          navigation: { title: 'Workflow runs' },
        },
      ],
    });
    expect(settings?.routes[0]).toHaveProperty('navigation.icon');
    expect(appRoutes?.routes.map(({ name, path }) => ({ name, path }))).toEqual(
      [
        {
          name: 'workflow-detail',
          path: '/settings/automation/workflows/:workflowId',
        },
        {
          name: 'workflow-run-detail',
          path: '/settings/automation/workflow-runs/:runId',
        },
      ],
    );
    expect(WORKFLOW_ROUTE_IDS).toEqual({
      workflowDetail: '@nocobase/app-plugin-workflow:workflow-detail',
      workflowRunDetail: '@nocobase/app-plugin-workflow:workflow-run-detail',
    });
  });
});
