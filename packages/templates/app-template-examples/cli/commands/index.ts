import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppInfo from './info.js';
import AppMigrate from './migrate.js';
import AppSeed from './seed.js';

// Commands this application owns. Each key is the name it answers to under the
// `app` topic, so `info` becomes `pnpm nocobase app info`.
const appCommands: AppCliCommands = {
  info: AppInfo,
  migrate: AppMigrate,
  seed: AppSeed,
};

export default appCommands;
