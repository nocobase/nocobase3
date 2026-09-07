import { defineSeed, type SeedDefinition } from '@nocobase/db';

// Stable example identities keep manual retries additive and preserve user edits.
// The runner wraps all five collections in one transaction.
const seed: SeedDefinition = defineSeed({
  name: '202609060001_repository_example_demo',
  transaction: true,
  async run({ query }) {
    const groups: {
      collection: string;
      records: Record<string, string | number>[];
    }[] = [
      {
        collection: 'repositoryExampleCustomers',
        records: [
          {
            id: 'demo-customer-1',
            name: 'Ada Chen',
            company: 'Northstar Studio',
            email: 'ada@northstar.example',
            status: 'active',
          },
          {
            id: 'demo-customer-2',
            name: 'Ben Lin',
            company: 'Harbor Retail',
            email: 'ben@harbor.example',
            status: 'active',
          },
          {
            id: 'demo-customer-3',
            name: 'Clara Wu',
            company: 'Cedar Labs',
            email: 'clara@cedar.example',
            status: 'lead',
          },
          {
            id: 'demo-customer-4',
            name: 'Daniel Xu',
            company: 'Orchard Design',
            email: 'daniel@orchard.example',
            status: 'inactive',
          },
        ],
      },
      {
        collection: 'repositoryExampleContacts',
        records: [
          {
            id: 'demo-contact-1',
            name: 'Eva Park',
            email: 'eva@northstar.example',
            phone: '+1-202-555-0101',
            customerId: 'demo-customer-1',
          },
          {
            id: 'demo-contact-2',
            name: 'Felix Liu',
            email: 'felix@northstar.example',
            phone: '+1-202-555-0102',
            customerId: 'demo-customer-1',
          },
          {
            id: 'demo-contact-3',
            name: 'Grace Zhou',
            email: 'grace@harbor.example',
            phone: '+1-202-555-0103',
            customerId: 'demo-customer-2',
          },
          {
            id: 'demo-contact-4',
            name: 'Henry Sun',
            email: 'henry@cedar.example',
            phone: '+1-202-555-0104',
            customerId: 'demo-customer-3',
          },
          {
            id: 'demo-contact-5',
            name: 'Iris Wang',
            email: 'iris@orchard.example',
            phone: '+1-202-555-0105',
            customerId: 'demo-customer-4',
          },
        ],
      },
      {
        collection: 'repositoryExampleProducts',
        records: [
          {
            id: 'demo-product-1',
            name: 'Mechanical Keyboard',
            sku: 'DEMO-KEYBOARD',
            unitPriceCents: 12900,
          },
          {
            id: 'demo-product-2',
            name: 'Wireless Mouse',
            sku: 'DEMO-MOUSE',
            unitPriceCents: 5900,
          },
          {
            id: 'demo-product-3',
            name: 'USB-C Dock',
            sku: 'DEMO-DOCK',
            unitPriceCents: 18900,
          },
          {
            id: 'demo-product-4',
            name: '27-inch Monitor',
            sku: 'DEMO-MONITOR',
            unitPriceCents: 32900,
          },
          {
            id: 'demo-product-5',
            name: 'Laptop Stand',
            sku: 'DEMO-STAND',
            unitPriceCents: 7900,
          },
          {
            id: 'demo-product-6',
            name: 'Webcam',
            sku: 'DEMO-WEBCAM',
            unitPriceCents: 9900,
          },
        ],
      },
      {
        collection: 'repositoryExampleOrders',
        records: [
          {
            id: 'demo-order-1',
            number: 'DEMO-SO-001',
            status: 'paid',
            customerId: 'demo-customer-1',
            version: 1,
          },
          {
            id: 'demo-order-2',
            number: 'DEMO-SO-002',
            status: 'confirmed',
            customerId: 'demo-customer-2',
            version: 1,
          },
          {
            id: 'demo-order-3',
            number: 'DEMO-SO-003',
            status: 'draft',
            customerId: 'demo-customer-3',
            version: 1,
          },
          {
            id: 'demo-order-4',
            number: 'DEMO-SO-004',
            status: 'cancelled',
            customerId: 'demo-customer-1',
            version: 1,
          },
        ],
      },
      {
        collection: 'repositoryExampleOrderItems',
        records: [
          {
            id: 'demo-item-1',
            orderId: 'demo-order-1',
            productId: 'demo-product-1',
            quantity: 2,
            unitPriceCents: 11900,
          },
          {
            id: 'demo-item-2',
            orderId: 'demo-order-1',
            productId: 'demo-product-2',
            quantity: 2,
            unitPriceCents: 5900,
          },
          {
            id: 'demo-item-3',
            orderId: 'demo-order-1',
            productId: 'demo-product-3',
            quantity: 1,
            unitPriceCents: 18900,
          },
          {
            id: 'demo-item-4',
            orderId: 'demo-order-2',
            productId: 'demo-product-4',
            quantity: 3,
            unitPriceCents: 32900,
          },
          {
            id: 'demo-item-5',
            orderId: 'demo-order-2',
            productId: 'demo-product-5',
            quantity: 3,
            unitPriceCents: 7900,
          },
          {
            id: 'demo-item-6',
            orderId: 'demo-order-3',
            productId: 'demo-product-6',
            quantity: 1,
            unitPriceCents: 9900,
          },
          {
            id: 'demo-item-7',
            orderId: 'demo-order-3',
            productId: 'demo-product-3',
            quantity: 1,
            unitPriceCents: 18900,
          },
          {
            id: 'demo-item-8',
            orderId: 'demo-order-4',
            productId: 'demo-product-1',
            quantity: 1,
            unitPriceCents: 12900,
          },
        ],
      },
    ];
    for (const { collection, records } of groups) {
      for (const record of records) {
        const existing = await query
          .selectFrom(collection)
          .select('id')
          .where('id', '=', record.id)
          .executeTakeFirst();
        if (!existing)
          await query.insertInto(collection).values(record).execute();
      }
    }
  },
});
export default seed;
