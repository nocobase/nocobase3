import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const seed = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'nocobase/seed/demo-data.json'),
    'utf8',
  ),
);

const uniqueValues = (records: Array<Record<string, unknown>>, field: string) =>
  new Set(records.map((record) => record[field]));

describe('CRM demo seed contract', () => {
  it('uses a stable unique natural key for every seeded resource', () => {
    expect(uniqueValues(seed.accounts, 'name').size).toBe(seed.accounts.length);
    expect(uniqueValues(seed.contacts, 'email').size).toBe(
      seed.contacts.length,
    );
    expect(uniqueValues(seed.leads, 'email').size).toBe(seed.leads.length);
    expect(uniqueValues(seed.opportunities, 'name').size).toBe(
      seed.opportunities.length,
    );
    expect(uniqueValues(seed.activities, 'subject').size).toBe(
      seed.activities.length,
    );
  });

  it('resolves every declared cross-resource reference', () => {
    const accountNames = uniqueValues(seed.accounts, 'name');
    const contactEmails = uniqueValues(seed.contacts, 'email');
    const opportunityNames = uniqueValues(seed.opportunities, 'name');

    for (const contact of seed.contacts) {
      expect(accountNames.has(contact.accountName)).toBe(true);
    }
    for (const opportunity of seed.opportunities) {
      expect(accountNames.has(opportunity.accountName)).toBe(true);
    }
    for (const activity of seed.activities) {
      expect(opportunityNames.has(activity.opportunityName)).toBe(true);
      expect(contactEmails.has(activity.contactEmail)).toBe(true);
    }
  });

  it('covers the dashboard with multiple stages, statuses, and future tasks', () => {
    expect(
      uniqueValues(seed.opportunities, 'stage').size,
    ).toBeGreaterThanOrEqual(5);
    expect(uniqueValues(seed.leads, 'status').size).toBeGreaterThanOrEqual(5);
    expect(
      seed.activities.filter(
        (activity: { status: string }) => activity.status === 'planned',
      ),
    ).toHaveLength(5);
  });
});
