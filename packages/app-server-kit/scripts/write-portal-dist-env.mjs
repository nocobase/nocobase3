import fs from 'node:fs';
import path from 'node:path';

export function writePortalDistEnv({ rootDir, allowedKeys }) {
  const distDir = path.join(rootDir, 'dist');
  const envOutputPath = path.join(distDir, '.env');
  const envFiles = [
    path.join(rootDir, '.env'),
    path.join(rootDir, '.env.local'),
  ];
  const env = readEnvFiles(envFiles, process.env);
  const entries = Object.entries(env).filter(
    ([key]) => !allowedKeys || allowedKeys.has(key),
  );

  if (entries.length === 0) {
    fs.rmSync(envOutputPath, { force: true });
    console.log('\n> Extract environment');
    console.log(
      allowedKeys
        ? 'No supported server environment entries found; skipped dist/.env'
        : 'No .env or .env.local file found; skipped dist/.env',
    );
    return;
  }

  fs.mkdirSync(distDir, { recursive: true });
  const content = entries
    .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    .join('\n');
  fs.writeFileSync(envOutputPath, `${content}\n`, { mode: 0o600 });

  console.log('\n> Extract environment');
  console.log(
    `Generated ${path.relative(rootDir, envOutputPath)} from ${envFiles
      .filter((envFile) => fs.existsSync(envFile))
      .map((envFile) => path.basename(envFile))
      .join(', ')}`,
  );
}

function readEnvFiles(files, baseEnv = {}) {
  const env = {};

  for (const envFile of files) {
    if (!fs.existsSync(envFile)) continue;
    Object.assign(env, parseEnv(fs.readFileSync(envFile, 'utf8')));
  }

  const expansionEnv = { ...baseEnv, ...env };
  for (const [key, value] of Object.entries(env)) {
    env[key] = expandEnvValue(value, expansionEnv);
    expansionEnv[key] = env[key];
  }

  return env;
}

function parseEnv(content) {
  const parsed = {};
  const linePattern =
    /^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^#\r\n]*)?\s*(?:#.*)?$/;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) continue;

    const [, key, rawValue = ''] = match;
    const quote = rawValue[0];
    let value = rawValue.trim();

    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }

  return parsed;
}

function expandEnvValue(value, env) {
  return value.replace(/\\?\${?([A-Za-z_][A-Za-z0-9_]*)}?/g, (match, key) => {
    if (match.startsWith('\\')) return match.slice(1);
    return env[key] ?? '';
  });
}

function formatEnvValue(value) {
  return /^[A-Za-z0-9_./:@%+-]*$/.test(value) ? value : JSON.stringify(value);
}
