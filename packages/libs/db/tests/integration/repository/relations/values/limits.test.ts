import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';

describeIntegrationDatabases('Repository nested mutation limits', (context) => {
  async function schema(): Promise<void> {
    await context.builder.createCollection('mutationNodes', (c) => {
      c.string('code').primary().notNull();
      c.string('parentCode').nullable();
      c.hasMany('children', 'mutationNodes')
        .sourceKey('code')
        .foreignKey('parentCode');
    });
  }

  it.each([3, 4])(
    'validates and executes a chain with %i relation levels',
    async (levels) => {
      await schema();
      const repository = context.database.repository('mutationNodes');
      const leaf = { code: 'leaf' };
      const third = { code: 'third', children: { create: leaf } };
      const second = { code: 'second', children: { create: third } };
      const root = { code: 'root', children: { create: second } };
      const values =
        levels === 3 ? root : { code: 'outer', children: { create: root } };
      const validation = await repository.validateMutation({
        operation: 'createOne',
        values,
      });
      expect(await context.db(context.table('mutationNodes'))).toEqual([]);
      if (levels === 3) {
        expect(validation).toEqual({ valid: true, errors: [] });
        await repository.createOne({ values });
        expect(
          await context
            .db(context.table('mutationNodes'))
            .select('code', 'parent_code')
            .orderBy('code'),
        ).toEqual([
          { code: 'leaf', parent_code: 'third' },
          { code: 'root', parent_code: null },
          { code: 'second', parent_code: 'root' },
          { code: 'third', parent_code: 'second' },
        ]);
      } else {
        expect(validation).toMatchObject({
          valid: false,
          errors: [{ code: 'MUTATION_LIMIT_EXCEEDED' }],
        });
        await expect(repository.createOne({ values })).rejects.toMatchObject({
          code: 'MUTATION_LIMIT_EXCEEDED',
          details: { maxDepth: 3, maxNodes: 100 },
        });
        expect(await context.db(context.table('mutationNodes'))).toEqual([]);
      }
    },
  );

  it.each([99, 100])(
    'counts the root relation plus %i child relation nodes',
    async (branches) => {
      await schema();
      const repository = context.database.repository('mutationNodes');
      const values = {
        code: 'root',
        children: {
          create: Array.from({ length: branches }, (_, i) => ({
            code: `branch-${i}`,
            children: { create: { code: `leaf-${i}` } },
          })),
        },
      };
      const validation = await repository.validateMutation({
        operation: 'createOne',
        values,
      });
      expect(await context.db(context.table('mutationNodes'))).toEqual([]);
      if (branches === 99) {
        expect(validation).toEqual({ valid: true, errors: [] });
        await repository.createOne({ values });
        expect(
          await context.db(context.table('mutationNodes')).select('code'),
        ).toHaveLength(199);
      } else {
        expect(validation).toMatchObject({
          valid: false,
          errors: [{ code: 'MUTATION_LIMIT_EXCEEDED' }],
        });
        await expect(repository.createOne({ values })).rejects.toMatchObject({
          code: 'MUTATION_LIMIT_EXCEEDED',
        });
        expect(await context.db(context.table('mutationNodes'))).toEqual([]);
      }
    },
  );
});
