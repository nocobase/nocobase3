import type {
  CollectionDefinition,
  RelationMetadata,
} from '../../../src/index.js';

export interface CollectionScenarioDefinition {
  readonly name: string;
  readonly definition: CollectionDefinition;
}

export interface RelationScenarioDefinition {
  readonly collection: string;
  readonly name: string;
  readonly relation: RelationMetadata;
}

export interface IntegrationScenarioFixture {
  readonly name: string;
  readonly collections: readonly CollectionScenarioDefinition[];
  readonly relations: readonly RelationScenarioDefinition[];
}

export const commerceScenario: IntegrationScenarioFixture = {
  name: 'customers and their purchase orders',
  collections: [
    {
      name: 'customers',
      definition: {
        title: 'Customers',
        description: 'Customers that can place orders.',
        fields: [
          { name: 'id', type: 'increments', primaryKey: true },
          {
            name: 'email',
            type: 'string',
            length: 255,
            nullable: false,
            unique: true,
            title: 'Email',
          },
          {
            name: 'name',
            type: 'string',
            length: 128,
            nullable: false,
            title: 'Customer name',
          },
        ],
      },
    },
    {
      name: 'orders',
      definition: {
        title: 'Orders',
        description: 'Customer purchase orders.',
        fields: [
          { name: 'id', type: 'increments', primaryKey: true },
          {
            name: 'customerId',
            type: 'integer',
            nullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 12,
            scale: 2,
            nullable: false,
            defaultValue: 0,
            title: 'Order amount',
          },
          {
            name: 'status',
            type: 'string',
            length: 32,
            nullable: false,
            defaultValue: 'draft',
            title: 'Status',
          },
        ],
        indexes: [{ fields: ['status'] }],
      },
    },
  ],
  relations: [
    {
      collection: 'orders',
      name: 'customer',
      relation: {
        type: 'belongsTo',
        target: 'customers',
        foreignKey: 'customerId',
        targetKey: 'id',
        title: 'Customer',
      },
    },
  ],
};
