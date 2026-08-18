import type { Kysely, Migration, MigrationProvider } from "kysely";
import type { FilesDatabase } from "../database-types.ts";
import { down, migrationId, up } from "./001-create-files-tables.ts";
import { down as maintenanceDown, maintenanceMigrationId, up as maintenanceUp } from "./002-add-upload-cleanup-status.ts";

export const filesMigrations: Record<string, Migration> = {
  [migrationId]: { up, down },
  [maintenanceMigrationId]: { up: maintenanceUp, down: maintenanceDown },
};
export class FilesMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> { return filesMigrations; }
}
export type FilesMigrationDb = Kysely<FilesDatabase>;
export { maintenanceMigrationId, migrationId };
