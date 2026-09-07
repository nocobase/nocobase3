import { randomUUID } from 'node:crypto';
import {
  databaseTime,
  timestamp,
  optionalTimestamp,
  databaseTimezone,
} from './database-time.js';
import type { DatabaseDialect, DatabaseManager, Row } from '@nocobase/db';
import type { InAppItem, InAppMessage } from './types.js';

export interface InAppPageCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface InAppStore {
  deliver(input: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly userId: string;
    readonly message: InAppMessage;
    readonly createdAt: string;
  }): Promise<InAppItem>;
  list(input: {
    readonly userId: string;
    readonly unreadOnly?: boolean;
    readonly limit?: number;
    readonly before?: InAppPageCursor;
  }): Promise<readonly InAppItem[]>;
  countUnread(userId: string): Promise<number>;
  update(input: {
    readonly id: string;
    readonly userId: string;
    readonly action: 'read' | 'unread' | 'delete';
  }): Promise<InAppItem | undefined>;
  markAllRead(userId: string): Promise<number>;
}

export class MemoryInAppStore implements InAppStore {
  private readonly items = new Map<string, InAppItem>();
  async deliver(input: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly userId: string;
    readonly message: InAppMessage;
    readonly createdAt: string;
  }): Promise<InAppItem> {
    const existing = [...this.items.values()].find(
      (item) => item.deliveryId === input.deliveryId,
    );
    if (existing) return existing;
    const item: InAppItem = {
      id: randomUUID(),
      deliveryId: input.deliveryId,
      notificationId: input.notificationId,
      userId: input.userId,
      title: input.message.title,
      body: input.message.body,
      actionUrl: input.message.actionUrl,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.items.set(item.id, item);
    return item;
  }
  async list(input: {
    readonly userId: string;
    readonly unreadOnly?: boolean;
    readonly limit?: number;
    readonly before?: InAppPageCursor;
  }): Promise<readonly InAppItem[]> {
    return [...this.items.values()]
      .filter(
        (item) =>
          item.userId === input.userId &&
          (!input.unreadOnly || !item.readAt) &&
          (!input.before || isBefore(item, input.before)),
      )
      .sort(compareItemsDescending)
      .slice(0, input.limit ?? 25);
  }
  async countUnread(userId: string): Promise<number> {
    return (
      await this.list({
        userId,
        unreadOnly: true,
        limit: Number.MAX_SAFE_INTEGER,
      })
    ).length;
  }
  async update(input: {
    readonly id: string;
    readonly userId: string;
    readonly action: 'read' | 'unread' | 'delete';
  }): Promise<InAppItem | undefined> {
    const item = this.items.get(input.id);
    if (!item || item.userId !== input.userId) return undefined;
    const next: InAppItem = {
      ...item,
      readAt:
        input.action === 'read'
          ? new Date().toISOString()
          : input.action === 'unread'
            ? undefined
            : item.readAt,
      updatedAt: new Date().toISOString(),
    };
    if (input.action === 'delete') this.items.delete(item.id);
    else this.items.set(item.id, next);
    return next;
  }
  async markAllRead(userId: string): Promise<number> {
    let count = 0;
    for (const item of this.items.values())
      if (item.userId === userId && !item.readAt) {
        this.items.set(item.id, {
          ...item,
          readAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        count++;
      }
    return count;
  }
}

interface ItemRow extends Row {
  id: string;
  deliveryId: string;
  notificationId: string;
  userId: string;
  title?: string;
  body: string;
  actionUrl?: string;
  readAt?: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export class DatabaseInAppStore implements InAppStore {
  private time<T extends string | null | undefined>(value: T): T | Date {
    return databaseTime(value, this.database.connection().dialect);
  }
  constructor(private readonly database: DatabaseManager) {}
  async deliver(input: {
    readonly deliveryId: string;
    readonly notificationId: string;
    readonly userId: string;
    readonly message: InAppMessage;
    readonly createdAt: string;
  }): Promise<InAppItem> {
    const item: InAppItem = {
      id: randomUUID(),
      deliveryId: input.deliveryId,
      notificationId: input.notificationId,
      userId: input.userId,
      title: input.message.title,
      body: input.message.body,
      actionUrl: input.message.actionUrl,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    try {
      await this.database
        .query()
        .insertInto<ItemRow>('notificationInAppItems')
        .values(toRow(item, this.database.connection().dialect))
        .execute();
    } catch (error) {
      const existing = await this.database
        .query()
        .selectFrom<ItemRow>('notificationInAppItems')
        .selectAll()
        .where('deliveryId', '=', input.deliveryId)
        .executeTakeFirst<ItemRow>();
      if (existing)
        return fromRow(
          existing,
          await databaseTimezone(this.database.connection()),
        );
      throw error;
    }
    return item;
  }
  async list(input: {
    readonly userId: string;
    readonly unreadOnly?: boolean;
    readonly limit?: number;
    readonly before?: InAppPageCursor;
  }): Promise<readonly InAppItem[]> {
    let query = this.database
      .query()
      .selectFrom<ItemRow>('notificationInAppItems')
      .selectAll()
      .where('userId', '=', input.userId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(input.limit ?? 25);
    if (input.unreadOnly) query = query.where('readAt', 'is', null);
    if (input.before)
      query = query.where((builder) =>
        builder.or([
          builder('createdAt', '<', this.time(input.before?.createdAt)),
          builder.and([
            builder('createdAt', '=', this.time(input.before?.createdAt)),
            builder('id', '<', input.before?.id),
          ]),
        ]),
      );
    const timezone = await databaseTimezone(this.database.connection());
    return (await query.execute<ItemRow>()).map((row) =>
      fromRow(row, timezone),
    );
  }
  async countUnread(userId: string): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom<ItemRow>('notificationInAppItems')
      .selectAll()
      .where('userId', '=', userId)
      .where('readAt', 'is', null)
      .execute<ItemRow>();
    return rows.length;
  }
  async update(input: {
    readonly id: string;
    readonly userId: string;
    readonly action: 'read' | 'unread' | 'delete';
  }): Promise<InAppItem | undefined> {
    const now = new Date().toISOString();
    if (input.action === 'delete') {
      const current = await this.database
        .query()
        .selectFrom<ItemRow>('notificationInAppItems')
        .selectAll()
        .where('id', '=', input.id)
        .where('userId', '=', input.userId)
        .executeTakeFirst<ItemRow>();
      if (!current) return undefined;
      const result = await this.database
        .query()
        .deleteFrom('notificationInAppItems')
        .where('id', '=', input.id)
        .where('userId', '=', input.userId)
        .execute();
      return result.deletedCount === 1
        ? {
            ...fromRow(
              current,
              await databaseTimezone(this.database.connection()),
            ),
            updatedAt: now,
          }
        : undefined;
    }
    const set =
      input.action === 'read'
        ? { readAt: this.time(now), updatedAt: this.time(now) }
        : { readAt: null, updatedAt: this.time(now) };
    const result = await this.database
      .query()
      .updateTable<ItemRow>('notificationInAppItems')
      .set(set)
      .where('id', '=', input.id)
      .where('userId', '=', input.userId)
      .execute();
    if (result.updatedCount !== 1) return undefined;
    const row = await this.database
      .query()
      .selectFrom<ItemRow>('notificationInAppItems')
      .selectAll()
      .where('id', '=', input.id)
      .executeTakeFirst<ItemRow>();
    return row
      ? fromRow(row, await databaseTimezone(this.database.connection()))
      : undefined;
  }
  async markAllRead(userId: string): Promise<number> {
    const result = await this.database
      .query()
      .updateTable<ItemRow>('notificationInAppItems')
      .set({
        readAt: this.time(new Date().toISOString()),
        updatedAt: this.time(new Date().toISOString()),
      })
      .where('userId', '=', userId)
      .where('readAt', 'is', null)
      .execute();
    return result.updatedCount ?? 0;
  }
}

export function createInAppStore(database?: DatabaseManager): InAppStore {
  return database ? new DatabaseInAppStore(database) : new MemoryInAppStore();
}
function fromRow(row: ItemRow, timezone?: string): InAppItem {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    notificationId: row.notificationId,
    userId: row.userId,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    readAt: optionalTimestamp(row.readAt, timezone),
    createdAt: timestamp(row.createdAt, timezone),
    updatedAt: timestamp(row.updatedAt, timezone),
  };
}
function toRow(item: InAppItem, dialect: DatabaseDialect): ItemRow {
  return {
    id: item.id,
    deliveryId: item.deliveryId,
    notificationId: item.notificationId,
    userId: item.userId,
    title: item.title,
    body: item.body,
    actionUrl: item.actionUrl,
    readAt: databaseTime(item.readAt, dialect),
    createdAt: databaseTime(item.createdAt, dialect),
    updatedAt: databaseTime(item.updatedAt, dialect),
  };
}

function compareItemsDescending(a: InAppItem, b: InAppItem): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function isBefore(item: InAppItem, cursor: InAppPageCursor): boolean {
  return (
    item.createdAt < cursor.createdAt ||
    (item.createdAt === cursor.createdAt && item.id < cursor.id)
  );
}
