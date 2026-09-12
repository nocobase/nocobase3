import type {
  CollectionDefinition,
  FieldDefinitionBuilder,
  RelationFieldBuilder,
  RelationFieldDefinition,
} from '../../../src/index.js';
import type { ForeignKeyConstraintDefinition } from '../../../src/collection/types.js';
import { describe, expect, it } from 'vitest';

const collectionDefinition: CollectionDefinition = {
  fields: [
    {
      name: 'companyId',
      type: 'integer',
    },
  ],
  constraints: [
    {
      type: 'foreignKey',
      fields: ['companyId'],
      references: {
        collection: 'companies',
        fields: ['id'],
      },
    },
  ],
};

const foreignKeyConstraint: ForeignKeyConstraintDefinition = {
  type: 'foreignKey',
  fields: ['companyId'],
  references: {
    collection: 'companies',
    fields: ['id'],
  },
};

function assertFieldReferenceTypes(field: FieldDefinitionBuilder): void {
  field.references({
    collection: 'companies',
    field: 'id',
  });

  field.references({
    collection: 'companies',
    fields: ['id'],
  });

  field.references({
    collection: 'companies',
    // @ts-expect-error Field references use logical field names, not physical columns.
    columns: ['company_id'],
  });
}

function assertRelationBuilderTypes(relation: RelationFieldBuilder): void {
  relation.foreignKey('companyId');

  // @ts-expect-error Relation fields do not support scalar field references.
  relation.references({ collection: 'companies', field: 'id' });
}

const _validDefinitions = [collectionDefinition, foreignKeyConstraint];

const relationFieldDefinition: RelationFieldDefinition = {
  name: 'company',
  type: 'belongsTo',
  target: 'companies',
  foreignKey: 'companyId',
};

const _invalidForeignKeyConstraint: ForeignKeyConstraintDefinition = {
  type: 'foreignKey',
  fields: ['companyId'],
  references: {
    collection: 'companies',
    // @ts-expect-error Collection Builder references use logical field names, not physical columns.
    columns: ['company_id'],
  },
};

describe('CollectionBuilder logical DSL types', () => {
  it('keeps type-only logical name assertions out of runtime behavior', () => {
    expect(_validDefinitions).toHaveLength(2);
    expect(relationFieldDefinition.target).toBe('companies');
    expect(_invalidForeignKeyConstraint.references.collection).toBe(
      'companies',
    );
    expect(assertFieldReferenceTypes).toBeTypeOf('function');
    expect(assertRelationBuilderTypes).toBeTypeOf('function');
  });
});
