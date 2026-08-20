import { runAppMigrations } from '../server/migrate.js';
import { createStandaloneRuntime } from '../server/standalone.js';

await runAppMigrations(createStandaloneRuntime());
