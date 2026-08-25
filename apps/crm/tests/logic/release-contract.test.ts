// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { verifyLiveAclContract } from '../../scripts/lib/acl-contract.mjs';
import { createReleaseContract } from '../../scripts/lib/release-contract.mjs';

const policy = {
  schemaVersion: 1,
  dataSourceKey: 'main',
  roles: [
    {
      name: 'r_agent_crm_sales',
      title: 'Agent CRM Sales',
      description: 'CRM sales role',
      allowConfigure: false,
      allowNewMenu: false,
      snippets: ['!app', '!pm', '!pm.*', '!ui.*'],
      globalActions: [],
      resources: [
        {
          name: 'agent_crm_leads',
          actions: [
            { name: 'view', scope: 'own', fieldPolicy: 'all' },
            { name: 'update', scope: 'own', fieldPolicy: 'all' },
          ],
        },
      ],
    },
  ],
};

describe('CRM release contract gate', () => {
  it('builds one deterministic contract from model and ACL source', () => {
    const prepared = createReleaseContract(path.resolve(process.cwd()));

    expect(prepared.contractSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      prepared.contract.model.collections.map(
        (collection: { name: string }) => collection.name,
      ),
    ).toEqual([
      'agent_crm_accounts',
      'agent_crm_contacts',
      'agent_crm_leads',
      'agent_crm_opportunities',
      'agent_crm_activities',
    ]);
    expect(
      prepared.contract.acl.roles.map((role: { name: string }) => role.name),
    ).toEqual(['r_agent_crm_manager', 'r_agent_crm_sales']);
  });

  it('accepts exact action, scope, and full-field readback', () => {
    const collections = new Map([
      [
        'agent_crm_leads',
        {
          name: 'agent_crm_leads',
          fields: [{ name: 'id' }, { name: 'ownerId' }],
        },
      ],
    ]);

    expect(
      verifyLiveAclContract(createAclRunner('own'), policy, collections),
    ).toEqual([{ name: 'r_agent_crm_sales', resources: 1, actions: 2 }]);
  });

  it('fails closed when an action scope drifts', () => {
    const collections = new Map([
      [
        'agent_crm_leads',
        {
          name: 'agent_crm_leads',
          fields: [{ name: 'id' }, { name: 'ownerId' }],
        },
      ],
    ]);

    expect(() =>
      verifyLiveAclContract(createAclRunner('all'), policy, collections),
    ).toThrow(
      'r_agent_crm_sales.agent_crm_leads.view scope is all, expected own',
    );
  });
});

function createAclRunner(scope: 'all' | 'own') {
  return (args: string[]) => {
    const command = args.join(' ');
    if (command.includes('acl roles get')) {
      return {
        data: {
          name: 'r_agent_crm_sales',
          title: 'Agent CRM Sales',
          description: 'CRM sales role',
          allowConfigure: false,
          allowNewMenu: false,
          snippets: ['!app', '!pm', '!pm.*', '!ui.*'],
          strategy: { actions: [] },
        },
      };
    }
    if (command.includes('acl data-sources roles get')) {
      return { data: { strategy: { actions: [] } } };
    }
    if (command.includes('data-source-resources get')) {
      return {
        data: {
          name: 'agent_crm_leads',
          usingActionsConfig: true,
          actions: [
            {
              name: 'view',
              fields: ['id', 'ownerId'],
              scopeId: 1,
              scope: { key: scope },
            },
            {
              name: 'update',
              fields: ['id', 'ownerId'],
              scopeId: 1,
              scope: { key: scope },
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  };
}
