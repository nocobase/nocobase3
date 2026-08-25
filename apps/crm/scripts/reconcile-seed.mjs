import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonOutput } from './lib/nb-cli.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const seedFile = path.join(appRoot, 'nocobase/seed/demo-data.json');
const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
const rawArgs = process.argv.slice(2);

const readFlagValue = (name, shortName) => {
  const equals = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = rawArgs.findIndex((arg) => arg === name || arg === shortName);
  return index >= 0 ? rawArgs[index + 1] : undefined;
};

const targetEnv = readFlagValue('--env', '-e');
const planOnly = rawArgs.includes('--plan');
const confirmCrossEnv = rawArgs.includes('--yes') || rawArgs.includes('-y');
const verifyIdempotent = rawArgs.includes('--verify-idempotent');

if (!targetEnv) {
  console.error(
    'Target env is required. Usage: pnpm seed:apply -- --env <name> [--yes] [--plan] [--verify-idempotent]',
  );
  process.exit(2);
}

const envArgs = ['--env', targetEnv, ...(confirmCrossEnv ? ['--yes'] : [])];

const runNb = (args) => {
  const command = `nb ${args.join(' ')}`;
  const result = spawnSync('nb', args, {
    cwd: appRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
  return parseJsonOutput(result.stdout, command);
};

const unwrapData = (payload) => {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object' || !('data' in current)) break;
    current = current.data;
  }
  return current;
};

const listUnique = (resource, key, value) => {
  const records = unwrapData(
    runNb([
      'api',
      'resource',
      'list',
      '--resource',
      resource,
      '--filter',
      JSON.stringify({ [key]: value }),
      '--page-size',
      '2',
      ...envArgs,
      '--json-output',
    ]),
  );
  if (!Array.isArray(records)) {
    throw new Error(`${resource} list did not return an array`);
  }
  if (records.length > 1) {
    throw new Error(
      `${resource}.${key}=${value} is not unique; refusing to seed`,
    );
  }
  return records[0];
};

const valuesEqual = (actual, expected) => {
  if (actual === expected) return true;
  if (
    actual === null ||
    actual === undefined ||
    expected === null ||
    expected === undefined
  ) {
    return false;
  }
  if (typeof actual === 'number' || typeof expected === 'number') {
    return Number(actual) === Number(expected);
  }
  return String(actual) === String(expected);
};

const changedFields = (record, values) =>
  Object.entries(values)
    .filter(([name, value]) => !valuesEqual(record?.[name], value))
    .map(([name]) => name);

const createRecord = (resource, values) =>
  unwrapData(
    runNb([
      'api',
      'resource',
      'create',
      '--resource',
      resource,
      '--values',
      JSON.stringify(values),
      ...envArgs,
      '--json-output',
    ]),
  );

const updateRecord = (resource, id, values, associationNames) =>
  unwrapData(
    runNb([
      'api',
      'resource',
      'update',
      '--resource',
      resource,
      '--filter-by-tk',
      String(id),
      '--values',
      JSON.stringify(values),
      ...associationNames.flatMap((name) => [
        '--update-association-values',
        name,
      ]),
      ...envArgs,
      '--json-output',
    ]),
  );

const upsertRecord = (
  stats,
  resource,
  key,
  values,
  writeValues = values,
  associationNames = [],
) => {
  const existing = listUnique(resource, key, values[key]);
  if (!existing) {
    createRecord(resource, writeValues);
    stats.created += 1;
  } else {
    const changes = changedFields(existing, values);
    if (changes.length > 0) {
      updateRecord(resource, existing.id, writeValues, associationNames);
      stats.updated += 1;
    } else {
      stats.converged += 1;
    }
  }
  const readback = listUnique(resource, key, values[key]);
  if (!readback) {
    throw new Error(`${resource}.${key}=${values[key]} was not persisted`);
  }
  const remaining = changedFields(readback, values);
  if (remaining.length > 0) {
    throw new Error(
      `${resource}.${key}=${values[key]} readback differs: ${remaining.join(', ')}`,
    );
  }
  return readback;
};

const withoutReferenceFields = (record, referenceFields) =>
  Object.fromEntries(
    Object.entries(record).filter(([name]) => !referenceFields.includes(name)),
  );

const indexBy = (records, field) =>
  new Map(records.map((record) => [record[field], record]));

const reconcileSeed = (label) => {
  console.log(`\n${label}`);
  const stats = { created: 0, updated: 0, converged: 0 };
  const owner = listUnique('users', 'username', seed.ownerUsername);
  if (!owner) {
    throw new Error(`Seed owner user ${seed.ownerUsername} does not exist`);
  }

  const accounts = seed.accounts.map((values) =>
    upsertRecord(stats, 'agent_crm_accounts', 'name', values),
  );
  const accountsByName = indexBy(accounts, 'name');

  const contacts = seed.contacts.map((record) => {
    const account = accountsByName.get(record.accountName);
    if (!account)
      throw new Error(`Unknown account reference ${record.accountName}`);
    const values = {
      ...withoutReferenceFields(record, ['accountName']),
      accountId: account.id,
    };
    const writeValues = {
      ...withoutReferenceFields(record, ['accountName']),
      account: { id: account.id },
    };
    return upsertRecord(
      stats,
      'agent_crm_contacts',
      'email',
      values,
      writeValues,
      ['account'],
    );
  });
  const contactsByEmail = indexBy(contacts, 'email');

  for (const record of seed.leads) {
    const values = {
      ...record,
      ownerId: owner.id,
    };
    upsertRecord(
      stats,
      'agent_crm_leads',
      'email',
      values,
      {
        ...record,
        owner: { id: owner.id },
      },
      ['owner'],
    );
  }

  const opportunities = seed.opportunities.map((record) => {
    const account = accountsByName.get(record.accountName);
    if (!account)
      throw new Error(`Unknown account reference ${record.accountName}`);
    const values = {
      ...withoutReferenceFields(record, ['accountName']),
      accountId: account.id,
      ownerId: owner.id,
    };
    const writeValues = {
      ...withoutReferenceFields(record, ['accountName']),
      account: { id: account.id },
      owner: { id: owner.id },
    };
    return upsertRecord(
      stats,
      'agent_crm_opportunities',
      'name',
      values,
      writeValues,
      ['account', 'owner'],
    );
  });
  const opportunitiesByName = indexBy(opportunities, 'name');

  for (const record of seed.activities) {
    const opportunity = opportunitiesByName.get(record.opportunityName);
    const contact = contactsByEmail.get(record.contactEmail);
    if (!opportunity) {
      throw new Error(
        `Unknown opportunity reference ${record.opportunityName}`,
      );
    }
    if (!contact)
      throw new Error(`Unknown contact reference ${record.contactEmail}`);
    const values = {
      ...withoutReferenceFields(record, ['opportunityName', 'contactEmail']),
      opportunityId: opportunity.id,
      contactId: contact.id,
    };
    const writeValues = {
      ...withoutReferenceFields(record, ['opportunityName', 'contactEmail']),
      opportunity: { id: opportunity.id },
      contact: { id: contact.id },
    };
    upsertRecord(
      stats,
      'agent_crm_activities',
      'subject',
      values,
      writeValues,
      ['opportunity', 'contact'],
    );
  }

  console.log(
    `  created=${stats.created} updated=${stats.updated} converged=${stats.converged}`,
  );
  return stats;
};

const counts = {
  agent_crm_accounts: seed.accounts.length,
  agent_crm_contacts: seed.contacts.length,
  agent_crm_leads: seed.leads.length,
  agent_crm_opportunities: seed.opportunities.length,
  agent_crm_activities: seed.activities.length,
};

console.log(`CRM demo seed ${seed.version} target: ${targetEnv}`);
console.log(
  Object.entries(counts)
    .map(([resource, count]) => `${resource}=${count}`)
    .join(' '),
);

if (planOnly) {
  console.log('Plan only: no NocoBase records were changed.');
  process.exit(0);
}

reconcileSeed('Apply desired demo data');

if (verifyIdempotent) {
  const secondPass = reconcileSeed('Verify converged second pass');
  if (secondPass.created > 0 || secondPass.updated > 0) {
    throw new Error(
      `Second pass still wrote records: created=${secondPass.created} updated=${secondPass.updated}`,
    );
  }
  console.log('  second pass completed with zero writes');
}

console.log('\nCRM demo data is ready.');
