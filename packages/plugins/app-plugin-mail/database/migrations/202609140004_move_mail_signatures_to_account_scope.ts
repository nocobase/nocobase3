import {
  defineMigration,
  type MigrationDefinition,
  type Row,
} from '@nocobase/db';

interface IdentityMigrationRow extends Row {
  id: string;
  accountId: string;
  primaryForAccountId?: string | null;
}

interface SignatureMigrationRow extends Row {
  id: string;
  accountId?: string | null;
  identityId: string;
  name: string;
  defaultForIdentityId?: string | null;
  defaultForAccountId?: string | null;
  createdAt: string;
}

const ACCOUNT_FOREIGN_KEY = 'mail_signatures_account_fk';
const ACCOUNT_NAME_UNIQUE = 'mail_signatures_account_name_unique';
const ACCOUNT_DEFAULT_UNIQUE = 'mail_signatures_default_account_unique';

const migration: MigrationDefinition = defineMigration({
  name: '202609140004_move_mail_signatures_to_account_scope',

  async up({ builder, query }) {
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.uuid('accountId', { nullable: true });
      collection.uuid('defaultForAccountId');
    });

    const identities = await query
      .selectFrom<IdentityMigrationRow>('mailIdentities')
      .select(['id', 'accountId', 'primaryForAccountId'])
      .execute<IdentityMigrationRow>();
    const identitiesById = new Map(
      identities.map((identity) => [identity.id, identity]),
    );
    const signatures = await query
      .selectFrom<SignatureMigrationRow>('mailSignatures')
      .select(['id', 'identityId', 'name', 'defaultForIdentityId', 'createdAt'])
      .execute<SignatureMigrationRow>();

    const migratedSignatures: SignatureMigrationRow[] = [];
    for (const signature of signatures) {
      const identity = identitiesById.get(signature.identityId);
      if (!identity) {
        throw new Error(
          `Cannot move mail signature "${signature.id}" because its sending identity is missing.`,
        );
      }
      await query
        .updateTable<SignatureMigrationRow>('mailSignatures')
        .set({ accountId: identity.accountId })
        .where('id', '=', signature.id)
        .execute();
      migratedSignatures.push({
        ...signature,
        accountId: identity.accountId,
      });
    }

    const duplicateIds = duplicateSignatureIds(
      migratedSignatures,
      identitiesById,
    );
    if (duplicateIds.length > 0) {
      await query
        .deleteFrom<SignatureMigrationRow>('mailSignatures')
        .where('id', 'in', duplicateIds)
        .execute();
    }

    const survivingSignatures = migratedSignatures.filter(
      (signature) => !duplicateIds.includes(signature.id),
    );
    if (survivingSignatures.length > 0) {
      const survivingIds = survivingSignatures.map((signature) => signature.id);
      await query
        .updateTable<SignatureMigrationRow>('mailSignatures')
        .set({ defaultForAccountId: null })
        .where('id', 'in', survivingIds)
        .execute();

      for (const accountSignatures of groupByAccount(survivingSignatures)) {
        const accountDefault = accountSignatures
          .filter((signature) => Boolean(signature.defaultForIdentityId))
          .sort((left, right) =>
            compareSignaturePreference(left, right, identitiesById),
          )[0];
        if (!accountDefault || !accountDefault.accountId) continue;
        await query
          .updateTable<SignatureMigrationRow>('mailSignatures')
          .set({ defaultForAccountId: accountDefault.accountId })
          .where('id', '=', accountDefault.id)
          .execute();
      }
    }

    await builder.alterCollection('mailSignatures', (collection) => {
      collection.alterField('accountId', { type: 'uuid', nullable: false });
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.unique(['accountId', 'name'], {
        name: ACCOUNT_NAME_UNIQUE,
      });
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.unique('defaultForAccountId', {
        name: ACCOUNT_DEFAULT_UNIQUE,
      });
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.foreignKey('accountId', {
        name: ACCOUNT_FOREIGN_KEY,
        references: {
          collection: 'mailAccounts',
          fields: ['id'],
        },
        onDelete: 'cascade',
      });
    });
  },

  async down({ builder, query }) {
    const signatures = await query
      .selectFrom<SignatureMigrationRow>('mailSignatures')
      .select(['id', 'identityId', 'defaultForAccountId'])
      .execute<SignatureMigrationRow>();
    const accountDefaults = signatures.filter((signature) =>
      Boolean(signature.defaultForAccountId),
    );
    const defaultIdentityIds = [
      ...new Set(accountDefaults.map((signature) => signature.identityId)),
    ];
    if (defaultIdentityIds.length > 0) {
      await query
        .updateTable<SignatureMigrationRow>('mailSignatures')
        .set({ defaultForIdentityId: null })
        .where('identityId', 'in', defaultIdentityIds)
        .execute();
      for (const signature of accountDefaults) {
        await query
          .updateTable<SignatureMigrationRow>('mailSignatures')
          .set({ defaultForIdentityId: signature.identityId })
          .where('id', '=', signature.id)
          .execute();
      }
    }

    await builder.alterCollection('mailSignatures', (collection) => {
      collection.dropConstraint(ACCOUNT_FOREIGN_KEY);
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.dropConstraint(ACCOUNT_NAME_UNIQUE);
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.dropConstraint(ACCOUNT_DEFAULT_UNIQUE);
    });
    await builder.alterCollection('mailSignatures', (collection) => {
      collection.dropFields('defaultForAccountId', 'accountId');
    });
  },
});

export default migration;

function duplicateSignatureIds(
  signatures: readonly SignatureMigrationRow[],
  identitiesById: ReadonlyMap<string, IdentityMigrationRow>,
): string[] {
  const grouped = new Map<string, SignatureMigrationRow[]>();
  for (const signature of signatures) {
    if (!signature.accountId) continue;
    const key = `${signature.accountId}\u0000${signature.name}`;
    const group = grouped.get(key) ?? [];
    group.push(signature);
    grouped.set(key, group);
  }

  const duplicateIds: string[] = [];
  for (const group of grouped.values()) {
    group
      .sort((left, right) =>
        compareSignaturePreference(left, right, identitiesById),
      )
      .slice(1)
      .forEach((signature) => duplicateIds.push(signature.id));
  }
  return duplicateIds;
}

function groupByAccount(
  signatures: readonly SignatureMigrationRow[],
): SignatureMigrationRow[][] {
  const grouped = new Map<string, SignatureMigrationRow[]>();
  for (const signature of signatures) {
    if (!signature.accountId) continue;
    const group = grouped.get(signature.accountId) ?? [];
    group.push(signature);
    grouped.set(signature.accountId, group);
  }
  return [...grouped.values()];
}

function compareSignaturePreference(
  left: SignatureMigrationRow,
  right: SignatureMigrationRow,
  identitiesById: ReadonlyMap<string, IdentityMigrationRow>,
): number {
  const leftIdentity = identitiesById.get(left.identityId);
  const rightIdentity = identitiesById.get(right.identityId);
  const leftIsPrimary = Boolean(
    leftIdentity && leftIdentity.primaryForAccountId === leftIdentity.accountId,
  );
  const rightIsPrimary = Boolean(
    rightIdentity &&
    rightIdentity.primaryForAccountId === rightIdentity.accountId,
  );
  const leftDefault = Boolean(left.defaultForIdentityId);
  const rightDefault = Boolean(right.defaultForIdentityId);
  const leftPriority = Number(leftDefault) * 2 + Number(leftIsPrimary);
  const rightPriority = Number(rightDefault) * 2 + Number(rightIsPrimary);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;

  const createdAtOrder = String(left.createdAt).localeCompare(
    String(right.createdAt),
  );
  return createdAtOrder || left.id.localeCompare(right.id);
}
