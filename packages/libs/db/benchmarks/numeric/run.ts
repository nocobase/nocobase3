import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, platform, arch, release } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
} from '../../src/index.js';
import type { DatabaseDialect } from '../../src/index.js';
import type { Knex } from 'knex';
import { connectionConfig, dialects } from './config.js';
import { measure, type Measurement } from './measure.js';
import { setup, scenarios, fixtureNames } from './scenarios.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'pnpm benchmark:numeric [--databases=all|sqlite,postgres,...] [--rows=10000,100000] [--writes=100,1000] [--repeats=5] [--warmups=2] [--output=/absolute/directory] [--match=regex]',
  );
  process.exit(0);
}
const options = new Map<string, string>();
for (const arg of args) {
  const match =
    /^--(databases|rows|writes|repeats|warmups|output|match)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown argument: ${arg}. Use --help.`);
  options.set(match[1], match[2]);
}
function numbers(name: string, fallback: string, allowZero = false): number[] {
  const result = (options.get(name) ?? fallback).split(',').map(Number);
  if (
    !result.length ||
    result.some((n) => !Number.isSafeInteger(n) || n < (allowZero ? 0 : 1))
  )
    throw new Error(`Invalid --${name}`);
  return result;
}
const requested = options.get('databases') ?? 'all';
const selected =
  requested === 'all' ? dialects : (requested.split(',') as DatabaseDialect[]);
if (selected.some((d) => !dialects.includes(d)))
  throw new Error('Unsupported database; use --help.');
const sizes = numbers('rows', '10000,100000');
const writes = numbers('writes', '100,1000');
const match = options.has('match')
  ? new RegExp(options.get('match')!)
  : undefined;
const repeats = numbers('repeats', '5')[0];
const warmups = numbers('warmups', '2', true)[0];
const started = new Date().toISOString();
const output = resolve(
  options.get('output') ?? `benchmarks/results/${started.replaceAll(':', '-')}`,
);
await mkdir(output, { recursive: true });
const sourceFiles = [
  'src/numeric/aggregate.ts',
  'src/numeric/sqlite.ts',
  'src/numeric/decimal.ts',
  'src/query/internal/knex/adapter.ts',
  'src/repository/internal/knex-execution-adapter.ts',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(new URL(`../../${file}`, import.meta.url)))
        .digest('hex'),
    ]),
  ),
);
const require = createRequire(import.meta.url);
const packageVersions = Object.fromEntries(
  ['knex', 'better-sqlite3', 'pg', 'mysql2', 'oracledb', 'tedious'].map(
    (name) => [
      name,
      (require(`${name}/package.json`) as { version: string }).version,
    ],
  ),
);
const environment = {
  packageVersions,
  match: options.get('match'),
  started,
  node: process.version,
  platform: platform(),
  arch: arch(),
  os: release(),
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  sourceHashes,
  sizes,
  writes,
  repeats,
  warmups,
  selected,
  notes:
    'Sequential databases; one connection; native Knex shares current driver codecs. Memory deltas are noisy, not peak memory. CPU is Node process only. Immediate delay is one setImmediate probe per sample, not event-loop p99. Cold means Collection cache invalidation, not cold connection/database pages. Bindings excluded from SQL traces.',
};
const results: Array<{
  dialect: DatabaseDialect;
  rows: number;
  serverVersion: unknown;
  measurements: Measurement[];
}> = [];
let failure: string | undefined;
async function save() {
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      { environment, failure, results },
      (_key, value: unknown) =>
        typeof value === 'bigint' ? `${value}n` : value,
      2,
    ),
  );
  const lines = [
    '# Numeric performance baseline',
    '',
    `Started: ${started}; Node ${process.version}; ${environment.cpu}; ${platform()}/${arch()}.`,
    '',
    `${repeats} measured repetitions after ${warmups} warmups; all listed results validated. SQL trace is a separate untimed execution.`,
    '',
    environment.notes,
    '',
    '| Database | Rows | Scenario | API | Median ms | Min–max ms | SQL count | Node CPU ms | Immediate delay ms |',
    '|---|---:|---|---|---:|---|---|---:|---:|',
  ];
  for (const result of results)
    for (const m of result.measurements)
      lines.push(
        `| ${result.dialect} | ${result.rows} | ${m.name} | ${m.api} | ${m.medianMs.toFixed(3)} | ${m.minMs.toFixed(3)}–${m.maxMs.toFixed(3)} | ${m.sqlCount.min}–${m.sqlCount.max} | ${m.medianCpuMs.toFixed(3)} | ${m.medianImmediateDelayMs.toFixed(3)} |`,
      );
  if (failure) lines.push('', `Run failed: ${failure}`);
  await writeFile(resolve(output, 'report.md'), lines.join('\n') + '\n');
}
const versionSql: Record<DatabaseDialect, string> = {
  sqlite: 'select sqlite_version() as version',
  postgres: 'select version()',
  mysql: 'select version() as version',
  oracle: 'select banner from v$version',
  mssql: 'select @@version as version',
};
try {
  for (const dialect of selected)
    for (const rows of sizes) {
      console.log(`[${dialect}/${rows}] preparing deterministic fixture`);
      const prefix = `nbp_${randomBytes(4).toString('hex')}_`;
      const db = createDatabaseManager({
        default: dialect,
        metadataStore: new InMemoryCollectionMetadataStore(),
        connections: {
          [dialect]: {
            ...connectionConfig(dialect),
            pool: { min: 1, max: 1 },
            naming: { tablePrefix: prefix },
          },
        },
      });
      const connection = db.connection(dialect);
      const client = await connection.client<Knex>();
      try {
        const serverVersion: unknown = await client.raw(versionSql[dialect]);
        await setup(connection, client, prefix, rows);
        const result = {
          dialect,
          rows,
          serverVersion,
          measurements: [] as Measurement[],
        };
        results.push(result);
        for (const scenario of scenarios(
          connection,
          client,
          prefix,
          rows,
          writes,
        )) {
          if (match && !match.test(`${scenario.api}/${scenario.name}`))
            continue;
          console.log(`[${dialect}/${rows}] ${scenario.api} ${scenario.name}`);
          result.measurements.push(
            await measure(client, scenario, repeats, warmups),
          );
          await save();
        }
      } finally {
        try {
          // Exact owned names only: never scan/drop unrelated tables.
          for (const name of [...fixtureNames].reverse())
            await client.schema.dropTableIfExists(`${prefix}${name}`);
        } finally {
          await db.destroy();
        }
      }
    }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await save();
  console.log(`Results: ${output}`);
}
