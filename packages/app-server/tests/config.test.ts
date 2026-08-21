import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { DatabaseManager } from "@nocobase/database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createDatabaseMigratorMock = vi.hoisted(() => vi.fn());
const tempDirs: string[] = [];

vi.mock("@nocobase/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nocobase/database")>();

  return {
    ...actual,
    createMigrator: createDatabaseMigratorMock,
  };
});

import {
  createAppDatabaseManager,
  createAppMigrator,
  createAppRuntime,
  createConfigEnv,
  createConfigPaths,
  defineConfig,
  loadConfig,
  prepareAppDatabaseStorage,
  runConfiguredAppMigrations,
  type AppDatabaseConfig,
} from "../src/index.js";

beforeEach(() => {
  createDatabaseMigratorMock.mockReset();
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("app-server config runtime", () => {
  it("reads typed env values with defaults", () => {
    const env = createConfigEnv({
      APP_NAME: " app ",
      APP_PORT: "13000",
      APP_ENABLED: "yes",
      APP_LOCALES: "en-US, zh-CN",
    });

    expect(env.string("APP_NAME")).toBe("app");
    expect(env.string("MISSING", "fallback")).toBe("fallback");
    expect(env.number("APP_PORT", 80)).toBe(13000);
    expect(env.boolean("APP_ENABLED", false)).toBe(true);
    expect(env.list("APP_LOCALES", [])).toEqual(["en-US", "zh-CN"]);
  });

  it("loads config factories with injected env and paths", () => {
    const env = createConfigEnv({
      APP_NAME: "orders",
    });
    const paths = createConfigPaths({
      rootDir: "/tmp/app",
    });
    const factories = {
      app: defineConfig(({ env, paths }) => ({
        name: env.string("APP_NAME", "app"),
        storage: paths.storage("database.sqlite"),
      })),
    };

    expect(loadConfig(factories, { env, paths })).toEqual({
      app: {
        name: "orders",
        storage: "/tmp/app/storage/database.sqlite",
      },
    });
  });
});

describe("app database manager", () => {
  it("skips manager creation for the none connection", () => {
    const config: AppDatabaseConfig = {
      default: "none",
      connections: {},
      migrations: {
        directory: "/tmp/app/server/migrations",
        autoRun: false,
      },
    };

    expect(createAppDatabaseManager(config)).toBeUndefined();
  });

  it("creates a lazy database manager for configured connections", () => {
    const config: AppDatabaseConfig = {
      default: "sqlite",
      connections: {
        sqlite: {
          dialect: "sqlite",
          filename: "/tmp/app/storage/database.sqlite",
        },
      },
      migrations: {
        directory: "/tmp/app/server/migrations",
        autoRun: false,
      },
    };

    expect(createAppDatabaseManager(config)).toBeDefined();
  });
});

describe("app database storage", () => {
  it("creates the active sqlite database parent directory", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "nocobase-app-storage-"));
    tempDirs.push(root);
    const filename = path.join(root, "storage", "database.sqlite");

    await prepareAppDatabaseStorage({
      default: "sqlite",
      connections: {
        sqlite: {
          dialect: "sqlite",
          filename,
        },
      },
      migrations: {
        directory: path.join(root, "server", "migrations"),
        autoRun: false,
      },
    });

    expect(existsSync(path.dirname(filename))).toBe(true);
  });
});

describe("app runtime context", () => {
  it("creates database and migrator services from config", () => {
    const runtime = createAppRuntime({
      database: {
        default: "sqlite",
        connections: {
          sqlite: {
            dialect: "sqlite",
            filename: "/tmp/app/storage/database.sqlite",
          },
        },
        migrations: {
          directory: "/tmp/app/server/migrations",
          autoRun: false,
        },
      },
    });

    expect(runtime.database).toBeDefined();
    expect(runtime.migrator).toBeDefined();
  });

  it("skips configured migrations unless autoRun is enabled", async () => {
    const runtime = createAppRuntime({
      database: {
        default: "none",
        connections: {},
        migrations: {
          directory: "/tmp/app/server/migrations",
          autoRun: false,
        },
      },
    });

    await expect(runConfiguredAppMigrations(runtime)).resolves.toBeUndefined();
  });
});

describe("app migrator", () => {
  it("skips missing migration directories", async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), "nocobase-app-missing-migrations-"),
    );
    const migrator = createAppMigrator({
      database: createMockDatabaseManager(),
      config: {
        directory: path.join(root, "migrations"),
        autoRun: true,
      },
    });

    await expect(migrator.latest()).resolves.toEqual({
      status: "skipped",
      reason: "missing-directory",
    });
  });

  it("runs migrations from the configured directory", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "nocobase-app-migrations-"),
    );
    const latest = vi.fn().mockResolvedValue({
      batch: 2,
      executed: ["001_create_users"],
      skipped: ["000_create_accounts"],
    });
    const rollback = vi.fn();
    createDatabaseMigratorMock.mockReturnValue({ latest, rollback });
    const database = createMockDatabaseManager();
    const migrator = createAppMigrator({
      database,
      config: {
        directory,
        autoRun: true,
        tableName: "app_migrations",
        lockTableName: "app_migration_lock",
        extensions: [".js", ".mjs"],
      },
    });

    await expect(migrator.latest()).resolves.toEqual({
      status: "completed",
      batch: 2,
      executed: ["001_create_users"],
      skipped: ["000_create_accounts"],
    });
    expect(createDatabaseMigratorMock).toHaveBeenCalledWith({
      database,
      connection: undefined,
      directory,
      tableName: "app_migrations",
      lockTableName: "app_migration_lock",
      extensions: [".js", ".mjs"],
    });
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("rolls back migrations from the configured directory", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "nocobase-app-migrations-"),
    );
    const latest = vi.fn();
    const rollback = vi.fn().mockResolvedValue({
      batch: 2,
      rolledBack: ["001_create_users"],
    });
    createDatabaseMigratorMock.mockReturnValue({ latest, rollback });
    const migrator = createAppMigrator({
      database: createMockDatabaseManager(),
      config: {
        directory,
        autoRun: true,
      },
      connection: "tenant",
    });

    await expect(migrator.rollback()).resolves.toEqual({
      status: "completed",
      batch: 2,
      rolledBack: ["001_create_users"],
    });
    expect(createDatabaseMigratorMock).toHaveBeenCalledWith({
      database: expect.any(Object),
      connection: "tenant",
      directory,
      tableName: undefined,
      lockTableName: undefined,
      extensions: undefined,
    });
    expect(rollback).toHaveBeenCalledTimes(1);
  });
});

function createMockDatabaseManager(client: unknown = {}): DatabaseManager {
  return {
    connection: vi.fn().mockReturnValue({
      client: vi.fn().mockResolvedValue(client),
    }) as DatabaseManager["connection"],
    builder: vi.fn() as DatabaseManager["builder"],
    query: vi.fn() as DatabaseManager["query"],
    connect: vi.fn() as DatabaseManager["connect"],
    transaction: vi.fn() as DatabaseManager["transaction"],
    disconnect: vi.fn() as DatabaseManager["disconnect"],
    reconnect: vi.fn() as DatabaseManager["reconnect"],
    destroy: vi.fn() as DatabaseManager["destroy"],
  };
}
