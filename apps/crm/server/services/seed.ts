import { readFile } from 'node:fs/promises';

import type { DatabaseManager } from '@nocobase/database';
import type { Knex } from 'knex';

import type { CrmSeedResult } from './crm.js';

type SeedRecord = Record<string, unknown>;
type DemoSeed = {
  accounts: SeedRecord[];
  contacts: SeedRecord[];
  leads: SeedRecord[];
  opportunities: SeedRecord[];
  activities: SeedRecord[];
};

export type LegacyPreviewAdminReconcileStatus = 'updated' | 'unchanged';

const LEGACY_PREVIEW_ADMIN = {
  name: 'admin',
  username: 'admin',
  email: 'admin@nocobase.com',
} as const;

const PREVIEW_ADMIN = {
  name: 'nocobase',
  username: 'nocobase',
} as const;

export async function reconcileLegacyPreviewAdmin(
  database: DatabaseManager,
): Promise<LegacyPreviewAdminReconcileStatus> {
  return database.transaction(async (connection) => {
    const knex = await connection.client<Knex>();
    const current = (await knex('user')
      .select(['id', 'name', 'username', 'email', 'updatedAt'])
      .where('username', PREVIEW_ADMIN.username)
      .first()) as SeedRecord | undefined;
    if (current) return 'unchanged';

    const legacy = (await knex('user')
      .select(['id', 'name', 'username', 'email', 'updatedAt'])
      .where(LEGACY_PREVIEW_ADMIN)
      .first()) as (SeedRecord & { id: string }) | undefined;
    if (!legacy) return 'unchanged';

    const credentialAccount = (await knex('account')
      .select('id')
      .where({
        userId: legacy.id,
        issuer: 'local:credential',
        providerId: 'credential',
      })
      .first()) as { id: string } | undefined;
    if (!credentialAccount) return 'unchanged';

    await knex('user')
      .where('id', legacy.id)
      .update({
        ...PREVIEW_ADMIN,
        updatedAt: new Date().toISOString(),
      });
    const readback = (await knex('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', legacy.id)
      .first()) as SeedRecord | undefined;
    if (
      !readback ||
      readback.name !== PREVIEW_ADMIN.name ||
      readback.username !== PREVIEW_ADMIN.username ||
      readback.email !== LEGACY_PREVIEW_ADMIN.email
    ) {
      throw new Error('CRM preview administrator reconciliation failed.');
    }
    return 'updated';
  });
}

export async function reconcileCrmSeed(
  database: DatabaseManager,
  seedPath: string,
): Promise<CrmSeedResult> {
  const seed = parseSeed(await readFile(seedPath, 'utf8'));
  return database.transaction(async (connection) => {
    const knex = await connection.client<Knex>();
    const result: CrmSeedResult = { created: 0, updated: 0, unchanged: 0 };

    const accountIds = new Map<string, number>();
    for (const account of seed.accounts) {
      const reconciled = await reconcileRecord(knex, {
        table: 'agent_crm_accounts',
        unique: { name: requireString(account.name, 'account.name') },
        desired: pick(account, [
          'name',
          'industry',
          'tier',
          'status',
          'region',
          'website',
          'phone',
          'notes',
        ]),
      });
      accountIds.set(String(account.name), Number(reconciled.record.id));
      incrementResult(result, reconciled.status);
    }

    const contactIds = new Map<string, number>();
    for (const contact of seed.contacts) {
      const email = requireString(contact.email, 'contact.email');
      const reconciled = await reconcileRecord(knex, {
        table: 'agent_crm_contacts',
        unique: { email },
        desired: {
          ...pick(contact, [
            'name',
            'jobTitle',
            'decisionRole',
            'email',
            'phone',
            'notes',
          ]),
          accountId: requireMapValue(
            accountIds,
            contact.accountName,
            'contact.accountName',
          ),
        },
      });
      contactIds.set(email, Number(reconciled.record.id));
      incrementResult(result, reconciled.status);
    }

    for (let index = 0; index < seed.leads.length; index += 1) {
      const lead = seed.leads[index];
      const email = requireString(lead.email, 'lead.email');
      const reconciled = await reconcileRecord(knex, {
        table: 'agent_crm_leads',
        unique: { email },
        desired: {
          ...pick(lead, [
            'name',
            'company',
            'status',
            'source',
            'score',
            'email',
            'phone',
            'notes',
          ]),
          code: `LEAD-DEMO-${String(index + 1).padStart(4, '0')}`,
          ownerId: null,
        },
      });
      incrementResult(result, reconciled.status);
    }

    const opportunityIds = new Map<string, number>();
    for (const opportunity of seed.opportunities) {
      const name = requireString(opportunity.name, 'opportunity.name');
      const reconciled = await reconcileRecord(knex, {
        table: 'agent_crm_opportunities',
        unique: { name },
        desired: {
          ...pick(opportunity, [
            'name',
            'stage',
            'amount',
            'probability',
            'expectedCloseDate',
            'nextStep',
            'notes',
          ]),
          accountId: requireMapValue(
            accountIds,
            opportunity.accountName,
            'opportunity.accountName',
          ),
          ownerId: null,
        },
      });
      opportunityIds.set(name, Number(reconciled.record.id));
      incrementResult(result, reconciled.status);
    }

    for (const activity of seed.activities) {
      const subject = requireString(activity.subject, 'activity.subject');
      const reconciled = await reconcileRecord(knex, {
        table: 'agent_crm_activities',
        unique: { subject },
        desired: {
          ...pick(activity, ['subject', 'type', 'status', 'dueAt', 'notes']),
          opportunityId: optionalMapValue(
            opportunityIds,
            activity.opportunityName,
          ),
          contactId: optionalMapValue(contactIds, activity.contactEmail),
        },
      });
      incrementResult(result, reconciled.status);
    }

    return result;
  });
}

type ReconcileStatus = 'created' | 'updated' | 'unchanged';
type ReconcileResult = {
  status: ReconcileStatus;
  record: SeedRecord & { id: string | number };
};

async function reconcileRecord(
  knex: Knex,
  options: {
    table: string;
    unique: Record<string, unknown>;
    desired: Record<string, unknown>;
  },
): Promise<ReconcileResult> {
  const current = (await knex(options.table).where(options.unique).first()) as
    (SeedRecord & { id: string | number }) | undefined;
  const now = new Date().toISOString();
  if (!current) {
    const inserted = await knex(options.table)
      .insert({ ...options.desired, createdAt: now, updatedAt: now })
      .returning('id');
    const id = insertedId(inserted);
    return {
      status: 'created',
      record: { id, ...options.desired },
    };
  }

  if (matchesDesired(current, options.desired)) {
    return { status: 'unchanged', record: current };
  }

  await knex(options.table)
    .where('id', current.id)
    .update({ ...options.desired, updatedAt: now });
  return {
    status: 'updated',
    record: { ...current, ...options.desired, updatedAt: now },
  };
}

function parseSeed(content: string): DemoSeed {
  const value = JSON.parse(content) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CRM demo seed must be a JSON object.');
  }
  const record = value as Record<string, unknown>;
  return {
    accounts: requireArray(record.accounts, 'accounts'),
    contacts: requireArray(record.contacts, 'contacts'),
    leads: requireArray(record.leads, 'leads'),
    opportunities: requireArray(record.opportunities, 'opportunities'),
    activities: requireArray(record.activities, 'activities'),
  };
}

function requireArray(value: unknown, label: string): SeedRecord[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`CRM demo seed ${label} must be an array of objects.`);
  }
  return value;
}

function isRecord(value: unknown): value is SeedRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function pick(source: SeedRecord, fields: readonly string[]): SeedRecord {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(source, field))
      .map((field) => [field, source[field]]),
  );
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`CRM demo seed ${label} is required.`);
  }
  return value.trim();
}

function requireMapValue(
  values: Map<string, number>,
  key: unknown,
  label: string,
): number {
  const value = values.get(requireString(key, label));
  if (!value)
    throw new Error(`CRM demo seed ${label} does not match a record.`);
  return value;
}

function optionalMapValue(
  values: Map<string, number>,
  key: unknown,
): number | null {
  return typeof key === 'string' ? (values.get(key) ?? null) : null;
}

function matchesDesired(current: SeedRecord, desired: SeedRecord): boolean {
  return Object.entries(desired).every(([key, value]) =>
    equivalent(current[key], value),
  );
}

function equivalent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return left == null && right == null;
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber === rightNumber;
    }
  }
  const leftString = primitiveString(left);
  return leftString !== undefined && leftString === primitiveString(right);
}

function insertedId(value: unknown): string | number {
  const first: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof first === 'string' || typeof first === 'number') return first;
  if (
    isRecord(first) &&
    (typeof first.id === 'string' || typeof first.id === 'number')
  ) {
    return first.id;
  }
  throw new Error('CRM seed insert did not return an id.');
}

function primitiveString(value: unknown): string | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return undefined;
}

function incrementResult(result: CrmSeedResult, status: ReconcileStatus): void {
  result[status] += 1;
}
