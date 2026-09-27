// A separate process consuming one memory state directory, for the
// multi-process tests. It prints one line per firing it ran and exits when
// its parent closes stdin.
import { createMemoryScheduleExecutor } from '../../src/memory/index.js';

const [directory, label] = process.argv.slice(2) as [string, string];

const executor = createMemoryScheduleExecutor(
  {
    adapter: 'memory',
    key: 'memory',
    builtIn: false,
    scope: '@nocobase/app-plugin-scheduler',
    namespace: 'crm',
    concurrency: 1,
    attempts: 1,
    persistencePath: directory,
  },
  {},
  { pollInterval: 50 },
);

await executor.addJob({
  name: 'shared',
  options: { every: 100 },
  payload: {},
  execute: async ({ jobId }) => {
    process.stdout.write(`${label} ${jobId}\n`);
  },
});
await executor.setup();
process.stdout.write('ready\n');

process.stdin.resume();
process.stdin.on('end', () => {
  void executor.shutdown().then(() => process.exit(0));
});
