import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { PromptCase } from './types.js';
import {
  closeRuntimeFixture,
  createRuntimeFixture,
  type RuntimeFixtureProfile,
} from '../runtime/fixture-db.js';

export interface CaseWorkspace {
  root: string;
  fixtureDatabase?: string;
  cleanup: () => Promise<void>;
}

interface PrepareWorkspaceOptions {
  case: PromptCase;
  repoRoot: string;
  testsRoot: string;
  keep: boolean;
}

export async function prepareCaseWorkspace(
  options: PrepareWorkspaceOptions,
): Promise<CaseWorkspace> {
  const root = await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      `nocobase-workflow-skill-${safeName(options.case.id)}-`,
    ),
  );
  const projectRoot = path.join(root, 'project');
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.symlink(
    path.join(options.repoRoot, 'node_modules'),
    path.join(projectRoot, 'node_modules'),
    'dir',
  );
  const sourceFixtures = path.join(options.testsRoot, 'fixtures', 'workflows');
  await fs.cp(sourceFixtures, path.join(projectRoot, 'server', 'workflows'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, 'AGENTS.md'),
    [
      '# Workflow skill evaluation workspace',
      '',
      'This is an isolated test workspace. Read repository reference material only through the absolute path in TEST_CONTEXT.md.',
      'Only modify files below this workspace when the prompt explicitly authorizes source mutation.',
      'Use the exact fixture paths and commands supplied in TEST_CONTEXT.md.',
      '',
    ].join('\n'),
  );
  const fixtureDatabase = options.case.fixture?.startsWith('runtime-')
    ? path.join(root, 'runtime', `${safeName(options.case.id)}.sqlite`)
    : undefined;
  if (fixtureDatabase && options.case.fixture) {
    const fixture = await createRuntimeFixture(
      fixtureDatabase,
      options.case.fixture as RuntimeFixtureProfile,
    );
    await closeRuntimeFixture(fixture);
  }
  await fs.writeFile(
    path.join(projectRoot, 'TEST_CONTEXT.md'),
    buildTestContext(options, fixtureDatabase),
  );
  return {
    root: projectRoot,
    fixtureDatabase,
    cleanup: async (): Promise<void> => {
      if (!options.keep) await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function buildTestContext(
  options: PrepareWorkspaceOptions,
  fixtureDatabase?: string,
): string {
  const packageRoot = path.join(
    options.repoRoot,
    'packages',
    'app-plugin-workflow',
  );
  const lines = [
    '# Test context',
    '',
    `Case: ${options.case.id}`,
    `Repository: ${options.repoRoot}`,
    `Fixture profile: ${options.case.fixture ?? 'none'}`,
    '',
    'The files under server/workflows are disposable copies for this case.',
    'Run the real source checker with:',
    '',
    '```bash',
    `node --import ${path.join(packageRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')} ${path.join(packageRoot, 'engine', 'cli.ts')} check ${path.resolve(options.testsRoot, 'fixtures', 'workflows', '<fixture>', 'workflow.ts')}`,
    '```',
  ];
  if (fixtureDatabase && options.case.fixture) {
    const fixtureCli = path.join(options.testsRoot, 'runtime', 'cli.ts');
    const tsxLoader = path.join(
      packageRoot,
      'node_modules',
      'tsx',
      'dist',
      'loader.mjs',
    );
    lines.push(
      '',
      'A private SQLite fixture has already been seeded and can be queried with:',
      '',
      '```bash',
      `NOCOBASE_WORKFLOW_FIXTURE_DB=${fixtureDatabase} node --import ${tsxLoader} ${fixtureCli} list ${options.case.fixture}`,
      `NOCOBASE_WORKFLOW_FIXTURE_DB=${fixtureDatabase} node --import ${tsxLoader} ${fixtureCli} workflow ${options.case.fixture} <definition-id>`,
      `NOCOBASE_WORKFLOW_FIXTURE_DB=${fixtureDatabase} node --import ${tsxLoader} ${fixtureCli} run ${options.case.fixture} <run-id>`,
      `NOCOBASE_WORKFLOW_FIXTURE_DB=${fixtureDatabase} node --import ${tsxLoader} ${fixtureCli} node-runs ${options.case.fixture} <run-id>`,
      '```',
      '',
      'These commands operate only on this case database. Do not connect to any other database.',
    );
  }
  return `${lines.join('\n')}\n`;
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}
