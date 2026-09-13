import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface SeedRecord {
  readonly collection: string;
  readonly identity: Readonly<Record<string, string>>;
  readonly record: Readonly<Record<string, string | number>>;
}

// datetime columns store the App's V1 temporal format, not a Date instance.
const createdAt = '2026-09-11T00:00:00.000';

// Demo business records. Files stay empty on purpose: they are uploaded from
// the example pages so the relation flow is exercised end to end.
const records: readonly SeedRecord[] = [
  {
    collection: 'fileExampleProfiles',
    identity: { id: 'profile-ada' },
    record: {
      id: 'profile-ada',
      name: 'Ada Chen',
      jobTitle: 'Product designer',
      createdAt,
      updatedAt: createdAt,
    },
  },
  {
    collection: 'fileExampleProfiles',
    identity: { id: 'profile-marco' },
    record: {
      id: 'profile-marco',
      name: 'Marco Li',
      jobTitle: 'Field engineer',
      createdAt,
      updatedAt: createdAt,
    },
  },
  {
    collection: 'fileExampleProfiles',
    identity: { id: 'profile-lin' },
    record: {
      id: 'profile-lin',
      name: 'Lin Xiao',
      jobTitle: 'Finance specialist',
      createdAt,
      updatedAt: createdAt,
    },
  },
  {
    collection: 'fileExampleOrders',
    identity: { id: 'order-so-2401' },
    record: {
      id: 'order-so-2401',
      number: 'SO-2026-2401',
      customerName: 'Aurora Studio',
      status: 'submitted',
      amountCents: 128000,
      createdAt,
      updatedAt: createdAt,
    },
  },
  {
    collection: 'fileExampleOrders',
    identity: { id: 'order-so-2402' },
    record: {
      id: 'order-so-2402',
      number: 'SO-2026-2402',
      customerName: 'Northwind Trading',
      status: 'draft',
      amountCents: 45900,
      createdAt,
      updatedAt: createdAt,
    },
  },
  {
    collection: 'fileExampleOrders',
    identity: { id: 'order-so-2403' },
    record: {
      id: 'order-so-2403',
      number: 'SO-2026-2403',
      customerName: 'Harbor Logistics',
      status: 'archived',
      amountCents: 780000,
      createdAt,
      updatedAt: createdAt,
    },
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609110001_seed_file_example_business',
  transaction: true,
  async run({ query }) {
    for (const { collection, identity, record } of records) {
      let lookup = query.selectFrom(collection).selectAll();
      for (const [field, value] of Object.entries(identity))
        lookup = lookup.where(field, '=', value);
      if (!(await lookup.executeTakeFirst()))
        await query.insertInto(collection).values(record).execute();
    }
  },
});

export default seed;
