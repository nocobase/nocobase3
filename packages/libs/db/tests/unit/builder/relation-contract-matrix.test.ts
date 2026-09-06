import { describe, expect, it } from 'vitest';
import {
  validateCollectionMetadataDocument,
  type RelationFieldDefinition,
} from '../../../src/index.js';
import { CollectionBuilder } from '../../../src/collection/builder/builder.js';

const cases: Array<{
  type: RelationFieldDefinition['type'];
  missing: 'sourceKey' | 'targetKey' | 'foreignKey' | 'through' | 'otherKey';
}> = [
  { type: 'belongsTo', missing: 'foreignKey' },
  { type: 'belongsTo', missing: 'targetKey' },
  { type: 'hasOne', missing: 'sourceKey' },
  { type: 'hasOne', missing: 'foreignKey' },
  { type: 'hasMany', missing: 'sourceKey' },
  { type: 'hasMany', missing: 'foreignKey' },
  { type: 'belongsToMany', missing: 'sourceKey' },
  { type: 'belongsToMany', missing: 'targetKey' },
  { type: 'belongsToMany', missing: 'foreignKey' },
  { type: 'belongsToMany', missing: 'through' },
  { type: 'belongsToMany', missing: 'otherKey' },
];

describe('relation contract entry points', () => {
  it.each(cases)(
    'rejects $type without $missing in Builder and Metadata',
    async ({ type, missing }) => {
      const relation: RelationFieldDefinition = {
        name: 'related',
        type,
        target: 'targets',
        sourceKey: 'id',
        targetKey: 'id',
        foreignKey: 'targetCode',
        through: 'edges',
        otherKey: 'sourceCode',
      };
      delete relation[missing];
      const builder = new CollectionBuilder();
      await builder.createCollection(
        'targets',
        (c) => c.string('id').primary(),
        { dryRun: true },
      );
      await expect(
        builder.createCollection(
          'sources',
          (c) => {
            c.string('id').primary();
            c.string('targetCode');
            c[type]('related', 'targets', relation);
          },
          { dryRun: true },
        ),
      ).rejects.toMatchObject({
        code: 'COLLECTION_RELATION_INVALID',
        path: ['relations', 'related', missing],
      });
      const { name: _name, ...metadata } = relation;
      expect(() =>
        validateCollectionMetadataDocument({
          version: 1,
          name: 'sources',
          relations: { related: metadata },
        }),
      ).toThrow(`${missing} is required`);
    },
  );

  it.each(['', ' ', ' id', 'id '])(
    'rejects malformed explicit keys %j',
    async (key) => {
      const builder = new CollectionBuilder();
      await expect(
        builder.createCollection(
          'sources',
          (c) => {
            c.string('id').primary();
            c.string('owner');
            c.belongsTo('related', 'targets')
              .foreignKey('owner')
              .targetKey(key);
          },
          { dryRun: true },
        ),
      ).rejects.toMatchObject({
        code: 'COLLECTION_RELATION_INVALID',
        path: ['relations', 'related', 'targetKey'],
      });
      expect(() =>
        validateCollectionMetadataDocument({
          version: 1,
          name: 'sources',
          relations: {
            related: {
              type: 'belongsTo',
              target: 'targets',
              foreignKey: 'owner',
              targetKey: key,
            },
          },
        }),
      ).toThrow();
    },
  );
});
