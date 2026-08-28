import {
  defineSeed,
  type QueryAdapter,
  type Row,
  type SeedDefinition,
} from '@nocobase/app-database';

// Tests keep these published-source literals aligned with server Demo constants.
const COLLECTIONS = Object.freeze({
  profiles: 'fileDemoProfiles',
  profileAvatars: 'fileDemoProfileAvatars',
  orders: 'fileDemoOrders',
  orderAttachments: 'fileDemoOrderAttachments',
});
const PROFILE = Object.freeze({ id: 1, name: 'Demo Profile' });
const ORDER = Object.freeze({ id: 1, number: 'PO-DEMO-001' });
const SEEDED_AT = '2026-08-27 00:00:00.000';

const seed: SeedDefinition = defineSeed({
  name: '202608270002_seed_file_demo',

  async run({ query }) {
    await insertIfMissing(query, COLLECTIONS.profiles, 'id', {
      ...PROFILE,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    });
    await insertIfMissing(query, COLLECTIONS.orders, 'id', {
      ...ORDER,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    });
  },
});

async function insertIfMissing(
  query: QueryAdapter,
  table: string,
  identityField: string,
  row: Row,
): Promise<void> {
  const exists = await query
    .selectFrom(table)
    .where(identityField, '=', row[identityField])
    .exists();
  if (!exists) {
    await query.insertInto(table).values(row).execute();
  }
}

export default seed;
