import { describe, expect, it } from 'vitest';

import { normalizeRecordValues } from '@/features/crm/data';
import {
  getCrmResource,
  getCrmResourceFromPathname,
} from '@/features/crm/resource-config';

describe('CRM record write values', () => {
  it('resolves collection config for URL-backed child routes', () => {
    expect(getCrmResource('agent_crm_leads.edit')?.resource).toBe(
      'agent_crm_leads',
    );
    expect(getCrmResource('agent_crm_leads.show.edit')?.resource).toBe(
      'agent_crm_leads',
    );
    expect(
      getCrmResourceFromPathname('/crm/leads/show/123/edit')?.resource,
    ).toBe('agent_crm_leads');
  });

  it('converts foreign-key controls to NocoBase relation objects', () => {
    const config = getCrmResource('agent_crm_contacts')!;
    expect(
      normalizeRecordValues(
        {
          id: 99,
          name: 'Alice',
          accountId: '42',
          email: 'alice@example.com',
          createdAt: 'ignored',
        },
        config,
      ),
    ).toEqual({
      name: 'Alice',
      account: { id: 42 },
      email: 'alice@example.com',
    });
  });

  it('normalizes business numbers and supports clearing optional relations', () => {
    const config = getCrmResource('agent_crm_opportunities')!;
    expect(
      normalizeRecordValues(
        {
          name: 'Renewal',
          accountId: 7,
          amount: '120000.50',
          probability: '65',
          ownerId: null,
        },
        config,
      ),
    ).toEqual({
      name: 'Renewal',
      account: { id: 7 },
      amount: 120000.5,
      probability: 65,
      owner: null,
    });
  });
});
