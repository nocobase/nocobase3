import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandFailureJson,
  commandSuccessJson,
} from '../../packages/app/app-cli/src/command/envelope.ts';
import {
  CommandError,
  describeCommandError,
} from '../../packages/app/app-cli/src/command/errors.ts';
import { unsupportedNodeVersionEnvelope } from '../../packages/tools/app-installer/bin/node-version.js';
import { InstallerError } from '../../packages/tools/app-installer/src/lib/errors.ts';
import {
  errorEnvelope,
  successEnvelope,
} from '../../packages/tools/app-installer/src/lib/output.ts';

// app-installer promises that a script which reads `pnpm nocobase … --json` reads its `--json` the same way. The two
// packages cannot import each other — app-installer runs on a server before any application exists — so each keeps
// its own envelope, and they drifted once: app-installer reported a failure as `error` where the application CLI says
// `failure`, and named a suggestion's command as a shell line where the application CLI gives `{ command, args }`.
// This builds the same outcome through both and compares what a script actually reads: the serialized document,
// member order included.

const printed = (envelope) => JSON.stringify(envelope);

/** One failure, raised the way each CLI raises it. */
const failure = {
  code: 'PORT_IN_USE',
  message: 'Port 13000 is already in use.',
  suggestions: [
    {
      message: 'See what holds it:',
      run: { command: 'lsof', args: ['-i', ':13000'] },
    },
    { message: 'Or choose another port with --port.' },
  ],
  details: { freePort: 13001 },
};

function appCliFailure({ details } = failure) {
  const error = new CommandError(failure.message, {
    code: failure.code,
    suggestions: failure.suggestions,
    details,
    exit: 2,
  });
  return commandFailureJson('install', describeCommandError(error).json, [
    'a warning',
  ]);
}

function installerFailure({ details } = failure) {
  const error = new InstallerError(failure.code, failure.message, {
    exitCode: 2,
    suggestions: failure.suggestions,
    details,
  });
  return errorEnvelope('install', error, ['a warning']);
}

test('a success prints the same document from both CLIs', () => {
  for (const status of ['success', 'success-noop']) {
    assert.equal(
      printed(
        successEnvelope('status', { current: '1.0.0' }, ['a warning'], status),
      ),
      printed(
        commandSuccessJson('status', status, { current: '1.0.0' }, [
          'a warning',
        ]),
      ),
    );
  }
});

test('a success with no result prints `result: null` from both CLIs', () => {
  assert.equal(
    printed(successEnvelope('status', undefined, [])),
    printed(commandSuccessJson('status', 'success', undefined, [])),
  );
});

test('a failure prints the same document from both CLIs, suggestions and details included', () => {
  assert.equal(printed(installerFailure()), printed(appCliFailure()));
  assert.equal(JSON.parse(printed(installerFailure())).status, 'failure');
});

test('a failure without details leaves `details` out in both CLIs', () => {
  assert.equal(
    printed(installerFailure({ details: undefined })),
    printed(appCliFailure({ details: undefined })),
  );
});

test('an unexpected error prints the same document from both CLIs', () => {
  const error = new Error('Something broke.');
  assert.equal(
    printed(errorEnvelope('status', error, [])),
    printed(commandFailureJson('status', describeCommandError(error).json, [])),
  );
});

test("app-installer's Node.js guard answers in the application CLI's failure envelope", () => {
  const guard = unsupportedNodeVersionEnvelope('install', 'v22.0.0');
  const reference = commandFailureJson(
    'install',
    describeCommandError(
      new CommandError(guard.error.message, {
        code: guard.error.code,
        suggestions: guard.error.suggestions,
      }),
    ).json,
    [],
  );
  assert.equal(printed(guard), printed(reference));
});
