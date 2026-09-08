import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppInfo from './info.ts';

// Commands this application owns. Each key is the name it answers to under the
// `app` topic, so `info` becomes `pnpm nocobase app info`.
const appCommands: AppCliCommands = {
  info: AppInfo,
};

export default appCommands;
