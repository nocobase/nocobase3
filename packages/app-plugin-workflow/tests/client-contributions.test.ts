import { describe, expect, it, vi } from 'vitest';
import type { AppClientRefineRegistry } from '@nocobase/app-client/plugins';
import type { AppClient } from '@nocobase/app-sdk';

import bootstrap from '../client/bootstrap.js';
import { WORKFLOW_ROUTE_IDS } from '../client/route-contracts.js';
import routes from '../client/routes.js';

const NS = '@nocobase/app-plugin-workflow';

describe('workflow client contributions', () => {
  it('owns stable workflow management routes', () => {
    expect(routes.map(({ name, path }) => ({ name, path }))).toEqual([
      { name: 'workflow-list', path: '/workflow/workflows' },
      {
        name: 'workflow-detail',
        path: '/workflow/workflows/:workflowId',
      },
      { name: 'workflow-run-list', path: '/workflow/runs' },
      {
        name: 'workflow-run-detail',
        path: '/workflow/runs/:runId',
      },
    ]);
    expect(WORKFLOW_ROUTE_IDS).toEqual({
      workflowDetail: '@nocobase/app-plugin-workflow:workflow-detail',
      workflowList: '@nocobase/app-plugin-workflow:workflow-list',
      workflowRunDetail: '@nocobase/app-plugin-workflow:workflow-run-detail',
      workflowRunList: '@nocobase/app-plugin-workflow:workflow-run-list',
    });
  });

  it('contributes the workflow navigation resources', () => {
    const addResources = vi.fn();
    const appClient: AppClient = {
      request: vi.fn<AppClient['request']>(),
    };
    const refine: AppClientRefineRegistry = {
      addLiveEventHandler: vi.fn(),
      addResources,
      setAccessControlProvider: vi.fn(),
      setAuditLogProvider: vi.fn(),
      setAuthProvider: vi.fn(),
      setChildren: vi.fn(),
      setDataProvider: vi.fn(),
      setI18nProvider: vi.fn(),
      setLiveProvider: vi.fn(),
      setNotificationProvider: vi.fn(),
      setOnLiveEvent: vi.fn(),
      setOptions: vi.fn(),
      setResources: vi.fn(),
      setRouterProvider: vi.fn(),
    };

    bootstrap({
      appClient,
      packageName: '@nocobase/app-plugin-workflow',
      refine,
      source: 'plugin',
    });

    expect(addResources).toHaveBeenCalledOnce();
    // Resources register before a language is known, so a label is a translation key plus the namespace to read it
    // from; the navigation resolves it as it renders.
    expect(addResources.mock.calls[0]?.[0]).toEqual([
      { name: 'workflow', meta: { label: 'nav.workflow', i18nNs: NS } },
      {
        name: 'workflow.workflows',
        list: '/workflow/workflows',
        meta: { label: 'nav.workflows', i18nNs: NS, parent: 'workflow' },
      },
      {
        name: 'workflow.runs',
        list: '/workflow/runs',
        meta: { label: 'nav.runs', i18nNs: NS, parent: 'workflow' },
      },
    ]);
  });
});
