import type { Kysely, Migration, MigrationProvider } from "kysely";
import type { FilesDatabase } from "../database-types.ts";
import { down, migrationId, up } from "./001-create-files-tables.ts";

export const filesMigrations: Record<string, Migration> = { [migrationId]: { up, down } };
export class FilesMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> { return filesMigrations; }
}
export type FilesMigrationDb = Kysely<FilesDatabase>;
export { migrationId };
