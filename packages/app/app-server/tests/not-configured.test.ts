import { describe, expect, it } from 'vitest';

import {
  ApplicationNotConfiguredError,
  findApplicationNotConfigured,
} from '../src/config/index.js';

describe('findApplicationNotConfigured', () => {
  it('recognises the error itself', () => {
    const error = new ApplicationNotConfiguredError('Run pnpm config:init.');

    expect(findApplicationNotConfigured(error)).toBe(error);
  });

  /** Startup wraps what a provider throws, so the instruction is looked for down the cause chain. */
  it('finds it when startup wraps it', () => {
    const cause = new ApplicationNotConfiguredError('Run pnpm config:init.');

    expect(
      findApplicationNotConfigured(
        new Error('Startup failed', {
          cause: new Error('Provider failed', { cause }),
        }),
      ),
    ).toBe(cause);
  });

  /** A second copy of this package throws its own class; the name is what both copies agree on. */
  it('recognises one thrown by another copy of the package', () => {
    const foreign = new Error('Run pnpm config:init.');
    foreign.name = 'ApplicationNotConfiguredError';

    expect(findApplicationNotConfigured(foreign)).toBe(foreign);
  });

  it('leaves every other failure alone', () => {
    expect(
      findApplicationNotConfigured(new Error('EADDRINUSE')),
    ).toBeUndefined();
    expect(findApplicationNotConfigured('not an error')).toBeUndefined();
  });
});
