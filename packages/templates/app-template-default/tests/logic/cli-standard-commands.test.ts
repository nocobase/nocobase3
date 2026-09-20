// @vitest-environment node
import { expect, it } from 'vitest';
import commands from '../../cli/standard-commands.js';

it('exposes the template-specific publishing command surface', () => {
  expect(commands).toHaveProperty('migrate');
  expect(commands).toHaveProperty('seed');
  expect(commands).toHaveProperty('upload');
  expect(commands).toHaveProperty('deploy');
});
