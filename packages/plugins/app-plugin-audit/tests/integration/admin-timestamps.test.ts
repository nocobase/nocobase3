import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDatabaseManager, createMigrator } from '@nocobase/db';
import { DatabaseNotificationStore } from '@nocobase/app-plugin-notification/server';
import { DatabaseInAppStore } from '@nocobase/app-plugin-notification-in-app/server';
import {
  createPortableFixture,
  dialects,
  auditRows,
  auditRaw,
} from '../helpers/database-fixtures.js';

describe.each(dialects)('administrative timestamp storage %s', (dialect) => {
  it.each([false, true])(
    'preserves timezone, nullable fields, precision and cursors with dateStrings=%s',
    async (dateStrings) => {
      const fixture = await createPortableFixture(dialect);
      const manager = createDatabaseManager({
        connections: {
          main:
            fixture.config.dialect === 'mysql'
              ? {
                  ...fixture.config,
                  timezone: '+08:00',
                  driverOptions: { dateStrings },
                }
              : fixture.config,
        },
      });
      try {
        for (const name of ['notification', 'notification-in-app'])
          await createMigrator({
            database: manager,
            packageName: '@nocobase/app-plugin-' + name,
            directory: fileURLToPath(
              new URL(
                '../../../app-plugin-' + name + '/database/migrations',
                import.meta.url,
              ),
            ),
          }).latest();
        const store = new DatabaseNotificationStore(manager);
        const inbox = new DatabaseInAppStore(manager);
        const instant = '2026-09-05T18:20:30.000Z';
        const expiry = '2026-09-05T18:22:30.000Z';
        await store.create({
          log: {
            id: 'g19-log',
            sourceType: 'fixture',
            messageSnapshot: {},
            status: 'pending',
            createdAt: instant,
            updatedAt: instant,
          },
          deliveries: [
            {
              id: 'g19-delivery',
              notificationId: 'g19-log',
              channel: 'in-app',
              recipientSnapshot: {},
              messageSnapshot: {},
              providerName: 'primary',
              providerType: 'database',
              attemptCount: 0,
              status: 'pending',
              createdAt: instant,
              updatedAt: instant,
            },
          ],
        });
        expect((await store.getLog('g19-log'))?.createdAt).toBe(instant);
        expect(
          (await store.getDelivery('g19-delivery'))?.leaseExpiresAt,
        ).toBeUndefined();
        expect(
          (await store.claimDelivery('g19-delivery', 'lease', expiry))
            ?.leaseExpiresAt,
        ).toBe(expiry);
        const claimed = (await store.getDelivery('g19-delivery'))!;
        expect(
          (
            await store.startAttempt(
              claimed,
              {
                id: 'g19-attempt',
                deliveryId: claimed.id,
                sequence: 1,
                providerName: 'primary',
                providerType: 'database',
                status: 'submitting',
                startedAt: instant,
              },
              expiry,
            )
          )?.attemptCount,
        ).toBe(1);
        const attempt = (await store.listAttempts(claimed.id))[0];
        expect(attempt.startedAt).toBe(instant);
        expect(attempt.finishedAt).toBeUndefined();
        const current = (await store.getDelivery(claimed.id))!;
        await store.finishAttemptAndDelivery(
          { ...attempt, status: 'accepted', finishedAt: expiry },
          current,
          'accepted',
        );
        expect((await store.listAttempts(claimed.id))[0].finishedAt).toBe(
          expiry,
        );
        expect(
          (await store.getDelivery(claimed.id))?.leaseExpiresAt,
        ).toBeUndefined();
        const item = await inbox.deliver({
          deliveryId: 'g19-inbox',
          notificationId: 'g19-log',
          userId: 'g19-user',
          message: { body: 'synthetic' },
          createdAt: instant,
        });
        expect((await inbox.list({ userId: 'g19-user' }))[0].createdAt).toBe(
          instant,
        );
        expect(
          (
            await inbox.update({
              id: item.id,
              userId: 'g19-user',
              action: 'read',
            })
          )?.readAt,
        ).toMatch(/^\d{4}-.*Z$/);
        expect(
          (
            await inbox.update({
              id: item.id,
              userId: 'g19-user',
              action: 'unread',
            })
          )?.readAt,
        ).toBeUndefined();
        expect(
          await inbox.list({
            userId: 'g19-user',
            before: { createdAt: expiry, id: 'z' },
          }),
        ).toHaveLength(1);
        if (dialect === 'mysql') {
          const physical = await auditRows(
            manager.connection(),
            'SELECT CAST(created_at AS CHAR) AS value FROM notification_dispatches WHERE id = ?',
            ['g19-log'],
          );
          expect(physical[0].value).toBe('2026-09-06 02:20:30');
          // Existing DATETIME rows retain connection-local interpretation and second precision.
          await auditRaw(
            manager.connection(),
            "UPDATE notification_dispatches SET created_at = '2026-09-06 02:20:31' WHERE id = ?",
            ['g19-log'],
          );
          expect((await store.getLog('g19-log'))?.createdAt).toBe(
            '2026-09-05T18:20:31.000Z',
          );
          await inbox.deliver({
            deliveryId: 'g19-fractional',
            notificationId: 'g19-log',
            userId: 'g19-fractional-user',
            message: { body: 'synthetic precision fixture' },
            createdAt: '2026-09-05T18:20:30.123Z',
          });
          expect(
            (await inbox.list({ userId: 'g19-fractional-user' }))[0].createdAt,
          ).toBe('2026-09-05T18:20:30.000Z');
          await inbox.deliver({
            deliveryId: 'g19-same-second',
            notificationId: 'g19-log',
            userId: 'g19-fractional-user',
            message: { body: 'synthetic cursor fixture' },
            createdAt: '2026-09-05T18:20:30.234Z',
          });
          const first = (
            await inbox.list({ userId: 'g19-fractional-user', limit: 1 })
          )[0];
          const second = await inbox.list({
            userId: 'g19-fractional-user',
            limit: 1,
            before: { id: first.id, createdAt: first.createdAt },
          });
          expect(second).toHaveLength(1);
          expect(second[0].id).not.toBe(first.id);
          expect(
            await inbox.list({
              userId: 'g19-fractional-user',
              before: { id: second[0].id, createdAt: second[0].createdAt },
            }),
          ).toHaveLength(0);
        }
      } finally {
        await manager.destroy();
        await fixture.cleanup();
      }
    },
  );
});
