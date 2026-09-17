import {
  defineCollectionMetadata,
  type CollectionMetadataDocument,
} from '@nocobase/db';

export const externalCrmMetadata: readonly CollectionMetadataDocument[] = [
  defineCollectionMetadata({
    version: 1,
    name: 'customers',
    title: 'CRM customers',
    description: 'Customers owned by the external CRM database.',
    fields: {
      name: { title: 'Customer name' },
      email: { title: 'Email address' },
      company: { title: 'Company' },
      status: { title: 'CRM status' },
    },
    relations: {
      contacts: {
        type: 'hasMany',
        target: 'contacts',
        sourceKey: 'id',
        foreignKey: 'customerId',
        title: 'Contacts',
      },
    },
  }),
  defineCollectionMetadata({
    version: 1,
    name: 'contacts',
    title: 'CRM contacts',
    description: 'Contacts stored in the external CRM database.',
    fields: {
      customerId: { title: 'Customer ID' },
      name: { title: 'Contact name' },
      email: { title: 'Email address' },
      role: { title: 'Role' },
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
