// The Node.js version guard a command-line tool's `bin/run.js` runs before loading anything else.
//
// This file is plain JavaScript with no imports on purpose: it runs on the Node.js it is there to refuse, which cannot
// load the TypeScript sources a development checkout runs from, and may not load much else either. What it prints
// under `--json` is the failure document of `@nocobase/cli-envelope`, spelled out here for the same reason; the tests
// hold the two together.

export const MINIMUM_NODE_MAJOR_VERSION = 24;

export function getNodeMajorVersion(version = process.versions.node) {
  const match = String(version ?? '')
    .trim()
    .match(/^v?(\d+)/);

  return match ? Number.parseInt(match[1], 10) : Number.NaN;
}

export function isSupportedNodeVersion(
  version = process.versions.node,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
) {
  const major = getNodeMajorVersion(version);
  return Number.isInteger(major) && major >= minimum;
}

function currentVersion(version) {
  return String(version ?? '').trim() || 'unknown';
}

/** What a person reads on stderr: two lines, each prefixed with the tool's name. */
export function formatUnsupportedNodeVersionMessage(
  name,
  version = process.version,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
) {
  const current = currentVersion(version);

  return [
    `[${name}]: Node.js ${minimum} or later is required.`,
    `[${name}]: Current version is ${current}. Install Node.js ${minimum}+ and try again.`,
  ].join('\n');
}

/** What `--json` prints: the same failure document as every other failure, with the code `NODE_UNSUPPORTED`. */
export function unsupportedNodeVersionEnvelope(
  command,
  version = process.version,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
) {
  const current = currentVersion(version);

  return {
    schemaVersion: 1,
    ok: false,
    command,
    status: 'failure',
    error: {
      code: 'NODE_UNSUPPORTED',
      message: `Node.js ${minimum} or later is required; the current version is ${current}.`,
      suggestions: [
        {
          message: `Install Node.js ${minimum} or later, then run the command again.`,
        },
      ],
    },
    warnings: [],
  };
}

/**
 * What to print for an unsupported Node.js, and where: the document on stdout when `argv` carries `--json`, so that a
 * caller reading stdout as JSON gets a result rather than nothing, and the message on stderr otherwise. `indent` is
 * for a tool that prints its documents indented; the default is one line.
 */
export function unsupportedNodeVersionOutput({
  name,
  command,
  argv,
  version = process.version,
  minimum = MINIMUM_NODE_MAJOR_VERSION,
  indent,
}) {
  return argv.includes('--json')
    ? {
        stream: 'stdout',
        text: JSON.stringify(
          unsupportedNodeVersionEnvelope(command, version, minimum),
          null,
          indent,
        ),
      }
    : {
        stream: 'stderr',
        text: formatUnsupportedNodeVersionMessage(name, version, minimum),
      };
}

/**
 * Exits once stdout and stderr have taken everything written to them. `process.exit` alone drops output still queued
 * for a pipe, which can cut the one JSON document `--json` promises in half; it is still called, so nothing a command
 * left running keeps the process alive.
 */
export async function exitWhenFlushed(code) {
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise((resolve) => stream.write('', resolve)),
    ),
  );
  process.exit(code);
}
