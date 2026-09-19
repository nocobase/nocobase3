import {
  defineCliPlugins,
  type AppCliPlugins,
} from '@nocobase/nb3-cli/plugins';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
const cliPlugins: AppCliPlugins = defineCliPlugins([]);

export default cliPlugins;
