import sqlite from '@nocobase/db-sqlite';
import dameng from '@nocobase/db-dameng';
import { registerAppDatabaseDrivers } from '@nocobase/app-server/database';

export const databaseDrivers: {
  sqlite: typeof sqlite;
  dameng: typeof dameng;
} = { sqlite, dameng };

registerAppDatabaseDrivers(databaseDrivers);
