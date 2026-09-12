import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppI18nCheck from './i18n-check.js';
import AppInfo from './info.js';
import AppMigrate from './migrate.js';
import AppSeed from './seed.js';

// Commands this application owns. Each key is the name it answers to under the
// `app` topic, so `info` becomes `pnpm nocobase app info`.
const appCommands: AppCliCommands = {
  'i18n:check': AppI18nCheck,
  info: AppInfo,
  migrate: AppMigrate,
  seed: AppSeed,
};

export default appCommands;
