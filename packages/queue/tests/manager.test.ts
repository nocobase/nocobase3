import { Job } from "@boringnode/queue";
import { describe, expect, it } from "vitest";

import {
  assertDefaultConnection,
  createQueueManager,
  createSyncQueueConfig,
  type AppQueueConfig,
} from "../src/index.js";

const executedPayloads: unknown[] = [];

class DemoJob extends Job<{ id: string }> {
  static options = {
    name: "QueueManagerTestDemo",
    queue: "demo",
  };

  async execute(): Promise<void> {
    executedPayloads.push(this.payload);
  }
}

describe("createQueueManager", () => {
  it("dispatches jobs through the sync connection", async () => {
    executedPayloads.length = 0;
    const queueManager = createQueueManager(createConfig());

    const result = await queueManager.dispatch(DemoJob, { id: "job-1" });

    expect(result.jobId).toEqual(expect.any(String));
    expect(executedPayloads).toEqual([{ id: "job-1" }]);

    await queueManager.close();
  });

  it("dispatches many jobs through the sync connection", async () => {
    executedPayloads.length = 0;
    const queueManager = createQueueManager(createConfig());

    const result = await queueManager.dispatchMany(DemoJob, [
      { id: "job-1" },
      { id: "job-2" },
    ]);

    expect(result.jobIds).toHaveLength(2);
    expect(executedPayloads).toEqual([{ id: "job-1" }, { id: "job-2" }]);

    await queueManager.close();
  });

  it("closes idempotently", async () => {
    const queueManager = createQueueManager(createSyncQueueConfig());

    await queueManager.init();
    await expect(queueManager.close()).resolves.toBeUndefined();
    await expect(queueManager.close()).resolves.toBeUndefined();
  });

  it("does not require database dependencies for inactive database connections", async () => {
    const queueManager = createQueueManager({
      default: "sync",
      connections: {
        sync: {
          driver: "sync",
        },
        database: {
          driver: "database",
          table: "queue_jobs",
          schedulesTable: "queue_schedules",
        },
      },
      jobs: {
        autoLoad: false,
        locations: [],
      },
    });

    await expect(queueManager.init()).resolves.toBeUndefined();
    await queueManager.close();
  });

  it("requires a DatabaseManager for active database connections", async () => {
    const queueManager = createQueueManager({
      default: "database",
      connections: {
        database: {
          driver: "database",
        },
      },
      jobs: {
        autoLoad: false,
        locations: [],
      },
    });

    await expect(queueManager.init()).rejects.toThrow(
      "Queue database connection requires a configured DatabaseManager.",
    );
  });

  it("creates a sync fallback config", () => {
    expect(createSyncQueueConfig()).toMatchObject({
      default: "sync",
      connections: {
        sync: {
          driver: "sync",
        },
      },
    });
  });
});

describe("assertDefaultConnection", () => {
  it("throws when the default connection is missing", () => {
    expect(() =>
      assertDefaultConnection({
        default: "missing",
        connections: {},
      }),
    ).toThrow('Default queue connection "missing" is not configured.');
  });
});

function createConfig(): AppQueueConfig {
  return {
    default: "sync",
    connections: {
      sync: {
        driver: "sync",
      },
    },
    queues: {
      demo: {
        connection: "sync",
      },
    },
    jobs: {
      autoLoad: false,
      locations: [],
    },
  };
}
