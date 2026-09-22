// @vitest-environment node
import { expect, it } from 'vitest';
import commands from '../../cli/standard-commands.js';
import appCommands from '../../cli/commands/index.js';

it('exposes the shared command surface', () => {
  expect(commands).toHaveProperty('db:apply');
  expect(commands).toHaveProperty('db:reset');
  expect(commands).toHaveProperty('db:repair');
  expect(commands).toHaveProperty('db:rollback');
  expect(commands).toHaveProperty('db:redo');
  expect(commands).toHaveProperty('db:unlock');
  expect(commands).toHaveProperty('db:doctor');
  expect(commands).toHaveProperty('upload');
  expect(commands).toHaveProperty('deploy');
});

/**
 * `standard-commands` is the map the CLI package hands this application;
 * `cli/commands/index.ts` is what the CLI loads. A command in the first and
 * missing from the second answers to nothing, which is how `db:rollback`,
 * `db:redo`, `db:unlock` and `db:doctor` first shipped unreachable.
 */
it('reaches every shared command through the loaded registry', () => {
  for (const name of Object.keys(commands)) {
    expect(appCommands).toHaveProperty(name);
    expect(appCommands[name as keyof typeof appCommands]).toBe(
      commands[name as keyof typeof commands],
    );
  }
});
