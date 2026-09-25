// @vitest-environment node
import { expect, it } from 'vitest';
import appCommands from '../../cli/commands/index.js';

// `cli/commands/index.ts` is what the CLI loads, so a shared command missing
// from it answers to nothing, which is how `db:rollback`, `db:redo`,
// `db:unlock` and `db:doctor` first shipped unreachable.
it('exposes the shared command surface through the loaded registry', () => {
  expect(appCommands).toHaveProperty('db:apply');
  expect(appCommands).toHaveProperty('db:reset');
  expect(appCommands).toHaveProperty('db:repair');
  expect(appCommands).toHaveProperty('db:rollback');
  expect(appCommands).toHaveProperty('db:redo');
  expect(appCommands).toHaveProperty('db:unlock');
  expect(appCommands).toHaveProperty('db:doctor');
  expect(appCommands).toHaveProperty('upload');
  expect(appCommands).toHaveProperty('deploy');
});
