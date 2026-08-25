import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyReleaseContract } from './lib/release-contract.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), '..');

function parseArguments(argv) {
  const allowed = new Set(['env', 'yes']);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--') || !allowed.has(argument.slice(2))) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (argument === '--yes') {
      values.yes = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  return values;
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = verifyReleaseContract({
    appRoot,
    targetEnv: args.env,
    confirmCrossEnv: args.yes === true,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
