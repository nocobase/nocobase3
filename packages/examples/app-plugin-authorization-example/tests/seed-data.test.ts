import { expect, it } from 'vitest';
import { createFixture } from './helpers.js';
import { permissionSets } from '../database/seed-data/permission-sets.js';
import { defaultAccessRules } from '../database/seed-data/default-access-rules.js';
import { sharingRules } from '../database/seed-data/sharing-rules.js';
import { restrictionRules } from '../database/seed-data/restriction-rules.js';
import { MEMBERS, PROJECTS, QUOTES, ORDERS } from '../catalog.js';

it('persists the fluent declarations and all per-table fixtures with their relationships', async () => {
  const fixture = await createFixture();
  try {
    const query = fixture.database.connection().query;
    const expectedCounts = {
      user: 7,
      account: 7,
      [MEMBERS]: 7,
      authorizationExampleTeams: 2,
      authorizationExampleTeamMembers: 3,
      authorizationPermissionSets: 4,
      authorizationPermissionSetAssignments: 7,
      authorizationDefaultAccessRules: 3,
      authorizationSharingRules: 3,
      authorizationSharingRuleAssignments: 5,
      authorizationRestrictionRules: 3,
      authorizationRestrictionRuleAssignments: 18,
      [PROJECTS]: 4,
      [QUOTES]: 11,
      [ORDERS]: 4,
    };
    for (const [table, count] of Object.entries(expectedCounts)) {
      const rows = await query.selectFrom(table).select('id').execute();
      expect({ table, count: rows.length }).toEqual({ table, count });
      if (table.endsWith('RuleAssignments')) {
        // SQLite does not enforce the 64-character ID columns used by other dialects.
        for (const row of rows)
          expect(String(row.id).length).toBeLessThanOrEqual(64);
      }
    }
    for (const set of permissionSets)
      expect(await fixture.authorization.permissionSets.get(set.key)).toEqual(
        set,
      );
    for (const [table, declarations] of [
      ['authorizationDefaultAccessRules', defaultAccessRules],
      ['authorizationSharingRules', sharingRules],
      ['authorizationRestrictionRules', restrictionRules],
    ] as const) {
      const rows = await query.selectFrom(table).selectAll().execute();
      for (const declaration of declarations) {
        const row = rows.find((entry) =>
          'key' in declaration
            ? entry.key === declaration.key
            : entry.resourceId === declaration.resource.id,
        )!;
        expect(JSON.parse(String(row.actions))).toEqual(declaration.actions);
        expect(row.resourceType).toBe(declaration.resource.type);
        expect(row.resourceId).toBe(declaration.resource.id);
      }
    }
  } finally {
    await fixture.database.destroy();
  }
});
