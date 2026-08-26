import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { ConfigPaths } from '@nocobase/app-server-kit/config';

export type InstallDatabaseDialect = 'sqlite' | 'postgres' | 'mysql';

export interface InstallDatabaseConfigInput {
  readonly dialect: InstallDatabaseDialect;
  readonly database: string;
  readonly debug?: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly username?: string;
  readonly password?: string;
  readonly schema?: string;
  readonly ssl?: boolean;
  readonly charset?: string;
}

export interface ConfigureInstallationOptions {
  readonly paths: ConfigPaths;
  readonly generateSecret?: () => string;
}

export interface ConfigureInstallationResult {
  readonly configured: true;
  readonly restartRequired: true;
}

type InstallConfigurationErrorStatus = 400 | 409 | 500;

export class InstallConfigurationError extends Error {
  public readonly status: InstallConfigurationErrorStatus;

  public constructor(status: InstallConfigurationErrorStatus, message: string) {
    super(message);
    this.name = 'InstallConfigurationError';
    this.status = status;
  }
}

const MANAGED_ENV_KEYS = new Set([
  'DB_DIALECT',
  'DB_DATABASE',
  'DB_DEBUG',
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_CHARSET',
  'DB_SSL',
  'DB_SCHEMA',
  'AUTH_SECRET',
]);

export async function configureInstallation(
  input: unknown,
  options: ConfigureInstallationOptions,
): Promise<ConfigureInstallationResult> {
  const config = parseInstallDatabaseConfig(input);
  const examplePath = options.paths.root('.env.example');
  const environmentPath = options.paths.root('.env');
  let template: string;

  try {
    template = await readFile(examplePath, 'utf8');
  } catch {
    throw new InstallConfigurationError(500, 'Unable to read .env.example.');
  }

  const generateSecret =
    options.generateSecret ?? (() => randomBytes(32).toString('base64url'));
  const secret = generateSecret();
  assertSafeString(secret, 'Generated authentication secret', false);

  const environment = mergeEnvironmentTemplate(
    template,
    buildEnvironmentValues(config, secret),
  );

  try {
    await writeFile(environmentPath, environment, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') {
      throw new InstallConfigurationError(
        409,
        'The application has already been configured.',
      );
    }

    throw new InstallConfigurationError(500, 'Unable to create .env.');
  }

  return { configured: true, restartRequired: true };
}

export function parseInstallDatabaseConfig(
  input: unknown,
): InstallDatabaseConfigInput {
  if (!isRecord(input)) {
    throw invalidInput('The request body must be a JSON object.');
  }

  const dialect = input.dialect;
  if (dialect !== 'sqlite' && dialect !== 'postgres' && dialect !== 'mysql') {
    throw invalidInput(
      'Database dialect must be "sqlite", "postgres", or "mysql".',
    );
  }

  const database = readRequiredString(input, 'database', 'Database');
  const debug = readBoolean(input, 'debug', false);

  if (dialect === 'sqlite') {
    return { dialect, database, debug };
  }

  const host = readRequiredString(input, 'host', 'Database host');
  const port = readPort(input);
  const username = readRequiredString(input, 'username', 'Database username');
  const password = readOptionalString(input, 'password', 'Database password');

  if (dialect === 'mysql') {
    return {
      dialect,
      host,
      port,
      database,
      username,
      password,
      charset: readRequiredString(input, 'charset', 'Database charset'),
      debug,
    };
  }

  return {
    dialect,
    host,
    port,
    database,
    username,
    password,
    schema: readRequiredString(input, 'schema', 'Database schema'),
    ssl: readBoolean(input, 'ssl', false),
    debug,
  };
}

function buildEnvironmentValues(
  config: InstallDatabaseConfigInput,
  secret: string,
): ReadonlyMap<string, string> {
  const values = new Map<string, string>([
    ['DB_DIALECT', config.dialect],
    ['DB_DATABASE', config.database],
    ['DB_DEBUG', String(config.debug ?? false)],
  ]);

  if (config.dialect !== 'sqlite') {
    values.set('DB_HOST', config.host ?? '');
    values.set('DB_PORT', String(config.port ?? ''));
    values.set('DB_USERNAME', config.username ?? '');
    values.set('DB_PASSWORD', config.password ?? '');
  }

  if (config.dialect === 'mysql') {
    values.set('DB_CHARSET', config.charset ?? '');
  }

  if (config.dialect === 'postgres') {
    values.set('DB_SSL', String(config.ssl ?? false));
    values.set('DB_SCHEMA', config.schema ?? '');
  }

  values.set('AUTH_SECRET', secret);
  return values;
}

function mergeEnvironmentTemplate(
  template: string,
  values: ReadonlyMap<string, string>,
): string {
  const preservedLines = template.split(/\r?\n/u).filter((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u.exec(line);
    return !match?.[1] || !MANAGED_ENV_KEYS.has(match[1]);
  });

  while (preservedLines.at(-1) === '') {
    preservedLines.pop();
  }

  const generatedLines = [
    '# Generated by @nocobase/app-plugin-install.',
    ...Array.from(
      values,
      ([key, value]) => `${key}=${serializeEnvValue(value)}`,
    ),
  ];

  return [...preservedLines, '', ...generatedLines, ''].join('\n');
}

function serializeEnvValue(value: string): string {
  if (value === '' || /^[A-Za-z0-9_./:@,+-]+$/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function readRequiredString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string {
  const value = input[key];
  if (typeof value !== 'string') {
    throw invalidInput(`${label} must be a string.`);
  }

  assertSafeString(value, label, false);
  if (value.trim() === '') {
    throw invalidInput(`${label} is required.`);
  }

  return value.trim();
}

function readOptionalString(
  input: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): string {
  const value = input[key];
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw invalidInput(`${label} must be a string.`);
  }

  assertSafeString(value, label, true);
  return value;
}

function readBoolean(
  input: Readonly<Record<string, unknown>>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = input[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw invalidInput(`${key} must be a boolean.`);
  }
  return value;
}

function readPort(input: Readonly<Record<string, unknown>>): number {
  const value = input.port;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 65_535
  ) {
    throw invalidInput('Database port must be an integer from 1 to 65535.');
  }
  return value;
}

function assertSafeString(
  value: string,
  label: string,
  allowEmpty: boolean,
): void {
  if (!allowEmpty && value.length === 0) {
    throw invalidInput(`${label} is required.`);
  }
  if (/[\0\r\n]/u.test(value)) {
    throw invalidInput(`${label} must not contain line breaks or null bytes.`);
  }
}

function invalidInput(message: string): InstallConfigurationError {
  return new InstallConfigurationError(400, message);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
