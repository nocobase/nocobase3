import type { Kysely } from "kysely";
import type { FilesDatabase } from "../database-types.ts";

export const maintenanceMigrationId = "002-add-upload-cleanup-status";

export async function up(db: Kysely<FilesDatabase>): Promise<void> {
  const uploads = (await db.introspection.getTables()).find(table => table.name === "file_uploads");
  if (!uploads?.columns.some(column => column.name === "cleanup_status")) {
    await db.schema.alterTable("file_uploads").addColumn("cleanup_status", "varchar(32)", column => column.notNull().defaultTo("pending")).execute();
  }
}

export async function down(db: Kysely<FilesDatabase>): Promise<void> {
  const uploads = (await db.introspection.getTables()).find(table => table.name === "file_uploads");
  if (uploads?.columns.some(column => column.name === "cleanup_status")) {
    await db.schema.alterTable("file_uploads").dropColumn("cleanup_status").execute();
  }
}
