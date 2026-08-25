import { spawnSync } from 'node:child_process';

export function createNbRunner({
  cwd,
  targetEnv,
  apiBaseUrl,
  confirmCrossEnv = false,
  spawn = spawnSync,
}) {
  if (typeof targetEnv !== 'string' || !targetEnv.trim()) {
    throw new Error('Target env is required');
  }
  const normalizedApiBaseUrl = apiBaseUrl
    ? normalizeApiBaseUrl(apiBaseUrl)
    : undefined;

  return (args) => {
    const commandArgs = [
      ...args,
      ...(normalizedApiBaseUrl ? ['--api-base-url', normalizedApiBaseUrl] : []),
      '--env',
      targetEnv.trim(),
      ...(confirmCrossEnv ? ['--yes'] : []),
      '--json-output',
    ];
    const command = `nb ${commandArgs.join(' ')}`;
    const result = spawn('nb', commandArgs, {
      cwd,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      throw new Error(
        `${command} failed with exit code ${result.status ?? 'unknown'}`,
      );
    }
    return parseJsonOutput(result.stdout, command);
  };
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('NocoBase API URL is required');
  }
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('NocoBase API URL must use http or https');
  }
  return url.toString().replace(/\/$/, '');
}

export function parseJsonOutput(output, command) {
  const trimmed = output.trim();
  const objectIndex = trimmed.search(/[[{]/);
  if (objectIndex < 0) {
    throw new Error(`${command} did not return JSON output`);
  }
  return JSON.parse(trimmed.slice(objectIndex));
}

export function unwrapData(payload) {
  let current = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== 'object' || !('data' in current)) break;
    current = current.data;
  }
  return current;
}
