import { readFile } from 'node:fs/promises';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const archive = process.argv[2];
if (!archive) {
  throw new Error('Usage: node scripts/publint-packed-hub.mjs <tarball>');
}

const bytes = await readFile(archive);
const tarball = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const result = await publint({
  level: 'error',
  pack: { tarball },
});
const unexpected = result.messages.filter(
  (message) => !isValidatedVendoredDependency(message, result.pkg),
);

if (unexpected.length > 0) {
  for (const message of unexpected) {
    console.error(formatMessage(message, result.pkg, { color: false }));
  }
  process.exitCode = 1;
} else {
  const vendoredCount = result.messages.length;
  console.log(
    `Publint passed; validated ${vendoredCount} package-local vendored dependencies.`,
  );
}

function isValidatedVendoredDependency(message, packageJson) {
  if (
    message.code !== 'LOCAL_DEPENDENCY' ||
    message.path.length !== 2 ||
    message.path[0] !== 'dependencies'
  ) {
    return false;
  }

  const packageName = message.path[1];
  return (
    packageName.startsWith('@nocobase/') &&
    packageJson.dependencies?.[packageName] === `file:vendor/${packageName}`
  );
}
