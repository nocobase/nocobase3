import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  pluginJsonFailure,
  pluginJsonSuccess,
  type PluginCommandStatus,
  type PluginCommandSuccessStatus,
  type PluginJsonEnvelope,
} from '../src/lib/plugin-json.ts';

describe('plugin JSON envelopes', () => {
  it('keeps success and failure statuses structurally distinct', () => {
    const success = pluginJsonSuccess('plugin:test', 'success-noop', {
      changed: false,
    });
    const failure = pluginJsonFailure('plugin:test', {
      code: 'PLUGIN_TEST_FAILED',
      message: 'The test operation failed.',
      suggestions: ['Correct the test request.'],
    });

    expect(success).toEqual({
      schemaVersion: 1,
      ok: true,
      operation: 'plugin:test',
      status: 'success-noop',
      result: { changed: false },
    });
    expect(failure).toEqual({
      schemaVersion: 1,
      ok: false,
      operation: 'plugin:test',
      status: 'failure',
      error: {
        code: 'PLUGIN_TEST_FAILED',
        message: 'The test operation failed.',
        suggestions: ['Correct the test request.'],
      },
    });

    expectTypeOf(success.status).toEqualTypeOf<PluginCommandSuccessStatus>();
    expectTypeOf(failure.status).toEqualTypeOf<'failure'>();
    expectTypeOf(success).toMatchTypeOf<PluginJsonEnvelope>();
    expectTypeOf(failure).toMatchTypeOf<PluginJsonEnvelope>();
    expectTypeOf<PluginCommandStatus>().toEqualTypeOf<
      PluginCommandSuccessStatus | 'failure'
    >();
  });
});
