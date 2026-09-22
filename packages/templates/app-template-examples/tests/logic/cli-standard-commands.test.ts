// @vitest-environment node
import { expect, it } from 'vitest';
import commands from '../../cli/standard-commands.js';

it('exposes the template-specific publishing command surface', () => {
  expect(commands).toHaveProperty('db:apply');
  expect(commands).toHaveProperty('db:reset');
  expect(commands).toHaveProperty('db:repair');
  expect(commands).toHaveProperty('db:rollback');
  expect(commands).toHaveProperty('db:redo');
  expect(commands).not.toHaveProperty('upload');
  expect(commands).not.toHaveProperty('deploy');
});
