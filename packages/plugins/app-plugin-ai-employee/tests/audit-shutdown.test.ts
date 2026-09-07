import { describe, expect, it } from 'vitest';
import { AIEmployeeProvider } from '../server/providers/ai-employee.js';
import { aiEmployeeAuditToken } from '../server/audit.js';
import {
  bindAIRequestAudit,
  bindAIConversationAudit,
  runAuditedAI,
  streamAuditedAI,
  stopAndDrainAI,
} from '../server/audit-runtime.js';
import { createAIAuditFixture } from './helpers/audit-fixture.js';
import { dialects } from '../../app-plugin-audit/tests/helpers/database-fixtures.js';

function bound(bridge: Parameters<typeof bindAIRequestAudit>[1]): object {
  const context = {},
    conversation = {};
  bindAIRequestAudit(context, bridge);
  bindAIConversationAudit(conversation, context, 'g20-agent', 'g20-session');
  return conversation;
}
describe.each(dialects)('AI shutdown %s', (dialect) => {
  it('waits between stream yields through iterator return and finished persistence', async () => {
    const f = await createAIAuditFixture(dialect);
    try {
      const owner = bound(f.bridge);
      let finalized = false;
      const stream = streamAuditedAI(owner, async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          finalized = true;
        }
      });
      expect(await stream.next()).toEqual({ value: 1, done: false });
      f.fixture.app.container.instance(aiEmployeeAuditToken, f.bridge);
      const provider = new AIEmployeeProvider(f.fixture.app);
      let drained = false;
      const drain = provider.shutdown().then(() => {
        drained = true;
      });
      await Promise.resolve();
      expect(drained).toBe(false);
      let called = false;
      await expect(
        runAuditedAI(owner, async () => {
          called = true;
        }),
      ).rejects.toThrow('shutting down');
      expect(called).toBe(false);
      await stream.return(undefined);
      await drain;
      expect(finalized).toBe(true);
      const events = (
        await f.fixture.f.store.query(f.fixture.f.scope, {
          store: 'main',
          pageSize: 100,
        })
      ).items;
      expect(events.some((event) => event.action === 'ai.run.finished')).toBe(
        true,
      );
    } finally {
      await f.cleanup();
    }
  });
  it('leaves unconsumed streams unleased, permits nested accepted work and isolates bridges', async () => {
    const f = await createAIAuditFixture(dialect);
    const other = await createAIAuditFixture(dialect);
    try {
      const owner = bound(f.bridge);
      const unconsumed = streamAuditedAI(owner, async function* () {
        yield 1;
      });
      let drain!: Promise<void>;
      await runAuditedAI(owner, async () => {
        drain = stopAndDrainAI(f.bridge);
        await runAuditedAI(owner, async () => 2);
      });
      await drain;
      await expect(unconsumed.next()).rejects.toThrow('shutting down');
      expect(await runAuditedAI(bound(other.bridge), async () => 3)).toBe(3);
    } finally {
      await f.cleanup();
      await other.cleanup();
    }
  });
  it('releases leases after callback and stream errors', async () => {
    const f = await createAIAuditFixture(dialect);
    try {
      const owner = bound(f.bridge);
      await expect(
        runAuditedAI(owner, async () => {
          throw new Error('synthetic error');
        }),
      ).rejects.toThrow('synthetic error');
      const stream = streamAuditedAI(owner, async function* () {
        yield 1;
        throw new Error('synthetic stream error');
      });
      await stream.next();
      await expect(stream.next()).rejects.toThrow('synthetic stream error');
      await stopAndDrainAI(f.bridge);
    } finally {
      await f.cleanup();
    }
  });
});
