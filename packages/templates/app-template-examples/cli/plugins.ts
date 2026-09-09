import {
  defineCliPlugins,
  type AppCliPlugins,
} from '@nocobase/nb3-cli/plugins';
import cliExample from '@nocobase/app-plugin-cli-example/cli';
import workflow from '@nocobase/app-plugin-workflow/cli';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
const cliPlugins: AppCliPlugins = defineCliPlugins([cliExample, workflow]);

export default cliPlugins;
