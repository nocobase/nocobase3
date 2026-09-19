import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  configureDatabase,
  DIALECTS,
  resolveDialectDependency,
} from '../src/lib/dialects.ts';
import { runCommand } from '../src/lib/run-command.ts';
vi.mock('../src/lib/run-command.ts', () => ({ runCommand: vi.fn() }));
const example = `# template comment
auth:
  secret: example
database:
  default: main
  connections:
    main:
      dialect: sqlite
      database: hub/database/main.sqlite
      migrations:
        autoRun: false
      seeds:
        autoRun: true
    analytics:
      dialect: sqlite
      database: analytics.sqlite
`;

describe('database generation', () => {
  it('preserves SQLite paths and original formatting', () => {
    expect(configureDatabase(example, 'sqlite', 'crm')).toBe(example);
  });
  it.each(DIALECTS)(
    'generates %s and preserves policies and other connections',
    (dialect) => {
      const output = configureDatabase(example, dialect, 'crm');
      const config = parse(output) as {
        database: { connections: Record<string, Record<string, unknown>> };
      };
      const main = config.database.connections.main;
      expect(main.dialect).toBe(dialect);
      expect(main.migrations).toEqual({ autoRun: false });
      expect(main.seeds).toEqual({ autoRun: true });
      expect(config.database.connections.analytics).toEqual({
        dialect: 'sqlite',
        database: 'analytics.sqlite',
      });
      expect(output).toContain('# template comment');
      expect(output).not.toContain('${DB_');
      if (dialect !== 'sqlite') {
        expect(main.password).toBe('');
        expect(main.filename).toBeUndefined();
        expect(main.database).toBe(
          dialect === 'oracle' || dialect === 'dameng' ? undefined : 'crm',
        );
      }
      if (dialect === 'oracle') expect(main.serviceName).toBe('FREEPDB1');
      if (dialect === 'dameng') expect(main.schema).toBe('crm');
      if (dialect === 'mssql')
        expect(main).toMatchObject({
          encrypt: true,
          trustServerCertificate: false,
        });
    },
  );
  it('creates a connection when the template has no example', () => {
    expect(configureDatabase('', 'sqlite', 'crm')).toContain('database.sqlite');
  });
  it('rejects malformed YAML', () => {
    expect(() => configureDatabase('database: [', 'mysql', 'crm')).toThrow(
      'Invalid config.example.yml',
    );
  });
});

describe('driver dependency contract', () => {
  it('keeps existing dependencies without querying the registry', async () => {
    vi.mocked(runCommand).mockClear();
    expect(
      await resolveDialectDependency(
        { '@nocobase/db-postgres': '^2.0.0' },
        'postgres',
        'https://registry.example',
      ),
    ).toEqual({});
    expect(runCommand).not.toHaveBeenCalled();
  });
  it('uses the selected runtime peer range and registry', async () => {
    vi.mocked(runCommand).mockResolvedValue({
      stdout: JSON.stringify([
        { '@nocobase/db-postgres': '^2.0.0' },
        { '@nocobase/db-postgres': '^3.0.0' },
      ]),
      stderr: '',
    });
    expect(
      await resolveDialectDependency(
        { '@nocobase/app-server': '^4.0.0' },
        'postgres',
        'https://registry.example',
      ),
    ).toEqual({ '@nocobase/db-postgres': '^3.0.0' });
    expect(runCommand).toHaveBeenCalledWith(
      'npm',
      [
        'view',
        '@nocobase/app-server@^4.0.0',
        'peerDependencies',
        '--json',
        '--registry=https://registry.example',
      ],
      { timeoutMs: 60_000 },
    );
  });
  it('rejects an unknown compatibility contract', async () => {
    vi.mocked(runCommand).mockResolvedValue({ stdout: '{}', stderr: '' });
    await expect(
      resolveDialectDependency(
        { '@nocobase/app-server': '^4.0.0' },
        'oracle',
        'registry',
      ),
    ).rejects.toThrow('compatibility range');
  });
});
