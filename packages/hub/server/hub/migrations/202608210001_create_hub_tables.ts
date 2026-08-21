import {
  defineMigration,
  type CollectionBuilder,
  type MigrationDefinition,
} from "@nocobase/database";

const migration: MigrationDefinition = defineMigration({
  name: "202608210001_create_hub_tables",

  async up(context) {
    await createEnvironmentCollection(context.builder);
    await createApplicationCollection(context.builder);
    await createReleaseCollection(context.builder);
    await createDeploymentCollection(context.builder);
    await createDeploymentEventCollection(context.builder);
    await createRuntimeSnapshotCollection(context.builder);
    await createHubRoleAssignmentCollection(context.builder);
    await createHubAppScopeCollection(context.builder);
    await createHubAuditLogCollection(context.builder);
    await createHubSettingCollection(context.builder);

    await context.query
      .insertInto("hubEnvironments")
      .values({
        id: "default",
        name: "default",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
  },

  async down(context) {
    await context.builder.dropCollection("hubSettings");
    await context.builder.dropCollection("hubAuditLogs");
    await context.builder.dropCollection("hubAppScopes");
    await context.builder.dropCollection("hubRoleAssignments");
    await context.builder.dropCollection("hubRuntimeSnapshots");
    await context.builder.dropCollection("hubDeploymentEvents");
    await context.builder.dropCollection("hubDeployments");
    await context.builder.dropCollection("hubReleases");
    await context.builder.dropCollection("hubApplications");
    await context.builder.dropCollection("hubEnvironments");
  },
});

export default migration;

async function createEnvironmentCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubEnvironments", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("name", { length: 128 }).notNull();
    collection.string("status", { length: 32 }).notNull();
    collection.datetime("createdAt").notNull();
    collection.datetime("updatedAt").notNull();
    collection.primary("id", { name: "pk_hub_environments" });
    collection.unique("name", { name: "uq_hub_environments_name" });
  });
}

async function createApplicationCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubApplications", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("slug", { length: 128 }).notNull();
    collection.string("name", { length: 255 }).notNull();
    collection.text("description").nullable();
    collection.string("status", { length: 32 }).notNull();
    collection.string("defaultEnvironmentId", { length: 64 }).notNull();
    collection.string("activeReleaseId", { length: 64 }).nullable();
    collection.string("createdBy", { length: 64 }).notNull();
    collection.datetime("createdAt").notNull();
    collection.datetime("updatedAt").notNull();
    collection.primary("id", { name: "pk_hub_applications" });
    collection.unique("slug", { name: "uq_hub_applications_slug" });
    collection.index("status", { name: "idx_hub_applications_status" });
  });
}

async function createReleaseCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubReleases", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("applicationId", { length: 64 }).notNull();
    collection.string("version", { length: 128 }).notNull();
    collection.string("checksum", { length: 128 }).notNull();
    collection.json("manifest").notNull();
    collection.string("storageKey", { length: 1024 }).nullable();
    collection.integer("sizeBytes").nullable();
    collection.string("sourceCommit", { length: 255 }).nullable();
    collection.string("verificationStatus", { length: 32 }).notNull();
    collection.string("createdBy", { length: 64 }).notNull();
    collection.datetime("createdAt").notNull();
    collection.primary("id", { name: "pk_hub_releases" });
    collection.unique(["applicationId", "version"], {
      name: "uq_hub_releases_app_version",
    });
    collection.index("applicationId", { name: "idx_hub_releases_app" });
  });
}

async function createDeploymentCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubDeployments", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("applicationId", { length: 64 }).notNull();
    collection.string("environmentId", { length: 64 }).notNull();
    collection.string("targetReleaseId", { length: 64 }).notNull();
    collection.string("previousReleaseId", { length: 64 }).nullable();
    collection.string("type", { length: 32 }).notNull();
    collection.string("status", { length: 32 }).notNull();
    collection.string("requestedBy", { length: 64 }).notNull();
    collection.string("idempotencyKey", { length: 255 }).nullable();
    collection.string("hostOperationId", { length: 128 }).nullable();
    collection.datetime("startedAt").nullable();
    collection.datetime("finishedAt").nullable();
    collection.string("failureCode", { length: 128 }).nullable();
    collection.text("failureMessage").nullable();
    collection.datetime("createdAt").notNull();
    collection.primary("id", { name: "pk_hub_deployments" });
    collection.index(["applicationId", "createdAt"], {
      name: "idx_hub_deployments_app_created",
    });
    collection.index("status", { name: "idx_hub_deployments_status" });
    collection.unique(["applicationId", "idempotencyKey"], {
      name: "uq_hub_deployments_idempotency",
    });
  });
}

async function createDeploymentEventCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubDeploymentEvents", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("deploymentId", { length: 64 }).notNull();
    collection.integer("sequence").notNull();
    collection.string("type", { length: 64 }).notNull();
    collection.string("status", { length: 32 }).notNull();
    collection.text("message").nullable();
    collection.string("hostId", { length: 128 }).nullable();
    collection.string("runtimeId", { length: 128 }).nullable();
    collection.json("details").notNull();
    collection.datetime("createdAt").notNull();
    collection.primary("id", { name: "pk_hub_deployment_events" });
    collection.unique(["deploymentId", "sequence"], {
      name: "uq_hub_deployment_events_sequence",
    });
    collection.index("deploymentId", {
      name: "idx_hub_deployment_events_deployment",
    });
  });
}

async function createRuntimeSnapshotCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubRuntimeSnapshots", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("applicationId", { length: 64 }).notNull();
    collection.string("environmentId", { length: 64 }).notNull();
    collection.string("runtimeId", { length: 128 }).nullable();
    collection.string("releaseId", { length: 64 }).nullable();
    collection.string("state", { length: 32 }).notNull();
    collection.string("health", { length: 32 }).notNull();
    collection.datetime("startedAt").nullable();
    collection.datetime("lastSeenAt").nullable();
    collection.datetime("updatedAt").notNull();
    collection.primary("id", { name: "pk_hub_runtime_snapshots" });
    collection.unique(["applicationId", "environmentId"], {
      name: "uq_hub_runtime_snapshots_target",
    });
  });
}

async function createHubRoleAssignmentCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubRoleAssignments", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("userId", { length: 64 }).notNull();
    collection.string("role", { length: 32 }).notNull();
    collection.string("applicationId", { length: 64 }).nullable();
    collection.boolean("disabled").notNull().defaultTo(false);
    collection.datetime("createdAt").notNull();
    collection.datetime("updatedAt").notNull();
    collection.primary("id", { name: "pk_hub_role_assignments" });
    collection.unique(["userId", "role", "applicationId"], {
      name: "uq_hub_role_assignments_subject",
    });
    collection.index("userId", { name: "idx_hub_role_assignments_user" });
  });
}

async function createHubAppScopeCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubAppScopes", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("userId", { length: 64 }).notNull();
    collection.string("applicationId", { length: 64 }).notNull();
    collection.json("actions").notNull();
    collection.datetime("createdAt").notNull();
    collection.datetime("updatedAt").notNull();
    collection.primary("id", { name: "pk_hub_app_scopes" });
    collection.unique(["userId", "applicationId"], {
      name: "uq_hub_app_scopes_subject_app",
    });
  });
}

async function createHubAuditLogCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubAuditLogs", (collection) => {
    collection.string("id", { length: 64 }).notNull();
    collection.string("actorId", { length: 64 }).nullable();
    collection.string("action", { length: 128 }).notNull();
    collection.string("resource", { length: 128 }).notNull();
    collection.string("resourceId", { length: 128 }).nullable();
    collection.json("details").notNull();
    collection.string("requestId", { length: 128 }).nullable();
    collection.datetime("createdAt").notNull();
    collection.primary("id", { name: "pk_hub_audit_logs" });
    collection.index(["resource", "resourceId"], {
      name: "idx_hub_audit_logs_resource",
    });
  });
}

async function createHubSettingCollection(
  builder: CollectionBuilder,
): Promise<void> {
  await builder.createCollection("hubSettings", (collection) => {
    collection.string("key", { length: 128 }).notNull();
    collection.text("value").nullable();
    collection.datetime("updatedAt").notNull();
    collection.primary("key", { name: "pk_hub_settings" });
  });
}
