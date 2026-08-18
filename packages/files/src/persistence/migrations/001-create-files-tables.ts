import type { Kysely } from "kysely";
import type { FilesDatabase } from "../database-types.ts";

export const migrationId = "001-create-files-tables";

export async function up(db: Kysely<FilesDatabase>): Promise<void> {
  await db.schema.createTable("files").ifNotExists()
    .addColumn("id", "varchar(256)", c => c.primaryKey())
    .addColumn("workspace_id", "varchar(256)", c => c.notNull())
    .addColumn("backend_key", "varchar(256)", c => c.notNull())
    .addColumn("policy", "varchar(256)", c => c.notNull())
    .addColumn("storage_key", "varchar(1024)", c => c.notNull().unique())
    .addColumn("original_name", "varchar(1024)", c => c.notNull())
    .addColumn("content_type", "varchar(512)", c => c.notNull())
    .addColumn("size", "bigint", c => c.notNull())
    .addColumn("checksum_sha256", "varchar(128)")
    .addColumn("status", "varchar(32)", c => c.notNull())
    .addColumn("access_context_json", "text")
    .addColumn("created_by", "varchar(256)", c => c.notNull())
    .addColumn("created_at", "timestamp", c => c.notNull())
    .addColumn("updated_at", "timestamp", c => c.notNull())
    .addColumn("deleted_at", "timestamp")
    .addColumn("storage_delete_status", "varchar(32)", c => c.notNull().defaultTo("pending"))
    .addColumn("storage_deleted_at", "timestamp")
    .execute();
  await db.schema.createIndex("files_workspace_id_id_idx").ifNotExists().on("files").columns(["workspace_id", "id"]).execute();
  await db.schema.createIndex("files_workspace_id_status_idx").ifNotExists().on("files").columns(["workspace_id", "status"]).execute();
  await db.schema.createTable("file_uploads").ifNotExists()
    .addColumn("id", "varchar(256)", c => c.primaryKey())
    .addColumn("workspace_id", "varchar(256)", c => c.notNull())
    .addColumn("file_id", "varchar(256)", c => c.notNull().references("files.id"))
    .addColumn("created_by", "varchar(256)", c => c.notNull())
    .addColumn("idempotency_key", "varchar(256)", c => c.notNull())
    .addColumn("request_fingerprint", "varchar(512)", c => c.notNull())
    .addColumn("status", "varchar(32)", c => c.notNull())
    .addColumn("expires_at", "timestamp", c => c.notNull())
    .addColumn("provider_state_json", "text")
    .addColumn("created_at", "timestamp", c => c.notNull())
    .addColumn("completed_at", "timestamp")
    .addUniqueConstraint("file_uploads_idempotency_uq", ["workspace_id", "created_by", "idempotency_key"])
    .execute();
  await db.schema.createIndex("file_uploads_workspace_file_idx").ifNotExists().on("file_uploads").columns(["workspace_id", "file_id"]).execute();
  await db.schema.createIndex("file_uploads_status_expires_idx").ifNotExists().on("file_uploads").columns(["status", "expires_at"]).execute();
}

export async function down(db: Kysely<FilesDatabase>): Promise<void> {
  await db.schema.dropTable("file_uploads").ifExists().execute();
  await db.schema.dropTable("files").ifExists().execute();
}
