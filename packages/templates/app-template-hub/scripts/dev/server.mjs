import { spawn } from 'node:child_process';

// tsx watch owns restart detection, but the server uses ESM-only loading so
// synchronous require(ESM) and static imports share driver and error identities.
const child = spawn(
  process.execPath,
  ['--import', 'tsx/esm', 'server/standalone.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, TSX_TSCONFIG_PATH: 'tsconfig.server.json' },
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
