import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases(
  'Repository required through payload',
  (context) => {
    it('requires payload for new edges and preserves existing required values', async () => {
      await context.builder.createCollections([
        {
          name: 'payloadMembers',
          definition: (c) => {
            c.increments('id');
            c.string('name');
          },
        },
        {
          name: 'payloadMemberships',
          definition: (c) => {
            c.increments('id');
            c.integer('teamId').notNull();
            c.integer('memberId').notNull();
            c.string('role').notNull();
            c.json('metadata').nullable();
            c.integer('version').notNull();
            c.optimisticLock('version');
          },
        },
        {
          name: 'payloadTeams',
          definition: (c) => {
            c.increments('id');
            c.string('name');
            c.belongsToMany('members', 'payloadMembers')
              .sourceKey('id')
              .targetKey('id')
              .through('payloadMemberships')
              .foreignKey('teamId')
              .otherKey('memberId');
          },
        },
      ]);
      const members = context.database.repository('payloadMembers');
      const teams = context.database.repository('payloadTeams');
      const memberships = context.database.repository('payloadMemberships');
      const member = await members.createOne({ values: { name: 'Alice' } });
      await expect(
        teams.createOne({
          values: {
            name: 'Rollback',
            members: { connect: { id: member.record.id } },
          },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION', field: 'role' });
      expect(await teams.count()).toBe(0);
      const team = await teams.createOne({
        values: {
          name: 'Success',
          members: {
            connect: {
              where: { id: member.record.id },
              through: { role: 'admin', metadata: { level: 1 } },
            },
          },
        },
      });
      const filter = { id: team.record.id as number };
      await teams.updateOne({
        filter,
        values: { members: { connect: { id: member.record.id } } },
      });
      expect(await memberships.count()).toBe(1);
      expect(
        await memberships.findMany({
          select: (s) => s.fields('role', 'version'),
        }),
      ).toEqual([{ role: 'admin', version: 1 }]);
      await teams.updateOne({
        filter,
        values: {
          members: {
            set: [
              { where: { id: member.record.id }, through: { role: 'reader' } },
            ],
          },
        },
      });
      expect(
        await memberships.findMany({
          select: (s) => s.fields('role', 'version'),
        }),
      ).toEqual([{ role: 'reader', version: 2 }]);
      await expect(
        teams.updateOne({
          filter,
          values: {
            members: {
              set: [
                { where: { id: member.record.id }, through: { role: null } },
              ],
            },
          },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
      const description = await teams.describeMutation({
        operation: 'createOne',
      });
      expect(description.relations[0]).toMatchObject({
        allowedActions: ['patch'],
        through: {
          requiredOnCreate: ['role'],
          writableFields: ['role', 'metadata'],
        },
      });
    });
  },
);
