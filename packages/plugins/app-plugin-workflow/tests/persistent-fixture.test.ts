import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { databaseManagerToken } from '@nocobase/db';
import { expect, it } from 'vitest';
import { EXECUTION_STATUS } from '../server/engine/constants.js';
import { asId } from '../server/engine/utils.js';
import { findRun, readRun, waitFor } from './helpers.js';
import {
  createAcceptanceApplication,
  emitRevision,
  enableRevision,
  eventKey,
  input,
  triggerWorkflow,
  replaceRevision,
} from './persistent/application.js';
import { DurableBusinessEffect } from './persistent/business.js';
import { businessInstructionType } from './persistent/instruction.js';

it('smokes the persistent acceptance application with the real in-memory queue and Workflow run instruction', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-fixture-smoke-'));
  const app = await createAcceptanceApplication(
    root,
    { namespace: path.basename(root), queueBackend: 'inMemory' },
    'initialize',
  );
  try {
    const hash = await emitRevision(root, 'original');
    await app.start();
    await enableRevision(app, hash);
    await triggerWorkflow(app);
    const database = app.container.resolve(databaseManagerToken);
    const id = asId((await findRun(database, eventKey)).id);
    await waitFor(
      async () =>
        (await readRun(database, id)).status === EXECUTION_STATUS.RESOLVED,
    );
    expect(await replaceRevision(app, root)).not.toBe(hash);
    expect(await readRun(database, id)).toMatchObject({
      hash,
      input,
      output: { revision: 'original', input },
    });
    await app.shutdown();
    const restarted = await createAcceptanceApplication(
      root,
      {
        namespace: path.basename(root),
        queueBackend: 'inMemory',
      },
      'restart',
    );
    try {
      await restarted.start();
      expect(
        await readRun(restarted.container.resolve(databaseManagerToken), id),
      ).toMatchObject({
        hash,
        input,
        output: { revision: 'original', input },
      });
    } finally {
      await restarted.shutdown();
    }
  } finally {
    await app.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

it('commits the durable business effect inside the production Workflow engine instruction', async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'workflow-instruction-smoke-'),
  );
  const app = await createAcceptanceApplication(
    root,
    {
      namespace: path.basename(root),
      queueBackend: 'inMemory',
    },
    'initialize',
  );
  try {
    const hash = await emitRevision(
      root,
      'business-effect',
      businessInstructionType,
    );
    await app.start();
    await enableRevision(app, hash);
    await triggerWorkflow(app);
    const database = app.container.resolve(databaseManagerToken);
    const id = asId((await findRun(database, eventKey)).id);
    await waitFor(
      async () =>
        (await readRun(database, id)).status === EXECUTION_STATUS.RESOLVED,
    );
    expect(await readRun(database, id)).toMatchObject({
      hash,
      input,
      output: { businessKey: input.businessKey, committed: true, input },
    });
    const business = new DurableBusinessEffect(
      path.join(root, 'business.sqlite'),
    );
    try {
      const snapshot = business.snapshot();
      expect(snapshot.attempts).toHaveLength(1);
      expect(snapshot.effects).toEqual([
        expect.objectContaining({
          business_key: input.businessKey,
          payload: JSON.stringify(input),
          process_id: process.pid,
        }),
      ]);
    } finally {
      business.close();
    }
  } finally {
    await app.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps the business-keyed effect after closing and reopening SQLite and rejects conflicting input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow-business-smoke-'));
  const filename = path.join(root, 'business.sqlite');
  const first = new DurableBusinessEffect(filename);
  try {
    first.apply(input.businessKey, input);
  } finally {
    first.close();
  }
  const second = new DurableBusinessEffect(filename);
  try {
    second.apply(input.businessKey, input);
    expect(second.snapshot().attempts).toHaveLength(2);
    expect(second.snapshot().effects).toHaveLength(1);
    expect(() => second.apply(input.businessKey, { amount: 999 })).toThrow(
      'Business key reused with different input',
    );
    expect(second.snapshot().attempts).toHaveLength(2);
    expect(second.snapshot().effects).toHaveLength(1);
  } finally {
    second.close();
    await rm(root, { recursive: true, force: true });
  }
});
