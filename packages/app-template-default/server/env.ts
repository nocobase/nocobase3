import { existsSync, readFileSync } from 'node:fs';

export type EnvMap = Record<string, string | undefined>;

export function readEnvFiles(files: string[], baseEnv: EnvMap = {}): Record<string, string> {
  const env: Record<string, string> = {};

  for (const envFile of files) {
    if (!existsSync(envFile)) {
      continue;
    }

    Object.assign(env, parseEnv(readFileSync(envFile, 'utf8')));
  }

  const expansionEnv = { ...baseEnv, ...env };
  for (const [key, value] of Object.entries(env)) {
    env[key] = expandEnvValue(value, expansionEnv);
    expansionEnv[key] = env[key];
  }

  return env;
}

export function getEnvString(env: EnvMap, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function getEnvBoolean(env: EnvMap, key: string): boolean | undefined {
  const value = getEnvString(env, key);
  if (value === undefined) {
    return undefined;
  }

  if (/^(true|1|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(false|0|no|off)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function parseEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const linePattern = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^#\r\n]*)?\s*(?:#.*)?$/;

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, key, rawValue = ''] = match;
    const quote = rawValue[0];
    let value = rawValue.trim();

    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    }

    parsed[key] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }

  return parsed;
}

function expandEnvValue(value: string, env: EnvMap): string {
  return value.replace(/\\?\${?([A-Za-z_][A-Za-z0-9_]*)}?/g, (match, key) => {
    if (match.startsWith('\\')) {
      return match.slice(1);
    }

    return env[key] ?? '';
  });
}
