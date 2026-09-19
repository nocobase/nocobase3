import { describe, expect, it } from 'vitest';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';
import { validateRelationOptions } from '../../../src/collection/relation-contract.js';
import { CollectionRelationValidator } from '../../../src/collection/registry/relation-validator.js';

describe('explicit relation contracts', () => {
  it('validates relation key types independently of their field names', async () => {
    const target = {
      name: 'accounts',
      fields: [{ name: 'id', type: 'string' as const }],
    };
    const validator = new CollectionRelationValidator({
      get: async () => target,
      async *scan() {
        yield target;
      },
    });
    await expect(
      validator.validateCollection({
        name: 'projects',
        fields: [
          { name: 'account', type: 'bigInt' },
          {
            name: 'owner',
            type: 'belongsTo',
            target: 'accounts',
            foreignKey: 'account',
            targetKey: 'id',
          },
        ],
      }),
    ).rejects.toMatchObject({
      issues: [
        expect.objectContaining({
          message: expect.stringContaining('incompatible types'),
        }),
      ],
    });
    await expect(
      validator.validateCollection({
        name: 'projects',
        fields: [
          { name: 'account', type: 'string' },
          {
            name: 'owner',
            type: 'belongsTo',
            target: 'accounts',
            foreignKey: 'account',
            targetKey: 'id',
          },
        ],
      }),
    ).resolves.toBeUndefined();
  });
  it('does not supply sourceKey or targetKey even when fields named id exist', () => {
    expect(() =>
      validateRelationOptions({
        name: 'tasks',
        type: 'hasMany',
        target: 'tasks',
        foreignKey: 'projectCode',
      }),
    ).toThrow('sourceKey');
    expect(() =>
      validateRelationOptions({
        name: 'owner',
        type: 'belongsTo',
        target: 'users',
        foreignKey: 'ownerCode',
      }),
    ).toThrow('targetKey');
    expect(() =>
      validateRelationOptions({
        name: 'owner',
        type: 'belongsTo',
        target: 'users',
        targetKey: 'code',
      }),
    ).toThrow('foreignKey');
  });

  it('requires a column type instead of defaulting to bigint', async () => {
    const builder = new CollectionBuilder();
    await expect(
      builder.createCollection(
        'projects',
        (c) => {
          c.string('id').primary();
          c.belongsTo('owner', 'users')
            .foreignKey('ownerAccount')
            .targetKey('account');
        },
        { dryRun: true },
      ),
    ).rejects.toThrow('foreignKeyType');
    const result = await builder.createCollection(
      'projects',
      (c) => {
        c.string('id').primary();
        c.belongsTo('owner', 'users')
          .foreignKey('ownerAccount')
          .targetKey('account')
          .foreignKeyType('string');
      },
      { dryRun: true },
    );
    expect(result.schemaOperations?.[0]).toMatchObject({
      type: 'createTable',
      table: {
        columns: expect.arrayContaining([
          expect.objectContaining({
            name: 'owner_account',
            type: 'string',
            nullable: true,
          }),
        ]),
      },
    });
  });

  it('requires explicit referenced fields for physical foreign keys', async () => {
    const builder = new CollectionBuilder();
    await expect(
      builder.createCollection(
        'projects',
        (c) => {
          c.string('owner').references({ collection: 'users' });
        },
        { dryRun: true },
      ),
    ).rejects.toThrow('references.fields');
  });
});
