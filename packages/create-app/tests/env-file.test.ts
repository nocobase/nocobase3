import { describe, expect, it } from 'vitest';
import { defaultDatabaseConfig } from '../src/lib/database.ts';
import {
  buildEnvFile,
  buildEnvValues,
  generateAuthSecret,
} from '../src/lib/env-file.ts';

function parse(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);

    if (match?.[1] !== undefined) {
      values[match[1]] = match[2] ?? '';
    }
  }

  return values;
}

describe('buildEnvValues', () => {
  it('writes only the keys sqlite uses', () => {
    const values = buildEnvValues(defaultDatabaseConfig('sqlite'), 'secret');

    expect([...values.keys()]).toEqual([
      'DB_DIALECT',
      'DB_DATABASE',
      'AUTH_SECRET',
    ]);
  });

  it('writes connection and schema keys for postgres', () => {
    const values = buildEnvValues(defaultDatabaseConfig('postgres'), 'secret');

    expect(values.get('DB_DIALECT')).toBe('postgres');
    expect(values.get('DB_PORT')).toBe('5432');
    expect(values.get('DB_SCHEMA')).toBe('public');
    expect(values.get('DB_SSL')).toBe('false');
    expect(values.has('DB_CHARSET')).toBe(false);
  });

  it('writes the charset for mysql and no postgres-only keys', () => {
    const values = buildEnvValues(defaultDatabaseConfig('mysql'), 'secret');

    expect(values.get('DB_CHARSET')).toBe('utf8mb4');
    expect(values.has('DB_SCHEMA')).toBe(false);
    expect(values.has('DB_SSL')).toBe(false);
  });

  /**
   * The dialect values are what `server/config/database.ts` accepts; it throws on anything else. This guards the
   * mapping from drifting toward the driver names, which differ.
   */
  it('uses the dialect names the template validates against', () => {
    for (const dialect of ['sqlite', 'postgres', 'mysql'] as const) {
      const values = buildEnvValues(defaultDatabaseConfig(dialect), 'secret');
      expect(values.get('DB_DIALECT')).toBe(dialect);
    }
  });
});

describe('buildEnvFile', () => {
  it('carries over unrelated settings from the example', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('sqlite'),
      template: 'APP_BASE_PATH=/main\nDB_MIGRATIONS_AUTO_RUN=true\n',
      authSecret: 'secret',
    });

    expect(parse(contents).APP_BASE_PATH).toBe('/main');
    expect(parse(contents).DB_MIGRATIONS_AUTO_RUN).toBe('true');
  });

  /**
   * `.env.example` ships a commented-out `DB_DATABASE` style default in some templates. A value chosen here has to win,
   * or the generated app would read the example's setting instead of the selected dialect's.
   */
  it('drops example lines that would collide with a generated key', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('postgres'),
      template:
        'DB_DIALECT=sqlite\nDB_DATABASE=old.sqlite\nAPP_BASE_PATH=/main\n',
      authSecret: 'secret',
    });
    const values = parse(contents);

    expect(values.DB_DIALECT).toBe('postgres');
    expect(values.DB_DATABASE).toBe('app');
    expect(values.APP_BASE_PATH).toBe('/main');
    expect(contents.match(/DB_DIALECT=/gu)).toHaveLength(1);
  });

  it('handles an export-prefixed collision', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('sqlite'),
      template: 'export DB_DIALECT=mysql\n',
      authSecret: 'secret',
    });

    expect(contents).not.toContain('export DB_DIALECT=mysql');
    expect(parse(contents).DB_DIALECT).toBe('sqlite');
  });

  it('works with no template at all', () => {
    const values = parse(
      buildEnvFile({
        database: defaultDatabaseConfig('sqlite'),
        authSecret: 'secret',
      }),
    );

    expect(values.DB_DIALECT).toBe('sqlite');
    expect(values.AUTH_SECRET).toBe('secret');
  });

  /**
   * An empty password is legitimate for a local database. It has to round-trip as an empty string rather than as an
   * unset key, which is why the value is written bare rather than omitted.
   */
  it('writes an empty password as an empty value', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('postgres'),
      authSecret: 'secret',
    });

    expect(contents).toContain('DB_PASSWORD=\n');
  });

  it('quotes values that would not survive a bare assignment', () => {
    const contents = buildEnvFile({
      database: {
        ...defaultDatabaseConfig('postgres'),
        dialect: 'postgres',
        password: 'has spaces "and" quotes',
      },
      authSecret: 'secret',
    });

    expect(contents).toContain('DB_PASSWORD="has spaces \\"and\\" quotes"');
  });

  /**
   * `.env.example` groups keys under headings. Dropping every database key strips the body out from under a heading
   * like `# Database`, and the leftover comments read as a damaged file.
   */
  it('drops comment blocks left with nothing to describe', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('postgres'),
      template: [
        '# Application',
        'APP_BASE_PATH=/main',
        '',
        '# Database',
        '# Supported dialects: sqlite, postgres, mysql.',
        'DB_DIALECT=sqlite',
        'DB_DATABASE=database.sqlite',
        '',
        '# Database lifecycle',
        'DB_MIGRATIONS_AUTO_RUN=true',
        '',
      ].join('\n'),
      authSecret: 'secret',
    });

    expect(contents).not.toContain('# Supported dialects');
    expect(contents).toContain('# Application');
    expect(contents).toContain('# Database lifecycle');
    expect(parse(contents).DB_MIGRATIONS_AUTO_RUN).toBe('true');
  });

  /** These drive migrations and seeding, and are unrelated to the connection, so they must survive. */
  it('keeps the database lifecycle switches', () => {
    const values = parse(
      buildEnvFile({
        database: defaultDatabaseConfig('sqlite'),
        template:
          '# Database lifecycle\nDB_MIGRATIONS_AUTO_RUN=true\nDB_SEEDS_AUTO_RUN=true\n',
        authSecret: 'secret',
      }),
    );

    expect(values.DB_MIGRATIONS_AUTO_RUN).toBe('true');
    expect(values.DB_SEEDS_AUTO_RUN).toBe('true');
  });

  /**
   * The published template ships a bare `AUTH_SECRET=`. It has to lose to the generated secret rather than blanking
   * it, which would leave the app unable to start.
   */
  it('never lets an empty template AUTH_SECRET win', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('sqlite'),
      template: 'APP_PUBLIC_ORIGIN=\nAUTH_SECRET=\n',
      authSecret: 'REAL-SECRET',
    });

    expect(parse(contents).AUTH_SECRET).toBe('REAL-SECRET');
    expect(contents.match(/^AUTH_SECRET=/gmu)).toHaveLength(1);
  });

  it('does not leave a run of blank lines where a block was removed', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('sqlite'),
      template: '# Database\nDB_DIALECT=mysql\n\nAPP_BASE_PATH=/main\n',
      authSecret: 'secret',
    });

    expect(contents).not.toMatch(/\n\n\n/u);
  });

  it('ends with exactly one trailing newline', () => {
    const contents = buildEnvFile({
      database: defaultDatabaseConfig('sqlite'),
      template: 'APP_BASE_PATH=/main\n\n\n',
      authSecret: 'secret',
    });

    expect(contents.endsWith('\n')).toBe(true);
    expect(contents.endsWith('\n\n')).toBe(false);
  });
});

describe('generateAuthSecret', () => {
  it('produces a url-safe secret with real entropy', () => {
    const secret = generateAuthSecret();

    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(generateAuthSecret()).not.toBe(secret);
  });
});
