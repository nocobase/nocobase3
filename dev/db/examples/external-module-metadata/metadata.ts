import {
  defineCollectionMetadata,
  type CollectionMetadataDocument,
} from '@nocobase/db';

export const externalMetadataSource =
  'examples/external-module-metadata/metadata.ts';

export const externalMetadataDocuments: readonly CollectionMetadataDocument[] =
  [
    defineCollectionMetadata({
      version: 1,
      name: 'customers',
      title: 'CRM customers',
      fields: {
        email: { title: 'Email address' },
        displayName: { title: 'Display name' },
      },
    }),
    defineCollectionMetadata({
      version: 1,
      name: 'orders',
      title: 'CRM orders',
      fields: {
        orderNo: { title: 'Order number' },
        totalAmount: { title: 'Total amount' },
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
