import { randomUUID } from "node:crypto";
import type { DatabaseManager, Row } from "@nocobase/database";
import type { InAppItem, InAppMessage } from "./types.js";

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
    readonly before?: string;
  }): Promise<readonly InAppItem[]>;
  countUnread(userId: string): Promise<number>;
  update(input: {
    readonly id: string;
    readonly userId: string;
    readonly action: "read" | "unread" | "delete";
    readonly expectedVersion: number;
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
      version: 1,
    };
    this.items.set(item.id, item);
    return item;
  }
  async list(input: {
    readonly userId: string;
    readonly unreadOnly?: boolean;
    readonly limit?: number;
  }): Promise<readonly InAppItem[]> {
    return [...this.items.values()]
      .filter(
        (item) =>
          item.userId === input.userId && (!input.unreadOnly || !item.readAt),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
    readonly action: "read" | "unread" | "delete";
    readonly expectedVersion: number;
  }): Promise<InAppItem | undefined> {
    const item = this.items.get(input.id);
    if (
      !item ||
      item.userId !== input.userId ||
      item.version !== input.expectedVersion
    )
      return undefined;
    const next: InAppItem = {
      ...item,
      readAt:
        input.action === "read"
          ? new Date().toISOString()
          : input.action === "unread"
            ? undefined
            : item.readAt,
      updatedAt: new Date().toISOString(),
      version: item.version + 1,
    };
    if (input.action === "delete") this.items.delete(item.id);
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
          version: item.version + 1,
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
  readAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export class DatabaseInAppStore implements InAppStore {
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
      version: 1,
    };
    await this.database
      .query()
      .insertInto<ItemRow>("notificationInAppItems")
      .values(toRow(item))
      .execute();
    return item;
  }
  async list(input: {
    readonly userId: string;
    readonly unreadOnly?: boolean;
    readonly limit?: number;
  }): Promise<readonly InAppItem[]> {
    let query = this.database
      .query()
      .selectFrom<ItemRow>("notificationInAppItems")
      .selectAll()
      .where("userId", "=", input.userId)
      .orderBy("createdAt", "desc")
      .limit(input.limit ?? 25);
    if (input.unreadOnly) query = query.where("readAt", "is", null);
    return (await query.execute<ItemRow>()).map(fromRow);
  }
  async countUnread(userId: string): Promise<number> {
    const rows = await this.database
      .query()
      .selectFrom<ItemRow>("notificationInAppItems")
      .selectAll()
      .where("userId", "=", userId)
      .where("readAt", "is", null)
      .execute<ItemRow>();
    return rows.length;
  }
  async update(input: {
    readonly id: string;
    readonly userId: string;
    readonly action: "read" | "unread" | "delete";
    readonly expectedVersion: number;
  }): Promise<InAppItem | undefined> {
    const current = await this.database
      .query()
      .selectFrom<ItemRow>("notificationInAppItems")
      .selectAll()
      .where("id", "=", input.id)
      .where("userId", "=", input.userId)
      .executeTakeFirst<ItemRow>();
    if (!current) return undefined;
    const now = new Date().toISOString();
    const set =
      input.action === "read"
        ? { readAt: now, updatedAt: now, version: input.expectedVersion + 1 }
        : input.action === "unread"
          ? {
              readAt: undefined,
              updatedAt: now,
              version: input.expectedVersion + 1,
            }
          : { updatedAt: now, version: input.expectedVersion + 1 };
    const result = await this.database
      .query()
      .updateTable<ItemRow>("notificationInAppItems")
      .set(set)
      .where("id", "=", input.id)
      .where("userId", "=", input.userId)
      .where("version", "=", input.expectedVersion)
      .execute();
    if (result.updatedCount !== 1) return undefined;
    if (input.action === "delete") {
      await this.database
        .query()
        .deleteFrom("notificationInAppItems")
        .where("id", "=", input.id)
        .execute();
      return {
        ...fromRow(current),
        updatedAt: now,
        version: input.expectedVersion + 1,
      };
    }
    const row = await this.database
      .query()
      .selectFrom<ItemRow>("notificationInAppItems")
      .selectAll()
      .where("id", "=", input.id)
      .executeTakeFirst<ItemRow>();
    return row ? fromRow(row) : undefined;
  }
  async markAllRead(userId: string): Promise<number> {
    const result = await this.database
      .query()
      .updateTable<ItemRow>("notificationInAppItems")
      .set({
        readAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where("userId", "=", userId)
      .where("readAt", "is", null)
      .execute();
    return result.updatedCount ?? 0;
  }
}

export function createInAppStore(database?: DatabaseManager): InAppStore {
  return database ? new DatabaseInAppStore(database) : new MemoryInAppStore();
}
function fromRow(row: ItemRow): InAppItem {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    notificationId: row.notificationId,
    userId: row.userId,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    readAt: row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}
function toRow(item: InAppItem): ItemRow {
  return {
    id: item.id,
    deliveryId: item.deliveryId,
    notificationId: item.notificationId,
    userId: item.userId,
    title: item.title,
    body: item.body,
    actionUrl: item.actionUrl,
    readAt: item.readAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    version: item.version,
  };
}
