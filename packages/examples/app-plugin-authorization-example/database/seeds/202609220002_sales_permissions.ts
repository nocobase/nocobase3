import { salesRecords } from '../../server/sales-records.js';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { label } from '../../catalog.js';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { MEMBERS, PROJECTS, QUOTES, ORDERS } from '../../catalog.js';
const seed: SeedDefinition = defineSeed({
  name: '202609220002_sales_permissions',
  transaction: true,
  async run({ query }) {
    if (await query.selectFrom(MEMBERS).select('id').executeTakeFirst()) return;
    const now = new Date();
    const timestamps = { createdAt: now, updatedAt: now };
    const password = await hashPassword('AuthzExample123!');
    const users: Record<string, string> = {};
    for (const [key, title, region, scope, edit] of [
      ['assistant', 'Alex Chen', 'North', '', false],
      ['engineer', 'Morgan Lee', 'North', 'region', true],
      ['manager', 'Robin Lin', 'South', 'own', true],
      ['delivery', 'Casey Wu', 'North', 'region', false],
    ] as const) {
      const id = randomUUID();
      users[key] = id;
      const username = `sales_${key}`;
      await query
        .insertInto('user')
        .values({
          id,
          username,
          name: title,
          email: `${username}@example.test`,
          emailVerified: true,
          ...timestamps,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          issuer: 'local:credential',
          accountId: id,
          providerId: 'credential',
          userId: id,
          password,
          ...timestamps,
        })
        .execute();
      await query.insertInto(MEMBERS).values({ id, region }).execute();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: randomUUID(),
          key: `example-sales-${key}`,
          title: encodeAuthorizationTitle(label(`roles.${key}`)),
          grants: JSON.stringify(
            key === 'delivery'
              ? [
                  {
                    resource: {
                      type: 'resource',
                      id: 'example.sales.orders',
                    },
                    actions: [{ action: 'view' }, { action: 'deliver' }],
                  },
                ]
              : [
                  {
                    resource: {
                      type: 'resource',
                      id: 'example.sales.projects',
                    },
                    actions: (edit ? ['view', 'edit'] : ['view']).map(
                      (action) => ({
                        action,
                        ...(scope
                          ? {
                              policy: {
                                type: 'resource',
                                projects:
                                  scope === 'own'
                                    ? 'recordsIOwn'
                                    : `example.sales.${scope}`,
                              },
                            }
                          : {}),
                      }),
                    ),
                  },
                  {
                    resource: {
                      type: 'resource',
                      id: 'example.sales.quotes',
                    },
                    actions: (key === 'engineer'
                      ? ['view', 'edit', 'submit']
                      : ['view']
                    ).map((action) => ({
                      action,
                      ...(scope
                        ? {
                            policy: {
                              type: 'resource',
                              quotes:
                                action === 'view' && key === 'engineer'
                                  ? 'allRecords'
                                  : action === 'submit'
                                    ? 'example.sales.prepared'
                                    : `example.sales.${scope}`,
                              ...(action === 'submit'
                                ? {
                                    projects:
                                      scope === 'own'
                                        ? 'recordsIOwn'
                                        : `example.sales.${scope}`,
                                  }
                                : {}),
                            },
                          }
                        : {}),
                    })),
                  },
                  {
                    resource: {
                      type: 'resource',
                      id: 'example.sales.orders',
                    },
                    actions: [{ action: 'view' }],
                  },
                ],
          ),
          ...timestamps,
        })
        .execute();
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: randomUUID(),
          subjectType: 'user',
          subjectId: id,
          permissionSetKey: `example-sales-${key}`,
          ...timestamps,
        })
        .execute();
    }
    const restrictionRuleIds: string[] = [];
    for (const [collection, business, scopeKey, actions] of [
      [PROJECTS, 'example.sales.projects', 'projects', ['view', 'edit']],
      [QUOTES, 'example.sales.quotes', 'quotes', ['view', 'edit', 'submit']],
      [ORDERS, 'example.sales.orders', 'orders', ['view', 'deliver']],
    ] as const) {
      await query
        .insertInto('authorizationDefaultAccessRules')
        .values({
          id: randomUUID(),
          resourceType: 'resource',
          resourceId: business,
          actions: JSON.stringify([
            ...actions.map((action) => ({
              action,
              scopeKey,
              scope: {
                type: 'database',
                recordAccess:
                  action === 'submit'
                    ? 'example.sales.prepared'
                    : scopeKey === 'projects'
                      ? 'recordsIOwn'
                      : 'example.sales.own',
              },
            })),
            ...(scopeKey === 'quotes'
              ? [
                  {
                    action: 'submit',
                    scopeKey: 'projects',
                    scope: {
                      type: 'database',
                      recordAccess: 'example.sales.region',
                    },
                  },
                ]
              : []),
          ]),
          ...timestamps,
        })
        .execute();
      const ruleId = randomUUID();
      restrictionRuleIds.push(ruleId);
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: ruleId,
          key: `example-public-${collection}`,
          title: encodeAuthorizationTitle(label('rules.public')),
          resourceType: 'resource',
          resourceId: business,
          actions: JSON.stringify([
            ...actions.map((action) => ({
              action,
              scopeKey,
              scope: { type: 'database', recordAccess: 'example.sales.public' },
            })),
            ...(scopeKey === 'quotes'
              ? [
                  {
                    action: 'submit',
                    scopeKey: 'projects',
                    scope: {
                      type: 'database',
                      recordAccess: 'example.sales.public',
                    },
                  },
                ]
              : []),
          ]),
          reason: null,
          ...timestamps,
        })
        .execute();
      for (const subjectId of Object.values(users))
        await query
          .insertInto('authorizationRestrictionRuleAssignments')
          .values({
            id: randomUUID(),
            restrictionRuleId: ruleId,
            subjectType: 'user',
            subjectId,
            createdAt: now,
          })
          .execute();
    }
    const deliveryRuleId = randomUUID();
    await query
      .insertInto('authorizationSharingRules')
      .values({
        id: deliveryRuleId,
        key: 'example-delivery-orders',
        title: encodeAuthorizationTitle(label('rules.delivery')),
        resourceType: 'resource',
        resourceId: 'example.sales.orders',
        actions: JSON.stringify([
          {
            action: 'view',
            scopeKey: 'orders',
            selection: {
              type: 'policy',
              policy: {
                type: 'database',
                recordAccess: 'example.sales.region',
              },
            },
          },
          {
            action: 'deliver',
            scopeKey: 'orders',
            selection: {
              type: 'policy',
              policy: {
                type: 'database',
                recordAccess: 'example.sales.region',
              },
            },
          },
        ]),
        reason: null,
        ...timestamps,
      })
      .execute();
    await query
      .insertInto('authorizationSharingRuleAssignments')
      .values({
        id: randomUUID(),
        sharingRuleId: deliveryRuleId,
        subjectType: 'user',
        subjectId: users.delivery,
        createdAt: now,
      })
      .execute();
    const sharingRuleId = randomUUID();
    await query
      .insertInto('authorizationSharingRules')
      .values({
        id: sharingRuleId,
        key: 'example-selected-projects',
        title: encodeAuthorizationTitle(label('rules.projects')),
        resourceType: 'resource',
        resourceId: 'example.sales.projects',
        actions: JSON.stringify([
          {
            action: 'view',
            scopeKey: 'projects',
            selection: {
              type: 'records',
              ids: ['project-2', 'project-3', 'project-4'],
            },
          },
        ]),
        reason: null,
        ...timestamps,
      })
      .execute();
    for (const subjectId of [users.assistant, users.engineer])
      await query
        .insertInto('authorizationSharingRuleAssignments')
        .values({
          id: randomUUID(),
          sharingRuleId,
          subjectType: 'user',
          subjectId,
          createdAt: now,
        })
        .execute();
    const records = salesRecords(users);
    await query.insertInto(PROJECTS).values(records.projects).execute();
    await query.insertInto(QUOTES).values(records.quotes).execute();
    await query.insertInto(ORDERS).values(records.orders).execute();
    await query
      .insertInto('authorizationExampleTeams')
      .values([
        { id: 'proposal', title: 'Proposal team', active: true },
        { id: 'delivery', title: 'Delivery team', active: true },
      ])
      .execute();
    for (const [key, name, teamId] of [
      ['proposal', 'Jamie Park', 'proposal'],
      ['dispatch', 'Taylor Reed', 'delivery'],
      ['coordinator', 'Jordan Kim', 'proposal'],
    ] as const) {
      const id = randomUUID();
      users[key] = id;
      const username = `sales_${key}`;
      await query
        .insertInto('user')
        .values({
          id,
          username,
          name,
          email: `${username}@example.test`,
          emailVerified: true,
          ...timestamps,
        })
        .execute();
      await query
        .insertInto('account')
        .values({
          id: randomUUID(),
          issuer: 'local:credential',
          accountId: id,
          providerId: 'credential',
          userId: id,
          password,
          ...timestamps,
        })
        .execute();
      await query.insertInto(MEMBERS).values({ id, region: 'North' }).execute();
      await query
        .insertInto('authorizationExampleTeamMembers')
        .values({ id: `${teamId}:${id}`, teamId, userId: id })
        .execute();
    }
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values([
        {
          id: 'example-coordinator-role',
          subjectType: 'user',
          subjectId: users.coordinator,
          permissionSetKey: 'example-sales-manager',
          ...timestamps,
        },
        {
          id: 'example-team:proposal',
          subjectType: 'example.sales.team',
          subjectId: 'proposal',
          permissionSetKey: 'example-sales-engineer',
          ...timestamps,
        },
        {
          id: 'example-team:delivery',
          subjectType: 'example.sales.team',
          subjectId: 'delivery',
          permissionSetKey: 'example-sales-delivery',
          ...timestamps,
        },
      ])
      .execute();
    await query
      .insertInto('authorizationSharingRuleAssignments')
      .values({
        id: 'example-team:delivery-sharing',
        sharingRuleId: deliveryRuleId,
        subjectType: 'example.sales.team',
        subjectId: 'delivery',
        createdAt: now,
      })
      .execute();
    for (const restrictionRuleId of restrictionRuleIds) {
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values(
          ['proposal', 'delivery'].map((team) => ({
            id: `example-team:${team}:${restrictionRuleId}`,
            restrictionRuleId,
            subjectType: 'example.sales.team',
            subjectId: team,
            createdAt: now,
          })),
        )
        .execute();
    }
    const handoverRuleId = randomUUID();
    await query
      .insertInto('authorizationSharingRules')
      .values({
        id: handoverRuleId,
        key: 'example-proposal-handover',
        title: encodeAuthorizationTitle(label('teams.handover')),
        resourceType: 'resource',
        resourceId: 'example.sales.quotes',
        actions: JSON.stringify([
          {
            action: 'submit',
            scopeKey: 'quotes',
            selection: { type: 'records', ids: ['quote-7'] },
          },
          {
            action: 'submit',
            scopeKey: 'projects',
            selection: { type: 'records', ids: ['project-3'] },
          },
        ]),
        reason: null,
        ...timestamps,
      })
      .execute();
    await query
      .insertInto('authorizationSharingRuleAssignments')
      .values({
        id: randomUUID(),
        sharingRuleId: handoverRuleId,
        subjectType: 'example.sales.team',
        subjectId: 'proposal',
        createdAt: now,
      })
      .execute();
  },
});
export default seed;
