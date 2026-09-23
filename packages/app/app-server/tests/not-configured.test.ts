import { describe, expect, it } from 'vitest';

import {
  ApplicationNotConfiguredError,
  findApplicationNotConfigured,
} from '../src/config/index.js';
import { formatNotConfigured } from '../src/node/not-configured-message.js';

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

describe('formatNotConfigured', () => {
  it('says what is missing, then how to create the configuration', () => {
    expect(
      formatNotConfigured(
        new ApplicationNotConfiguredError('auth.secret is not set.', {
          key: 'auth.secret',
          environmentVariable: 'AUTH_SECRET',
        }),
      ),
    ).toBe(
      [
        'This application is not configured: auth.secret is not set.',
        '',
        'Create the configuration with:',
        '  pnpm config:init',
        '',
        'Run it inside dist/ for a built application.',
        'If a configuration file already exists, set auth.secret in it, or AUTH_SECRET in the environment.',
      ].join('\n'),
    );
  });

  it('leaves out the environment when no variable supplies the key', () => {
    expect(
      formatNotConfigured(
        new ApplicationNotConfiguredError('database.default is not set', {
          key: 'database.default',
        }),
      ),
    ).toContain('set database.default in it.');
  });
});
