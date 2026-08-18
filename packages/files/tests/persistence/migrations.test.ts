import { Migrator } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { FilesMigrationProvider } from "../../src/persistence/migrations/index.ts";
import { createTestDatabase } from "./test-database.ts";

describe("files migrations", () => {
  const databases = [] as ReturnType<typeof createTestDatabase>[];
  afterEach(async () => Promise.all(databases.splice(0).map(db => db.destroy())));
  it("migrates up, down, and up again", async () => {
    const db = createTestDatabase(); databases.push(db);
    const migrator = new Migrator({ db, provider: new FilesMigrationProvider() });
    expect((await migrator.migrateToLatest()).error).toBeUndefined();
    expect((await db.introspection.getTables()).map(t => t.name)).toContain("files");
    expect((await migrator.migrateDown()).error).toBeUndefined();
    expect((await db.introspection.getTables()).map(t => t.name)).not.toContain("files");
    expect((await migrator.migrateToLatest()).error).toBeUndefined();
  });
});
