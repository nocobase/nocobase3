import {
  defineSeed,
  type QueryAdapter,
  type Row,
  type SeedDefinition,
} from '@nocobase/app-database';

interface SeededDemoFile {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
}

// Tests keep these published-source literals aligned with server Demo constants.
const COLLECTIONS = Object.freeze({
  profiles: 'filesDemoProfiles',
  profileAvatars: 'filesDemoProfileAvatars',
  orders: 'filesDemoOrders',
  orderAttachments: 'filesDemoOrderAttachments',
});
const PROFILE = Object.freeze({ id: 1, name: 'Demo Profile' });
const ORDER = Object.freeze({ id: 1, number: 'PO-DEMO-001' });
const AVATAR: Readonly<SeededDemoFile> = Object.freeze({
  id: 'files-demo-avatar',
  disk: 'local',
  key: 'files-demo/profile/avatar.svg',
  filename: 'avatar.svg',
  mimeType: 'image/svg+xml',
  size: 238,
  public: false,
});
const PUBLIC_ATTACHMENT: Readonly<SeededDemoFile> = Object.freeze({
  id: 'files-demo-public-note',
  disk: 'local',
  key: 'files-demo/orders/public-note.txt',
  filename: 'public-note.txt',
  mimeType: 'text/plain',
  size: 39,
  public: true,
});
const PRIVATE_ATTACHMENT: Readonly<SeededDemoFile> = Object.freeze({
  id: 'files-demo-private-document',
  disk: 'local',
  key: 'files-demo/orders/private-document.json',
  filename: 'private-document.json',
  mimeType: 'application/json',
  size: 54,
  public: false,
});
const SEEDED_AT = '2026-08-27 00:00:00.000';

const seed: SeedDefinition = defineSeed({
  name: '202608270002_seed_files_demo',

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
    await insertIfMissing(
      query,
      COLLECTIONS.profileAvatars,
      'id',
      toSeededFile(AVATAR, { profileId: PROFILE.id }),
    );
    await insertIfMissing(
      query,
      COLLECTIONS.orderAttachments,
      'id',
      toSeededFile(PUBLIC_ATTACHMENT, { orderId: ORDER.id }),
    );
    await insertIfMissing(
      query,
      COLLECTIONS.orderAttachments,
      'id',
      toSeededFile(PRIVATE_ATTACHMENT, { orderId: ORDER.id }),
    );
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

function toSeededFile(file: SeededDemoFile, scope: Row): Row {
  return {
    ...file,
    ...scope,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  };
}

export default seed;
