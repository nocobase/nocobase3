import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppInspectClient from './inspect-client.js';
import AppInspectServer from './inspect-server.js';

/**
 * Commands that only exist while the application runs from source.
 *
 * Client inspection loads Vite and browser-only client modules to read client declarations, and neither is present in
 * a server deployment — `pnpm build` emits the server half alone. These are kept out of `cli/commands/` so that the
 * compiled CLI never carries a command that would fail the moment anyone ran it.
 */
const devCommands: AppCliCommands = {
  'inspect:client': AppInspectClient,
  'inspect:server': AppInspectServer,
};

export default devCommands;
