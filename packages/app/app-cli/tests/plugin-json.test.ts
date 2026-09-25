import { describe, expect, it } from 'vitest';

import { CommandError, isCommandError } from '../src/command/errors.ts';
import {
  classifyPluginError,
  pluginCommandIssue,
  pluginError,
  pluginPlanForJson,
} from '../src/lib/plugin-json.ts';

describe('classifyPluginError', () => {
  it.each([
    [
      '@nocobase/app-plugin-x is not installed in /app and --no-install was given.',
      'PLUGIN_NOT_INSTALLED',
      'Install dependencies and retry.',
    ],
    [
      '@nocobase/app-plugin-x is not registered',
      'PLUGIN_NOT_REGISTERED',
      'Register the plugin first.',
    ],
    [
      'Not registered in this app: @nocobase/app-plugin-x.',
      'PLUGIN_NOT_REGISTERED',
      'Select a registered plugin.',
    ],
    [
      'package.json declares ^2.0.0; refusing to overwrite it.',
      'DEPENDENCY_RANGE_CONFLICT',
      'Resolve the declared dependency range before retrying.',
    ],
    [
      'Invalid skill directory: bad_name',
      'INVALID_SKILL_DIRECTORY',
      'Use a nocobase-prefixed kebab-case Skill name; plugin Skills must retain their package-owned prefix.',
    ],
    [
      'Skill name collision: nocobase-x',
      'SKILL_NAME_COLLISION',
      'Give each plugin Skill a unique owned name.',
    ],
    [
      'pnpm failed with exit code 1.',
      'PLUGIN_COMMAND_FAILED',
      'Run the command with --help and correct the request.',
    ],
  ])(
    'classifies "%s" as %s and keeps its suggestion',
    (message, code, suggestion) => {
      const cause = new Error(message);
      const error = classifyPluginError(cause);

      expect(isCommandError(error)).toBe(true);
      expect(error).toMatchObject({
        message,
        errorCode: code,
        commandSuggestions: [{ message: suggestion }],
        exitCode: 1,
      });
      // The cause only repeats the message, so it is not attached twice for oclif to print under "Caused by".
      expect(error.cause).toBeUndefined();
    },
  );

  it('keeps a cause that says something the message does not', () => {
    const cause = new Error('EACCES: permission denied, open package.json');
    const error = new CommandError('Could not update package.json.', {
      code: 'PLUGIN_COMMAND_FAILED',
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('passes a CommandError through, so a code chosen where it was thrown survives', () => {
    const thrown = new CommandError('pnpm could not remove x.', {
      code: 'PACKAGE_MANAGER_FAILED',
    });

    expect(classifyPluginError(thrown)).toBe(thrown);
  });

  it('classifies a thrown value that is not an Error by its string form', () => {
    expect(classifyPluginError('x is not installed')).toMatchObject({
      message: 'x is not installed',
      errorCode: 'PLUGIN_NOT_INSTALLED',
    });
  });
});

describe('pluginError', () => {
  it('keeps the exit code a failed package manager reported', () => {
    expect(
      pluginError('pnpm exited with code 17. Nothing was registered.', {
        exit: 17,
      }),
    ).toMatchObject({ errorCode: 'PLUGIN_COMMAND_FAILED', exitCode: 17 });
  });
});

describe('pluginCommandIssue', () => {
  it('reports a recovered failure in the shape of a failed run’s error', () => {
    expect(
      pluginCommandIssue(new Error('Skill name collision: nocobase-x')),
    ).toEqual({
      code: 'SKILL_NAME_COLLISION',
      message: 'Skill name collision: nocobase-x',
      suggestions: [{ message: 'Give each plugin Skill a unique owned name.' }],
    });
  });
});

describe('pluginPlanForJson', () => {
  it('drops the rewritten sources and keeps everything else', () => {
    expect(
      pluginPlanForJson({
        changed: true,
        clientPluginsPath: '/app/client/plugins.ts',
        clientPluginsText: 'export default [];',
        manifestText: '{}',
      }),
    ).toEqual({ changed: true, clientPluginsPath: '/app/client/plugins.ts' });
  });
});
