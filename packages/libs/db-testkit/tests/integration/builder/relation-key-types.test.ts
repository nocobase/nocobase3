import { expect, it } from 'vitest';
import {
  describeIntegrationDatabases,
  listColumns,
  listForeignKeys,
  expectForeignKeyViolation,
} from '../helpers.js';

describeIntegrationDatabases('explicit relation column types', (context) => {
  it('reuses string scalar columns during create and alter without generating bigint columns', async () => {
    await context.builder.createCollection('typeAccounts', (c) =>
      c.string('account').primary().notNull(),
    );
    await context.builder.createCollection('typeProjects', (c) => {
      c.string('code').primary().notNull();
      c.string('ownerRef');
      c.belongsTo('owner', 'typeAccounts')
        .foreignKey('ownerRef')
        .targetKey('account')
        .constraints(true);
    });
    await context.builder.alterCollection('typeProjects', (c) => {
      c.string('reviewerRef');
      c.belongsTo('reviewer', 'typeAccounts')
        .foreignKey('reviewerRef')
        .targetKey('account')
        .constraints(true);
    });
    const columns = await listColumns(context, context.table('typeProjects'));
    expect(columns.map((c) => c.name).sort()).toEqual([
      'code',
      'owner_ref',
      'reviewer_ref',
    ]);
    expect(
      await listForeignKeys(context, context.table('typeProjects')),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'owner_ref', to: 'account' }),
        expect.objectContaining({ from: 'reviewer_ref', to: 'account' }),
      ]),
    );
    const accounts = context.database.repository('typeAccounts');
    const projects = context.database.repository('typeProjects');
    await accounts.createOne({ values: { account: 'account-string' } });
    await projects.createOne({
      values: {
        code: 'P',
        owner: { connect: { account: 'account-string' } },
        reviewer: { connect: { account: 'account-string' } },
      },
    });
    expect(await projects.findOne({ filter: { code: 'P' } })).toEqual({
      code: 'P',
      ownerRef: 'account-string',
      reviewerRef: 'account-string',
    });
    await expectForeignKeyViolation(
      context
        .db(context.table('typeProjects'))
        .insert({ code: 'bad', owner_ref: 'missing' }),
    );
  });
});
