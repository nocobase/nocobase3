import {
  defineCollectionMetadata,
  type CollectionMetadataDocument,
} from '@nocobase/db';

/**
 * Supplemental metadata for the external CRM connection.
 *
 * The CRM database is owned by another system: its tables, columns and
 * constraints are read from the database itself and never changed from here.
 * What the database cannot say — titles, descriptions, and which column is a
 * relation to which Collection — is declared in these documents and layered on
 * top of the inspected schema when a Collection is resolved. The Module store
 * that serves them is read-only at runtime; edit this file to change them.
 */
export const externalCrmMetadataSource = 'database/externalCrm/metadata.ts';

export const externalCrmMetadataDocuments: readonly CollectionMetadataDocument[] =
  [
    defineCollectionMetadata({
      version: 1,
      name: 'customers',
      title: 'CRM customers',
      description: 'Customers owned by the external CRM database.',
      fields: {
        email: { title: 'Email address' },
        displayName: { title: 'Display name' },
        createdAt: { title: 'Created at' },
      },
    }),
    defineCollectionMetadata({
      version: 1,
      name: 'orders',
      title: 'CRM orders',
      description: 'Orders synchronized by the external CRM database.',
      fields: {
        orderNo: { title: 'Order number' },
        totalAmount: { title: 'Total amount' },
        status: { title: 'Order status' },
        placedAt: { title: 'Placed at' },
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
