export interface EcosystemOptions {
  /** pm2 process name. */
  name: string;
  /** Absolute path of the Node binary the Hub runs on. */
  nodePath: string;
}

/**
 * Builds `ecosystem.config.cjs`, the pm2 configuration every start goes through.
 *
 * pm2 runs `node` itself with the entry file as its argument. Pointing `script` at `standalone.js` instead has pm2's
 * fork mode load it through `ProcessContainerFork.js`, where `import.meta.main` is false, so `standalone.js` never calls
 * `startServer()` and the Hub silently never starts.
 *
 * The file resolves `current` when pm2 loads it, and pm2 keeps the resolved path for the life of the process entry:
 * `pm2 restart` after a switch still runs the old release. Switching releases therefore means `pm2 delete` and
 * `pm2 start` again, never `pm2 restart`.
 */
export function buildEcosystemConfig(options: EcosystemOptions): string {
  return `// Written by hub-installer. Starting the Hub always goes through this file.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const root = __dirname;
const env = parseEnv(fs.readFileSync(path.join(root, 'hub.env'), 'utf8'));

module.exports = {
  apps: [
    {
      name: ${JSON.stringify(options.name)},
      // Run node itself so standalone.js is the main module (import.meta.main).
      script: ${JSON.stringify(options.nodePath)},
      // Resolved on every \`pm2 start\`; a switched \`current\` needs delete + start, not restart.
      args: [fs.realpathSync(path.join(root, 'current/dist/server/standalone.js'))],
      interpreter: 'none',
      cwd: root,
      env,
      autorestart: true,
      min_uptime: '30s',
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
      // pm2 sends SIGKILL 1.6s after SIGINT by default; the Hub waits for deployments and its App Host first.
      kill_timeout: 60000,
      // The Hub stops its App Host child itself, and the child exits on its own if the Hub is killed.
      treekill: false,
      out_file: path.join(root, 'logs/hub.out.log'),
      error_file: path.join(root, 'logs/hub.err.log'),
      time: true,
    },
  ],
};
`;
}
