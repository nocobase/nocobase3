import { parseDocument } from 'yaml';
import { runCommand } from './run-command.ts';

export const DIALECTS = [
  'sqlite',
  'postgres',
  'mysql',
  'mssql',
  'oracle',
  'dameng',
  'kingbase',
  'oceanbase',
] as const;
export type Dialect = (typeof DIALECTS)[number];

/** Preserve policies and other connections, but replace dialect-specific connection parameters. */
export function configureDatabase(
  contents: string,
  dialect: Dialect,
  name: string,
): string {
  const document = parseDocument(contents);
  if (document.errors.length)
    throw new Error(
      `Invalid config.example.yml: ${document.errors[0].message}`,
    );
  const main = ['database', 'connections', 'main'];
  if (
    dialect === 'sqlite' &&
    document.getIn([...main, 'dialect']) === 'sqlite'
  ) {
    if (document.getIn(['database', 'default']) === 'main') return contents;
    document.setIn(['database', 'default'], 'main');
    return document.toString();
  }
  const policyKeys = [
    'schemaManagement',
    'debug',
    'migrations',
    'seeds',
    'metadataStore',
    'naming',
    'internalTables',
  ];
  const policies = policyKeys.map(
    (key) => [key, document.getIn([...main, key], true)] as const,
  );
  const ports = {
    postgres: 5432,
    mysql: 3306,
    mssql: 1433,
    oracle: 1521,
    dameng: 5236,
    kingbase: 54321,
    oceanbase: 2881,
  };
  const connection: Record<string, unknown> =
    dialect === 'sqlite'
      ? { dialect, database: 'database.sqlite' }
      : {
          dialect,
          host: 'localhost',
          port: ports[dialect],
          ...(dialect === 'oracle'
            ? { serviceName: 'FREEPDB1' }
            : dialect === 'dameng'
              ? {}
              : { database: name }),
          username: name,
          password: '',
        };
  if (dialect === 'postgres' || dialect === 'kingbase')
    Object.assign(connection, { schema: 'public', ssl: false });
  if (dialect === 'dameng') connection.schema = name;
  if (dialect === 'mssql')
    Object.assign(connection, { encrypt: true, trustServerCertificate: false });
  Object.assign(connection, { debug: false, schemaManagement: 'managed' });
  document.setIn(main, document.createNode(connection));
  for (const [key, value] of policies)
    if (value !== undefined) document.setIn([...main, key], value);
  document.setIn(['database', 'default'], 'main');
  return document.toString();
}

/** Use the template runtime's published peer contract, not the CLI version or an unrelated driver's version. */
export async function resolveDialectDependency(
  dependencies: Record<string, string>,
  dialect: Dialect,
  registry: string,
): Promise<Record<string, string>> {
  const packageName = `@nocobase/db-${dialect}`;
  if (dependencies[packageName]) return {};
  const runtime = dependencies['@nocobase/app-server'];
  if (!runtime)
    throw new Error(
      `The template must declare @nocobase/app-server to select ${packageName}.`,
    );
  const { stdout } = await runCommand(
    'npm',
    [
      'view',
      `@nocobase/app-server@${runtime}`,
      'peerDependencies',
      '--json',
      `--registry=${registry}`,
    ],
    { timeoutMs: 60_000 },
  );
  const result = JSON.parse(stdout) as
    Record<string, unknown> | Record<string, unknown>[];
  const peers = Array.isArray(result) ? result.at(-1) : result;
  const version = peers?.[packageName];
  if (typeof version !== 'string' || version.startsWith('workspace:'))
    throw new Error(
      `The template runtime does not declare a published compatibility range for ${packageName}.`,
    );
  return { [packageName]: version };
}
