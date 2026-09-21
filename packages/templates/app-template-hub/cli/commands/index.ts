import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppCollectionsGenerate from './collections-generate.js';
import AppI18nCheck from './i18n-check.js';
import AppInfo from './info.js';
import AppDbApply from './db-apply.js';
import AppDbRepair from './db-repair.js';
import AppDbReset from './db-reset.js';

// Commands this application owns. Each key is the name it answers to under the
// `app` topic, so `info` becomes `pnpm nocobase app info`.
const appCommands: AppCliCommands = {
  'collections:generate': AppCollectionsGenerate,
  'i18n:check': AppI18nCheck,
  info: AppInfo,
  'db:apply': AppDbApply,
  'db:reset': AppDbReset,
  'db:repair': AppDbRepair,
};

export default appCommands;
