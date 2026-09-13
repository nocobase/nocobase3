import sqlite from '@nocobase/db-sqlite';
import postgres from '@nocobase/db-postgres';
import mysql from '@nocobase/db-mysql';
import oracle from '@nocobase/db-oracle';
import { registerAppDatabaseDrivers } from '@nocobase/app-server/database';

export const databaseDrivers: {
  sqlite: typeof sqlite;
  postgres: typeof postgres;
  mysql: typeof mysql;
  oracle: typeof oracle;
} = { sqlite, postgres, mysql, oracle };

registerAppDatabaseDrivers(databaseDrivers);
