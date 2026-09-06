import {
  defineCollectionMetadata,
  type CollectionMetadataDocument,
} from '../../../src/index.js';

export const externalCrmMetadataSource =
  'tests/fixtures/metadata/external-crm.ts';

export const externalCrmMetadataDocuments: readonly CollectionMetadataDocument[] =
  [
    defineCollectionMetadata({
      version: 1,
      name: 'customers',
      title: 'CRM customers',
      description: 'Customers owned by an external CRM database.',
      fields: {
        email: { title: 'Email address' },
        displayName: { title: 'Display name' },
      },
    }),
    defineCollectionMetadata({
      version: 1,
      name: 'orders',
      title: 'CRM orders',
      description: 'Orders synchronized by an external CRM database.',
      fields: {
        orderNo: { title: 'Order number' },
        totalAmount: { title: 'Total amount' },
        status: { title: 'Order status' },
      },
      relations: {
        customer: {
          type: 'belongsTo',
          target: 'customers',
          foreignKey: 'customerId',
          targetKey: 'id',
          title: 'Customer',
        },
      },
    }),
  ];
