// PROTOTYPE ONLY — verifies notification queue semantics; do not import in production.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requireFromDatabasePackage = createRequire(
  new URL('../../../../packages/database/package.json', import.meta.url),
);
const knex = requireFromDatabasePackage('knex');

const retryDelayMs = [30_000, 120_000];
const providerChain = ['email/smtp/primary', 'email/smtp/secondary'];

function rowsFromRaw(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function databaseNow(db, dialect) {
  const expression =
    dialect === 'postgres'
      ? "floor(extract(epoch from clock_timestamp()) * 1000)::bigint"
      : "cast((julianday('now') - 2440587.5) * 86400000 as integer)";
  const row = await db.select(db.raw(`${expression} as now_ms`)).first();
  return Number(row.now_ms);
}

async function createTables(db) {
  await db.schema.createTable('deliveries', (table) => {
    table.string('id').primary();
    table.string('state').notNullable();
    table.text('provider_chain').notNullable();
    table.integer('provider_index').notNullable().defaultTo(0);
    table.integer('attempts_on_provider').notNullable().defaultTo(0);
    table.bigInteger('next_run_at').notNullable();
    table.string('lease_owner').nullable();
    table.bigInteger('lease_expires_at').nullable();
    table.integer('version').notNullable().defaultTo(0);
  });

  await db.schema.createTable('delivery_attempts', (table) => {
    table.increments('id').primary();
    table.string('delivery_id').notNullable();
    table.integer('attempt_no').notNullable();
    table.string('provider_instance_id').notNullable();
    table.string('state').notNullable();
    table.string('error_category').nullable();
    table.string('config_revision').notNullable();
    table.bigInteger('started_at').notNullable();
    table.bigInteger('finished_at').nullable();
    table.unique(['delivery_id', 'attempt_no']);
  });

  await db.schema.createTable('delivery_status_events', (table) => {
    table.increments('id').primary();
    table.string('delivery_id').notNullable();
    table.string('from_state').notNullable();
    table.string('to_state').notNullable();
    table.string('reason').notNullable();
    table.bigInteger('created_at').notNullable();
  });

  await db.schema.alterTable('deliveries', (table) => {
    table.index(['state', 'next_run_at', 'lease_expires_at'], 'deliveries_claimable');
  });
}

async function seedDelivery(db, id, now) {
  await db('deliveries').insert({
    id,
    state: 'queued',
    provider_chain: JSON.stringify(providerChain),
    provider_index: 0,
    attempts_on_provider: 0,
    next_run_at: now,
    lease_owner: null,
    lease_expires_at: null,
    version: 0,
  });
}

async function claimNext(db, dialect, workerId, leaseMs = 30_000) {
  const now = await databaseNow(db, dialect);
  const leaseExpiresAt = now + leaseMs;

  if (dialect === 'postgres') {
    const result = await db.raw(
      `with candidate as (
         select id
         from deliveries
         where state = 'queued'
           and next_run_at <= ?
           and (lease_expires_at is null or lease_expires_at <= ?)
         order by next_run_at, id
         for update skip locked
         limit 1
       )
       update deliveries as delivery
       set lease_owner = ?, lease_expires_at = ?, version = version + 1
       from candidate
       where delivery.id = candidate.id
       returning delivery.*`,
      [now, now, workerId, leaseExpiresAt],
    );
    return rowsFromRaw(result)[0] ?? null;
  }

  const result = await db.raw(
    `update deliveries
     set lease_owner = ?, lease_expires_at = ?, version = version + 1
     where id = (
       select id
       from deliveries
       where state = 'queued'
         and next_run_at <= ?
         and (lease_expires_at is null or lease_expires_at <= ?)
       order by next_run_at, id
       limit 1
     )
       and state = 'queued'
       and (lease_expires_at is null or lease_expires_at <= ?)
     returning *`,
    [workerId, leaseExpiresAt, now, now, now],
  );
  return rowsFromRaw(result)[0] ?? null;
}

async function renewLease(db, dialect, deliveryId, workerId, leaseMs = 30_000) {
  const now = await databaseNow(db, dialect);
  const updated = await db('deliveries')
    .where({ id: deliveryId, lease_owner: workerId })
    .whereIn('state', ['queued', 'sending'])
    .where('lease_expires_at', '>', now)
    .update({ lease_expires_at: now + leaseMs, version: db.raw('version + 1') });
  return updated === 1;
}

async function beginAttempt(db, dialect, deliveryId, workerId) {
  return db.transaction(async (trx) => {
    const now = await databaseNow(trx, dialect);
    const delivery = await trx('deliveries').where({ id: deliveryId }).first();
    assert(delivery, `Delivery ${deliveryId} must exist`);

    const lastAttempt = await trx('delivery_attempts')
      .where({ delivery_id: deliveryId })
      .max({ attempt_no: 'attempt_no' })
      .first();
    const attemptNo = Number(lastAttempt?.attempt_no ?? 0) + 1;
    const updated = await trx('deliveries')
      .where({ id: deliveryId, state: 'queued', lease_owner: workerId })
      .where('lease_expires_at', '>', now)
      .update({
        state: 'sending',
        attempts_on_provider: Number(delivery.attempts_on_provider) + 1,
        version: trx.raw('version + 1'),
      });
    assert.equal(updated, 1, 'Only the current lease owner may begin an Attempt');

    const chain = JSON.parse(delivery.provider_chain);
    const [attemptId] = await trx('delivery_attempts').insert(
      {
        delivery_id: deliveryId,
        attempt_no: attemptNo,
        provider_instance_id: chain[delivery.provider_index],
        state: 'sending',
        config_revision: 'prototype-r1',
        started_at: now,
      },
      ['id'],
    );
    await trx('delivery_status_events').insert({
      delivery_id: deliveryId,
      from_state: 'queued',
      to_state: 'sending',
      reason: 'attempt_started',
      created_at: now,
    });
    return typeof attemptId === 'object' ? attemptId.id : attemptId;
  });
}

async function completeAttempt(db, dialect, deliveryId, result) {
  return db.transaction(async (trx) => {
    const now = await databaseNow(trx, dialect);
    const delivery = await trx('deliveries').where({ id: deliveryId, state: 'sending' }).first();
    assert(delivery, `Sending Delivery ${deliveryId} must exist`);
    const attempt = await trx('delivery_attempts')
      .where({ delivery_id: deliveryId, state: 'sending' })
      .orderBy('id', 'desc')
      .first();
    assert(attempt, `Sending Attempt for ${deliveryId} must exist`);

    let nextState;
    let reason;
    const patch = {
      lease_owner: null,
      lease_expires_at: null,
      version: trx.raw('version + 1'),
    };

    if (result.kind === 'accepted') {
      nextState = 'accepted';
      reason = 'provider_accepted';
    } else if (result.kind === 'submission_unknown') {
      nextState = 'submission_unknown';
      reason = 'provider_submission_unknown';
    } else if (!result.retryable && !result.fallback) {
      nextState = 'failed';
      reason = result.errorCategory;
    } else if (result.retryable && Number(delivery.attempts_on_provider) < 3) {
      nextState = 'queued';
      reason = 'retry_scheduled';
      patch.next_run_at = now + retryDelayMs[Number(delivery.attempts_on_provider) - 1];
    } else {
      const chain = JSON.parse(delivery.provider_chain);
      const nextProviderIndex = Number(delivery.provider_index) + 1;
      if (result.fallback && nextProviderIndex < chain.length) {
        nextState = 'queued';
        reason = 'provider_fallback';
        patch.provider_index = nextProviderIndex;
        patch.attempts_on_provider = 0;
        patch.next_run_at = now;
      } else {
        nextState = 'failed';
        reason = 'provider_chain_exhausted';
      }
    }

    patch.state = nextState;
    await trx('delivery_attempts').where({ id: attempt.id }).update({
      state: result.kind === 'failed' ? 'failed' : result.kind,
      error_category: result.errorCategory ?? null,
      finished_at: now,
    });
    await trx('deliveries').where({ id: deliveryId, state: 'sending' }).update(patch);
    await trx('delivery_status_events').insert({
      delivery_id: deliveryId,
      from_state: 'sending',
      to_state: nextState,
      reason,
      created_at: now,
    });
    return trx('deliveries').where({ id: deliveryId }).first();
  });
}

async function recoverExpired(db, dialect) {
  const now = await databaseNow(db, dialect);
  const expired = await db('deliveries')
    .whereIn('state', ['queued', 'sending'])
    .whereNotNull('lease_expires_at')
    .where('lease_expires_at', '<=', now)
    .select('id', 'state');

  const recovered = [];
  for (const candidate of expired) {
    const result = await db.transaction(async (trx) => {
      if (candidate.state === 'queued') {
        const changed = await trx('deliveries')
          .where({ id: candidate.id, state: 'queued' })
          .where('lease_expires_at', '<=', now)
          .update({
            lease_owner: null,
            lease_expires_at: null,
            version: trx.raw('version + 1'),
          });
        if (changed !== 1) return null;
        await trx('delivery_status_events').insert({
          delivery_id: candidate.id,
          from_state: 'queued',
          to_state: 'queued',
          reason: 'lease_expired_before_attempt',
          created_at: now,
        });
        return { id: candidate.id, state: 'queued' };
      }

      const changed = await trx('deliveries')
        .where({ id: candidate.id, state: 'sending' })
        .where('lease_expires_at', '<=', now)
        .update({
          state: 'submission_unknown',
          lease_owner: null,
          lease_expires_at: null,
          version: trx.raw('version + 1'),
        });
      if (changed !== 1) return null;
      await trx('delivery_attempts')
        .where({ delivery_id: candidate.id, state: 'sending' })
        .update({ state: 'submission_unknown', finished_at: now, error_category: 'worker_lost' });
      await trx('delivery_status_events').insert({
        delivery_id: candidate.id,
        from_state: 'sending',
        to_state: 'submission_unknown',
        reason: 'sending_lease_expired',
        created_at: now,
      });
      return { id: candidate.id, state: 'submission_unknown' };
    });
    if (result) recovered.push(result);
  }
  return recovered;
}

async function expireLeaseForScenario(db, deliveryId) {
  await db('deliveries').where({ id: deliveryId }).update({ lease_expires_at: 0 });
}

async function makeDueForScenario(db, deliveryId) {
  await db('deliveries').where({ id: deliveryId }).update({ next_run_at: 0 });
}

async function snapshot(db, id) {
  return {
    delivery: await db('deliveries').where({ id }).first(),
    attempts: await db('delivery_attempts').where({ delivery_id: id }).orderBy('id'),
    events: await db('delivery_status_events').where({ delivery_id: id }).orderBy('id'),
  };
}

async function runScenarios(name, db, dialect) {
  await createTables(db);
  const now = await databaseNow(db, dialect);

  await Promise.all(['claim-a', 'claim-b', 'claim-c'].map((id) => seedDelivery(db, id, now)));
  const claims = await Promise.all(
    ['worker-1', 'worker-2', 'worker-3', 'worker-4'].map((worker) =>
      claimNext(db, dialect, worker),
    ),
  );
  const claimedIds = claims.filter(Boolean).map((claim) => claim.id);
  assert.equal(claimedIds.length, 3);
  assert.equal(new Set(claimedIds).size, 3, 'Concurrent workers must never claim the same Delivery');

  const renewed = await renewLease(db, dialect, claims[0].id, claims[0].lease_owner);
  assert.equal(renewed, true, 'The lease owner must be able to renew an unexpired lease');

  await seedDelivery(db, 'safe-recovery', now);
  const safeClaim = await claimNext(db, dialect, 'worker-safe');
  assert.equal(safeClaim.id, 'safe-recovery');
  await expireLeaseForScenario(db, 'safe-recovery');
  await recoverExpired(db, dialect);
  const safe = await snapshot(db, 'safe-recovery');
  assert.equal(safe.delivery.state, 'queued');
  assert.equal(safe.attempts.length, 0);
  // Keep the independent walkthroughs from claiming this deliberately re-queued row again.
  await db('deliveries').where({ id: 'safe-recovery' }).update({ state: 'failed' });

  await seedDelivery(db, 'unknown-recovery', now);
  const unknownClaim = await claimNext(db, dialect, 'worker-unknown');
  assert.equal(unknownClaim.id, 'unknown-recovery');
  await beginAttempt(db, dialect, unknownClaim.id, 'worker-unknown');
  await expireLeaseForScenario(db, 'unknown-recovery');
  await recoverExpired(db, dialect);
  const unknown = await snapshot(db, 'unknown-recovery');
  assert.equal(unknown.delivery.state, 'submission_unknown');
  assert.equal(unknown.attempts[0].state, 'submission_unknown');

  await seedDelivery(db, 'retry-fallback', now);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claim = await claimNext(db, dialect, `worker-retry-${attempt}`);
    assert.equal(claim.id, 'retry-fallback');
    await beginAttempt(db, dialect, claim.id, `worker-retry-${attempt}`);
    const delivery = await completeAttempt(db, dialect, claim.id, {
      kind: 'failed',
      errorCategory: 'network',
      retryable: true,
      fallback: true,
    });
    if (attempt < 3) {
      assert.equal(delivery.state, 'queued');
      assert.equal(Number(delivery.provider_index), 0);
      await makeDueForScenario(db, delivery.id);
    }
  }
  const fallback = await snapshot(db, 'retry-fallback');
  assert.equal(fallback.delivery.state, 'queued');
  assert.equal(Number(fallback.delivery.provider_index), 1);
  assert.equal(Number(fallback.delivery.attempts_on_provider), 0);
  assert.deepEqual(
    fallback.events.map((event) => event.reason),
    ['attempt_started', 'retry_scheduled', 'attempt_started', 'retry_scheduled', 'attempt_started', 'provider_fallback'],
  );

  const fallbackClaim = await claimNext(db, dialect, 'worker-secondary');
  assert.equal(fallbackClaim.id, 'retry-fallback');
  await beginAttempt(db, dialect, fallbackClaim.id, 'worker-secondary');
  await completeAttempt(db, dialect, fallbackClaim.id, { kind: 'accepted' });
  const accepted = await snapshot(db, 'retry-fallback');
  assert.equal(accepted.delivery.state, 'accepted');
  assert.equal(accepted.attempts.at(-1).provider_instance_id, 'email/smtp/secondary');

  console.log(`\n${name}: PASS`);
  console.log(`  atomic claims: ${claimedIds.join(', ')}`);
  console.log(`  pre-Attempt crash: ${safe.delivery.state}, ${safe.attempts.length} Attempt(s)`);
  console.log(`  sending crash: ${unknown.delivery.state}`);
  console.log(`  retry/fallback: ${accepted.attempts.length} Attempts, ${accepted.delivery.state}`);
}

async function runSqlite(tempDirectory) {
  const filename = join(tempDirectory, 'PROTOTYPE-notification-queue.sqlite');
  const db = knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    pool: { min: 1, max: 4 },
  });
  try {
    await db.raw('pragma busy_timeout = 5000');
    await runScenarios('SQLite', db, 'sqlite');
  } finally {
    await db.destroy();
  }
}

async function runPostgres() {
  const schema = `notification_queue_proto_${process.pid}`;
  const baseConfig = {
    host: process.env.NOTIFICATION_PROTO_PGHOST ?? '127.0.0.1',
    port: Number(process.env.NOTIFICATION_PROTO_PGPORT ?? 5432),
    user: process.env.NOTIFICATION_PROTO_PGUSER ?? process.env.USER,
    database: process.env.NOTIFICATION_PROTO_PGDATABASE ?? 'postgres',
    password: process.env.NOTIFICATION_PROTO_PGPASSWORD,
  };
  const admin = knex({ client: 'pg', connection: baseConfig, pool: { min: 0, max: 2 } });
  let db;
  try {
    await admin.raw(`create schema "${schema}"`);
    db = knex({
      client: 'pg',
      connection: baseConfig,
      searchPath: [schema],
      pool: { min: 1, max: 6 },
    });
    await runScenarios('PostgreSQL', db, 'postgres');
  } finally {
    if (db) await db.destroy();
    await admin.raw(`drop schema if exists "${schema}" cascade`);
    await admin.destroy();
  }
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'notification-queue-prototype-'));
try {
  await runSqlite(tempDirectory);
  if (process.env.NOTIFICATION_PROTO_SKIP_POSTGRES === '1') {
    console.log('\nPostgreSQL: SKIPPED by NOTIFICATION_PROTO_SKIP_POSTGRES=1');
  } else {
    await runPostgres();
  }
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
