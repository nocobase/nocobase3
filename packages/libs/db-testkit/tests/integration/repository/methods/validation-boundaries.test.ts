import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases(
  'Repository mutation validation boundaries',
  (context) => {
    it('validates structure without promising existence or checking the current version', async () => {
      await createDocumentationFixture(context);
      await seedDocumentationProjects(context, 'v');
      const projects = context.database.repository('projects');
      const before = await context.db(context.table('projects')).orderBy('id');
      for (const [id, ifVersion, code] of [
        ['missing', 1, 'RECORD_NOT_FOUND'],
        ['v-a', 99, 'VERSION_CONFLICT'],
      ] as const) {
        const options = {
          filter: { id },
          values: { name: 'Changed' },
          ifVersion,
        };
        expect(
          await projects.validateMutation({
            operation: 'updateOne',
            ...options,
          }),
        ).toEqual({ valid: true, errors: [] });
        await expect(projects.updateOne(options)).rejects.toMatchObject({
          code,
        });
      }
      expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
        before,
      );
    });

    it('reports the same stable diagnostic as execution and never applies valid scalar or nested writes', async () => {
      await createDocumentationFixture(context);
      const projects = context.database.repository('projects');
      const values = {
        id: 'A',
        name: 'New',
        tasks: { create: [{ id: 'T', title: 'Task' }] },
      };
      expect(
        await projects.validateMutation({ operation: 'createOne', values }),
      ).toEqual({ valid: true, errors: [] });
      expect(await context.db(context.table('projects'))).toEqual([]);
      expect(await context.db(context.table('tasks'))).toEqual([]);
      const invalid = { ...values, missing: 1 };
      const result = await projects.validateMutation({
        operation: 'createOne',
        values: invalid,
      });
      expect(result).toMatchObject({
        valid: false,
        errors: [{ code: 'FIELD_NOT_FOUND', field: 'missing' }],
      });
      await expect(
        projects.createOne({ values: invalid }),
      ).rejects.toMatchObject({
        code: result.errors[0]!.code,
        path: result.errors[0]!.path,
      });
      expect(await context.db(context.table('projects'))).toEqual([]);
      expect(await context.db(context.table('tasks'))).toEqual([]);
    });

    it('describes explicit non-id identities without requiring any data rows', async () => {
      await context.builder.createCollections([
        {
          name: 'children',
          definition: (c) => {
            c.string('code').primary().notNull();
            c.string('parentCode').nullable();
          },
        },
        {
          name: 'parents',
          definition: (c) => {
            c.string('code').primary().notNull();
            c.hasMany('children', 'children')
              .sourceKey('code')
              .foreignKey('parentCode');
          },
        },
      ]);
      for (const operation of ['createOne', 'updateOne'] as const) {
        const description = await context.database
          .repository('parents')
          .describeMutation({ operation });
        expect(description).toMatchObject({
          collection: 'parents',
          operation,
          relations: [
            {
              field: 'children',
              cardinality: 'many',
              uniqueFieldSets: [{ fields: ['code'], primary: true }],
            },
          ],
        });
      }
      expect(await context.db(context.table('parents'))).toEqual([]);
      expect(await context.db(context.table('children'))).toEqual([]);
    });
  },
);
