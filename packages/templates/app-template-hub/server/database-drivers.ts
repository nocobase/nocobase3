import sqlite from '@nocobase/db-sqlite';
import { registerAppDatabaseDrivers } from '@nocobase/app-server/database';

export const databaseDrivers: { sqlite: typeof sqlite } = { sqlite };

registerAppDatabaseDrivers(databaseDrivers);
