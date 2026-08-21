import { defineMigration, type MigrationDefinition } from "@nocobase/database";

const migration: MigrationDefinition = defineMigration({
  name: "202608190001_create_notification_tables",
  async up({ builder }) {
    await builder.createCollection("notifications", (table) => {
      table.string("id", { length: 36 }).primary();
      table.string("sourceType", { length: 100 }).notNull();
      table.string("sourceReferenceId", { length: 191 }).nullable();
      table.string("principalService", { length: 191 }).notNull();
      table.datetime("triggeredAt").notNull();
      table.string("messageMode", { length: 32 }).notNull();
      table.string("templateName", { length: 191 }).nullable();
      table.string("templateVersion", { length: 100 }).nullable();
      table.string("summaryStatus", { length: 32 }).notNull();
      table.integer("version").notNull().defaultTo(1);
      table.datetime("createdAt").notNull();
      table.datetime("updatedAt").notNull();
    });
    await builder.createCollection("notificationDeliveries", (table) => {
      table.string("id", { length: 36 }).primary();
      table.string("notificationId", { length: 36 }).notNull();
      table.string("channel", { length: 100 }).notNull();
      table.string("recipientKey", { length: 255 }).notNull();
      table.json("recipientSnapshot").notNull();
      table.integer("recipientSchemaVersion").notNull().defaultTo(1);
      table.json("contentSnapshot").notNull();
      table.integer("contentSchemaVersion").notNull().defaultTo(1);
      table.json("providerChainSnapshot").notNull();
      table.integer("providerChainSchemaVersion").notNull().defaultTo(1);
      table.integer("providerCursor").notNull().defaultTo(0);
      table.integer("currentAttempt").notNull().defaultTo(0);
      table.string("status", { length: 32 }).notNull();
      table.datetime("statusChangedAt").notNull();
      table.datetime("nextRunAt").nullable();
      table.string("leaseToken", { length: 100 }).nullable();
      table.string("leaseOwner", { length: 191 }).nullable();
      table.datetime("leaseExpiresAt").nullable();
      table.integer("version").notNull().defaultTo(1);
      table.string("lastAttemptId", { length: 36 }).nullable();
      table.json("lastError").nullable();
      table.datetime("createdAt").notNull();
      table.datetime("updatedAt").notNull();
      table.index(["status", "createdAt"], {
        name: "notification_deliveries_pending_idx",
      });
    });
    await builder.createCollection("notificationDeliveryAttempts", (table) => {
      table.string("id", { length: 36 }).primary();
      table.string("deliveryId", { length: 36 }).notNull();
      table.integer("attemptSequence").notNull();
      table.string("providerInstance", { length: 191 }).notNull();
      table.string("providerType", { length: 100 }).notNull();
      table.string("status", { length: 32 }).notNull();
      table.datetime("startedAt").notNull();
      table.datetime("finishedAt").nullable();
      table.string("providerMessageId", { length: 191 }).nullable();
      table.string("errorCategory", { length: 64 }).nullable();
      table.string("errorCode", { length: 191 }).nullable();
      table.text("errorMessage").nullable();
      table.integer("metadataSchemaVersion").notNull().defaultTo(1);
      table.datetime("createdAt").notNull();
      table.datetime("updatedAt").notNull();
      table.unique(["deliveryId", "attemptSequence"], {
        name: "notification_attempt_sequence_unique",
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection("notificationDeliveryAttempts");
    await builder.dropCollection("notificationDeliveries");
    await builder.dropCollection("notifications");
  },
});

export default migration;
