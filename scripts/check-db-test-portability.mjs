// Verifies that tests outside the database packages do not choose a dialect.
//
// A test that needs a database gets it from `@nocobase/db-testing`, which runs it on SQLite by default and on the
// dialect `NOCOBASE_TEST_DB_DIALECT` names otherwise. A test that configures SQLite itself, or asserts on SQL only
// SQLite understands, passes on every default run and fails only once someone selects another database — which is
// how the plugins' migrations went unchecked on PostgreSQL and MySQL until `@nocobase/db-testing` existed. See
// AGENTS.md, "Database Tests Do Not Choose a Dialect".
//
// A test whose subject is a dialect — the SQLite driver, configuration that names one — says so in its first lines:
//
//   // db-test-portability: sqlite-only — <why>
//   // db-test-portability: dialect-specific — <why>
//
// Files that cannot carry the marker, and tests not ported yet, are listed below with the reason.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** Groups whose tests are checked. The database packages own their dialects and are skipped below. */
const CHECKED_GROUPS = [
  'plugins',
  'examples',
  'app',
  'templates',
  'tools',
  'libs',
];

/** `@nocobase/db`, `@nocobase/db-testkit`, `@nocobase/db-testing` and the dialect packages test dialects on purpose. */
const SKIPPED_LIBRARIES = /^db(?:-[a-z]+)?$/;

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const TEST_FILE = /\.test\.(?:[cm]?[jt]sx?)$/;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;

const DIALECTS = 'sqlite|postgres|mysql|oracle|mssql|kingbase|oceanbase|dameng';

export const RULES = [
  {
    id: 'dialect-import',
    pattern: new RegExp(
      String.raw`(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"\`]@nocobase/db-(?:${DIALECTS})(?:/[^'"\`]*)?['"\`]`,
      'm',
    ),
    message:
      'imports a dialect package; take the database from @nocobase/db-testing',
  },
  {
    id: 'memory-database',
    pattern: /['"`]:memory:['"`]/,
    message:
      "configures ':memory:'; take the database from @nocobase/db-testing",
  },
  {
    id: 'sqlite-dialect',
    pattern: /\bdialect\s*:\s*['"`]sqlite['"`]/,
    message:
      "configures dialect: 'sqlite'; take the database from @nocobase/db-testing",
  },
  {
    id: 'pragma',
    // `pragma <name>` as SQL; an HTTP `Pragma` header is a quoted name followed by a colon.
    pattern: /\bpragma\s+[a-z_]+/i,
    message:
      'runs a SQLite PRAGMA; assert on the schema with expectCollection() or inspectCollection()',
  },
  {
    id: 'sqlite-catalog',
    pattern: /\bsqlite_(?:master|schema)\b/i,
    message:
      "reads SQLite's catalog; use connection.schemaInspector or expectCollection()",
  },
  {
    id: 'trigger',
    pattern: /\bcreate\s+trigger\b/i,
    message:
      'creates a trigger; make the write fail with vi.spyOn() on the write instead',
  },
];

const MARKER =
  /db-test-portability:\s*(sqlite-only|dialect-specific)\b(?:\s*[—–-]\s*(\S.*))?/;

/**
 * Files that do not carry the marker themselves. A template's tests ship inside the template a user scaffolds, so
 * a note about this repository's checks has no place in them.
 */
export const EXEMPT = new Map([
  [
    'packages/templates/app-template-examples/tests/logic/config.test.ts',
    'the application configuration under test names SQLite connections',
  ],
  [
    'packages/templates/app-template-examples/tests/components/numeric-examples.test.tsx',
    'a client component test whose mocked API data names the SQLite dialect',
  ],
]);

/**
 * Tests that build an application or run database commands on SQLite, to be ported with `@nocobase/app-testing`.
 * The check fails when one of them no longer needs to be listed, so the list only shrinks.
 */
export const PENDING = new Set([
  'packages/app/app-cli/tests/database-command.test.ts',
  'packages/app/app-server/tests/database-collections-artifact.test.ts',
  'packages/app/app-server/tests/database-collections-doctor.test.ts',
  'packages/app/app-server/tests/database-provider-collections.test.ts',
  'packages/app/app-server/tests/database-provider.test.ts',
  'packages/app/app-server/tests/database-task-plan.test.ts',
  'packages/app/app-server/tests/repository-routes.test.ts',
  'packages/app/app-server/tests/runtime-definition.test.ts',
  'packages/templates/app-template-default/tests/logic/app-server.test.ts',
  'packages/templates/app-template-examples/tests/logic/analytics.test.ts',
  'packages/templates/app-template-examples/tests/logic/app-server.test.ts',
  'packages/templates/app-template-examples/tests/logic/articles-migration.test.ts',
  'packages/templates/app-template-examples/tests/logic/articles.test.ts',
  'packages/templates/app-template-examples/tests/logic/external-crm.test.ts',
  'packages/templates/app-template-examples/tests/logic/numeric-examples.test.ts',
  'packages/templates/app-template-examples/tests/logic/users-permission-seed.test.ts',
  'packages/templates/app-template-examples/tests/logic/workflow-examples.test.ts',
  'packages/templates/app-template-hub/tests/logic/app-server.test.ts',
]);

/** The rules a source breaks, with the 1-based line of the first match of each. */
export function findViolations(source) {
  const violations = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(source);
    if (!match) continue;
    const line = source.slice(0, match.index).split('\n').length;
    violations.push({ rule: rule.id, message: rule.message, line });
  }
  return violations;
}

/**
 * The marker a file declares in its first lines: `{ kind, reason }`, `{ kind, reason: undefined }` when the reason
 * is missing, or `undefined`.
 */
export function readMarker(source) {
  const head = source.split('\n', 5).join('\n');
  const match = MARKER.exec(head);
  if (!match) return undefined;
  return { kind: match[1], reason: match[2]?.trim() || undefined };
}

/** Test files, and every source file under a `tests` directory: helpers configure databases as often as tests do. */
async function collectTestFiles(directory, files = [], insideTests = false) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      await collectTestFiles(
        path.join(directory, entry.name),
        files,
        insideTests || entry.name === 'tests' || entry.name === '__tests__',
      );
    } else if (
      SOURCE_FILE.test(entry.name) &&
      (insideTests || TEST_FILE.test(entry.name))
    ) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

async function checkedPackageDirectories(repositoryRoot) {
  const directories = [];
  for (const group of CHECKED_GROUPS) {
    const groupDirectory = path.join(repositoryRoot, 'packages', group);
    let entries;
    try {
      entries = await readdir(groupDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (group === 'libs' && SKIPPED_LIBRARIES.test(entry.name)) continue;
      directories.push(path.join(groupDirectory, entry.name));
    }
  }
  return directories;
}

/**
 * Every problem in the repository: files breaking a rule without an exemption, markers without a reason, and
 * listed files that no longer need their entry.
 */
export async function checkDbTestPortability({ repositoryRoot }) {
  const problems = [];
  const seen = new Set();
  for (const directory of await checkedPackageDirectories(repositoryRoot)) {
    for (const file of await collectTestFiles(directory)) {
      const relativePath = path
        .relative(repositoryRoot, file)
        .split(path.sep)
        .join('/');
      const source = await readFile(file, 'utf8');
      const violations = findViolations(source);
      const marker = readMarker(source);
      const listed = EXEMPT.has(relativePath) || PENDING.has(relativePath);
      if (listed) seen.add(relativePath);
      if (marker && !marker.reason) {
        problems.push({
          file: relativePath,
          line: 1,
          message: `its db-test-portability marker gives no reason; write "// db-test-portability: ${marker.kind} — <why>"`,
        });
        continue;
      }
      if (marker || violations.length === 0) {
        if (PENDING.has(relativePath) && violations.length === 0) {
          problems.push({
            file: relativePath,
            line: 1,
            message:
              'no longer chooses a dialect; remove it from PENDING in scripts/check-db-test-portability.mjs',
          });
        }
        continue;
      }
      if (listed) continue;
      for (const violation of violations) {
        problems.push({
          file: relativePath,
          line: violation.line,
          message: violation.message,
        });
      }
    }
  }
  for (const listedPath of [...EXEMPT.keys(), ...PENDING]) {
    if (!seen.has(listedPath)) {
      problems.push({
        file: listedPath,
        line: 1,
        message:
          'is listed in scripts/check-db-test-portability.mjs but no longer exists; remove the entry',
      });
    }
  }
  return problems;
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const problems = await checkDbTestPortability({ repositoryRoot });
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`${problem.file}:${problem.line} ${problem.message}`);
      if (process.env.GITHUB_ACTIONS) {
        console.error(
          `::error file=${problem.file},line=${problem.line}::${problem.message}`,
        );
      }
    }
    console.error(
      '\nSee AGENTS.md, "Database Tests Do Not Choose a Dialect", and packages/libs/db-testing/README.md.',
    );
    process.exit(1);
  }
  console.log(
    'Database tests choose no dialect outside the database packages.',
  );
}

if (process.argv[1] === import.meta.filename) {
  await main();
}
