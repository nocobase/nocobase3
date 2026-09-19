import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';
import { generateDatabaseManifests } from '@nocobase/dev-config/build/database-manifests';
import { loadMigrations, loadSeeds } from '../../../../db/src/index.js';
import { describeIntegrationDatabases } from '../helpers.js';

const temporary: string[] = [];
const dbModule = pathToFileURL(
  path.resolve(import.meta.dirname, '../../../../db/src/index.ts'),
).href;

describeIntegrationDatabases('compiled database tasks', (context) => {
  afterEach(async () => {
    await Promise.all(
      temporary
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  async function fixture() {
    const tempRoot = path.join(process.cwd(), 'tests/.tmp');
    await mkdir(tempRoot, { recursive: true });
    const root = await mkdtemp(path.join(tempRoot, 'compiled-tasks-'));
    temporary.push(root);
    const sourceDir = path.join(root, 'database');
    const outputDir = path.join(root, 'dist/database');
    const sources = {
      migrations: `import { defineMigration } from ${JSON.stringify(dbModule)};
        const name: string = '202609150001_artifact_rows';
        export default defineMigration({ name, async up({ builder }) {
          await builder.createCollection('artifactRows', (table) => { table.increments('id'); table.string('value'); });
        }, async down({ builder }) { await builder.dropCollection('artifactRows'); } });`,
      seeds: `import { defineSeed } from ${JSON.stringify(dbModule)};
        const name: string = '202609150002_artifact_seed';
        export default defineSeed({ name, async run({ query }) {
          await query.insertInto('artifactRows').values({ value: 'once' }).execute();
        } });`,
    };
    const names = {
      migrations: '202609150001_artifact_rows',
      seeds: '202609150002_artifact_seed',
    };
    const legacy: Record<string, string> = {};
    for (const kind of ['migrations', 'seeds'] as const) {
      await mkdir(path.join(sourceDir, kind), { recursive: true });
      await mkdir(path.join(outputDir, kind), { recursive: true });
      await writeFile(
        path.join(sourceDir, kind, names[kind] + '.ts'),
        sources[kind],
      );
      const artifact = ts.transpileModule(sources[kind], {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText;
      legacy[kind] = createHash('sha256').update(artifact).digest('hex');
      await writeFile(
        path.join(outputDir, kind, names[kind] + '.js'),
        artifact,
      );
    }
    await generateDatabaseManifests({ sourceDir, outputDir });
    const migrationOptions = {
      connection: context.spec.name,
      packageName: '@example/artifacts',
      tableName: context.table('artifactHistory'),
      lockTableName: context.table('artifactLock'),
    };
    const seedOptions = {
      connection: context.spec.name,
      packageName: '@example/artifacts',
      tableName: context.table('artifactSeedHistory'),
      lockTableName: context.table('artifactSeedLock'),
    };
    return {
      sourceDir,
      outputDir,
      names,
      legacy,
      migrationOptions,
      seedOptions,
      migrator: (base: string) =>
        context.database.createMigrator({
          ...migrationOptions,
          directory: path.join(base, 'migrations'),
        }),
      seeder: (base: string) =>
        context.database.createSeeder({
          ...seedOptions,
          directory: path.join(base, 'seeds'),
        }),
    };
  }

  it.each(['source', 'compiled'])(
    'switches from %s without rerunning migrations or seeds and rolls back using either representation',
    async (first) => {
      const f = await fixture();
      const a = first === 'source' ? f.sourceDir : f.outputDir;
      const b = first === 'source' ? f.outputDir : f.sourceDir;
      expect((await f.migrator(a).latest()).executed).toEqual([
        f.names.migrations,
      ]);
      expect((await f.seeder(a).run()).executed).toEqual([f.names.seeds]);
      expect((await f.migrator(b).latest()).executed).toEqual([]);
      expect((await f.seeder(b).run()).executed).toEqual([]);
      expect(
        await context.db(context.table('artifactRows')).select('value'),
      ).toEqual([{ value: 'once' }]);
      expect((await f.migrator(b).rollback()).rolledBack).toEqual([
        f.names.migrations,
      ]);
      expect(
        await context.db.schema.hasTable(context.table('artifactRows')),
      ).toBe(false);
    },
  );

  it('upgrades only verified legacy JavaScript history to source checksums under the task locks', async () => {
    const f = await fixture();
    await f.migrator(f.outputDir).latest();
    await f.seeder(f.outputDir).run();
    await context
      .db(f.migrationOptions.tableName)
      .update({ checksum: f.legacy.migrations });
    await context
      .db(f.seedOptions.tableName)
      .update({ checksum: f.legacy.seeds });
    expect((await f.migrator(f.outputDir).latest()).executed).toEqual([]);
    expect((await f.seeder(f.outputDir).run()).executed).toEqual([]);
    const [migration] = await loadMigrations({
      directory: path.join(f.sourceDir, 'migrations'),
    });
    const [seed] = await loadSeeds({
      directory: path.join(f.sourceDir, 'seeds'),
    });
    expect(
      await context.db(f.migrationOptions.tableName).select('checksum'),
    ).toEqual([{ checksum: migration.checksum }]);
    expect(
      await context.db(f.seedOptions.tableName).select('checksum'),
    ).toEqual([{ checksum: seed.checksum }]);
    await expect(f.migrator(f.sourceDir).latest()).resolves.toMatchObject({
      executed: [],
    });
    await context
      .db(f.migrationOptions.tableName)
      .update({ checksum: 'f'.repeat(64) });
    await expect(f.migrator(f.outputDir).latest()).rejects.toThrow(
      'checksum changed',
    );
    expect(
      await context.db(f.migrationOptions.tableName).select('checksum'),
    ).toEqual([{ checksum: 'f'.repeat(64) }]);
  });

  it('rejects changed artifacts before execution and changed source identities against history', async () => {
    const f = await fixture();
    await f.migrator(f.sourceDir).latest();
    const sourcePath = path.join(
      f.sourceDir,
      'migrations',
      f.names.migrations + '.ts',
    );
    await writeFile(
      sourcePath,
      (await readFile(sourcePath, 'utf8')) + '\n// Changed source\n',
    );
    await expect(f.migrator(f.sourceDir).latest()).rejects.toThrow(
      'checksum changed',
    );
    const artifactPath = path.join(
      f.outputDir,
      'migrations',
      f.names.migrations + '.js',
    );
    await writeFile(artifactPath, 'throw new Error("must not execute");');
    await expect(f.migrator(f.outputDir).latest()).rejects.toThrow(
      'artifact checksum mismatch',
    );
  });
});
