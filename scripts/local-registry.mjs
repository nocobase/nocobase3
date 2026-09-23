import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isolateWorkspacePackages } from './smoke-registry-config.mjs';
import { dialects, readMainConfig } from './local-registry-config.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const id = createHash('sha256').update(repo).digest('hex').slice(0, 12);
const stateDir = path.join(os.tmpdir(), `nocobase-local-registry-${id}`);
const stateFile = path.join(stateDir, 'state.json');
const container = `nocobase-local-registry-${id}`;
const help = `Local published-package testing

pnpm local-registry:prepare [--port 4873] [--reset]
pnpm local-registry:create NAME [--template default|examples|hub] [--dialect sqlite]
  # --dialect only decides which configuration commands are printed afterwards
  [--output-dir /parent/directory] [--json] [--no-install]
pnpm local-registry:verify [--template default|examples|hub] [--dialect sqlite]
  [--config /absolute/test.yml] [--timeout 420] [--workdir /empty/directory]
pnpm local-registry:stop

Prepare builds and publishes all workspace packages to a fresh loopback registry.
Use --reset to stop the previous session and clear its snapshot before preparing again.
Verify runs test/dev/build/start and retains applications and logs outside the repository.
Non-SQLite verification requires --config pointing to a dedicated test database;
application migrations and seeds may modify it. Stop removes registry state, not test applications.
`;

export function parseArgs(argv) {
  const [action, ...args] = argv;
  if (!['prepare', 'create', 'verify', 'stop'].includes(action))
    throw new Error('Expected prepare, create, verify, or stop.');
  const options = {
    action,
    port: 4873,
    template: 'default',
    dialect: 'sqlite',
    timeout: 420,
  };
  const allowed = {
    prepare: ['port'],
    verify: ['template', 'dialect', 'config', 'timeout', 'workdir'],
    create: ['template', 'dialect', 'output-dir'],
    stop: [],
  };
  for (let i = 0; i < args.length; i++) {
    if (action === 'prepare' && args[i] === '--reset') {
      options.reset = true;
      continue;
    }
    if (action === 'create' && ['--json', '--no-install'].includes(args[i])) {
      options[args[i].slice(2)] = true;
      continue;
    }
    if (action === 'create' && !args[i].startsWith('-')) {
      if (options.name)
        throw new Error('Only one application name is allowed.');
      options.name = args[i];
      continue;
    }
    const key = args[i].replace(/^--/, '');
    if (
      !args[i].startsWith('--') ||
      !allowed[action].includes(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw new Error(`Invalid option: ${args[i]}`);
    options[key] = args[++i];
  }
  if (action === 'create' && !/^[a-z0-9][a-z0-9._-]*$/.test(options.name ?? ''))
    throw new Error(
      'Provide an application name using lowercase letters, digits, dots, dashes or underscores.',
    );
  for (const key of ['port', 'timeout']) {
    options[key] = Number(options[key]);
    if (
      !Number.isInteger(options[key]) ||
      options[key] < 1 ||
      (key === 'port' && options[key] > 65535)
    )
      throw new Error(`Invalid ${key}.`);
  }
  if (!['default', 'examples', 'hub'].includes(options.template))
    throw new Error('Unknown template.');
  if (!dialects.includes(options.dialect)) throw new Error('Unknown dialect.');
  if (action === 'verify' && options.dialect !== 'sqlite' && !options.config)
    throw new Error(
      'Non-SQLite verification requires --config for a dedicated test database.',
    );
  return options;
}

function run(
  command,
  args,
  { cwd = repo, env = process.env, capture = false } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${args[0] ?? ''} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}.`,
    );
  return result.stdout?.trim();
}

export function registryEnv(state) {
  const sessionDir = path.dirname(state.npmrc);
  const env = { ...process.env };
  // Ignore inherited registry/auth/cache overrides; use a session-only npmrc for both tools.
  for (const key of Object.keys(env))
    if (/^(npm_config_|pnpm_config_)/i.test(key)) delete env[key];
  return {
    ...env,
    NPM_CONFIG_USERCONFIG: state.npmrc,
    PNPM_CONFIG_USERCONFIG: state.npmrc,
    PNPM_CONFIG_NPMRC_AUTH_FILE: state.npmrc,
    XDG_CONFIG_HOME: path.join(sessionDir, 'config'),
    PNPM_CONFIG_REGISTRY: state.registry,
    npm_config_registry: state.registry,
    NPM_CONFIG_REGISTRY: state.registry,
    NOCOBASE_REGISTRY: state.registry,
    NODE_AUTH_TOKEN: '',
    PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0',
    PNPM_CONFIG_CACHE_DIR: path.join(sessionDir, 'cache'),
    PNPM_CONFIG_STORE_DIR: path.join(sessionDir, 'store'),
    NPM_CONFIG_CACHE: path.join(sessionDir, 'npm-cache'),
  };
}

function assertRegistries(state, env, cwd = repo) {
  for (const tool of ['npm', 'pnpm'])
    for (const key of ['registry', '@nocobase:registry']) {
      const actual = run(tool, ['config', 'get', key], {
        env,
        capture: true,
        cwd,
      })
        .split('\n')
        .at(-1)
        .replace(/\/$/, '');
      if (actual !== state.registry.replace(/\/$/, ''))
        throw new Error(
          `${tool} ${key} does not point to the local registry; refusing to publish or install.`,
        );
    }
}

function readState() {
  if (!fs.existsSync(stateFile))
    throw new Error('Run pnpm local-registry:prepare first.');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (
    state.repo !== repo ||
    state.container !== container ||
    !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(state.registry)
  )
    throw new Error('Invalid local registry state.');
  return state;
}

export function assertWorkdir(directory, root = repo) {
  const resolved = path.resolve(directory);
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);
  const relative = path.relative(fs.realpathSync(root), real);
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
    throw new Error('The test directory must be outside the repository.');
  if (fs.readdirSync(real).length)
    throw new Error('The test directory must be empty.');
  return real;
}

async function prepare(options) {
  if (fs.existsSync(stateFile))
    throw new Error(
      'A local registry session already exists. Run pnpm local-registry:prepare --reset to prepare a fresh snapshot.',
    );
  const packages = fs
    .globSync('packages/*/*/package.json', { cwd: repo })
    .map((file) => JSON.parse(fs.readFileSync(path.join(repo, file), 'utf8')))
    .filter((pkg) => !pkg.private);
  const state = {
    repo,
    container,
    registry: `http://127.0.0.1:${options.port}/`,
    npmrc: path.join(stateDir, 'npmrc'),
    ready: false,
    versions: Object.fromEntries(
      packages.map((pkg) => [pkg.name, pkg.version]),
    ),
  };
  for (const pkg of packages) {
    if (
      pkg.publishConfig?.registry &&
      pkg.publishConfig.registry.replace(/\/$/, '') !==
        state.registry.replace(/\/$/, '')
    )
      throw new Error(
        `${pkg.name} publishConfig.registry points outside the local registry.`,
      );
  }
  fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  const config = path.join(stateDir, 'verdaccio.yaml');
  fs.writeFileSync(
    config,
    isolateWorkspacePackages(
      fs.readFileSync(path.join(repo, '.github/verdaccio/config.yaml'), 'utf8'),
      packages,
    ),
  );
  run('docker', [
    'run',
    '-d',
    '--name',
    container,
    '--label',
    `nocobase.local-registry=${id}`,
    '-p',
    `127.0.0.1:${options.port}:4873`,
    '-v',
    `${config}:/verdaccio/conf/config.yaml:ro`,
    'verdaccio/verdaccio:5',
  ]);
  let available = false;
  for (let i = 0; i < 60; i++) {
    try {
      if (
        (
          await fetch(`${state.registry}-/ping`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        available = true;
        break;
      }
    } catch {
      /* Startup may take a few seconds. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!available)
    throw new Error(
      `Registry did not start. Inspect docker logs ${container}.`,
    );
  const response = await fetch(
    `${state.registry}-/user/org.couchdb.user:local-test`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'local-test',
        password: 'local-test',
        type: 'user',
        roles: [],
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const { token } = await response.json();
  if (!response.ok || !token)
    throw new Error('Local registry authentication failed.');
  fs.writeFileSync(
    state.npmrc,
    `registry=${state.registry}\n@nocobase:registry=${state.registry}\n//127.0.0.1:${options.port}/:_authToken=${token}\n`,
    { mode: 0o600 },
  );
  // Build with normal dependency resolution before using the empty isolated registry.
  console.log('Building publishable workspace packages...');
  run('pnpm', ['-r', '--filter', '!@nocobase/docs', '--if-present', 'build'], {
    env: { ...process.env, NOCOBASE_SKIP_WORKSPACE_DEPENDENCY_BUILD: '1' },
  });
  const env = registryEnv(state);
  assertRegistries(state, env);
  console.log('Publishing the checkout to the isolated local registry...');
  run('pnpm', ['changeset', 'publish', '--no-git-tag'], { env });
  // The repository is in prerelease mode. Explicitly expose this snapshot as latest for manual pnpm create.
  for (const pkg of packages)
    run(
      'npm',
      [
        'dist-tag',
        'add',
        `${pkg.name}@${pkg.version}`,
        'latest',
        '--registry',
        state.registry,
      ],
      { env, capture: true },
    );
  state.ready = true;
  fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  const wrapper = path.join(stateDir, 'create.mjs');
  fs.writeFileSync(
    wrapper,
    `import { createManually } from ${JSON.stringify(new URL(import.meta.url).href)};
try { createManually(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
`,
    { mode: 0o600 },
  );
  console.log(`Ready: ${state.registry}
For manual development: pnpm local-registry:create my-app
For an automated check: pnpm local-registry:verify --template default
For manual testing, run outside the repository:
  node ${JSON.stringify(wrapper)} my-app --json
The wrapper runs pnpm create with isolated configuration and snapshot versions.
Stop with: pnpm local-registry:stop`);
}

export function createManually(args, cwd = process.cwd()) {
  const state = readState();
  if (!state.ready) throw new Error('Preparation did not complete.');
  const relative = path.relative(repo, fs.realpathSync(cwd));
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  )
    throw new Error('Run manual creation outside the repository.');
  let template = 'default';
  const forwarded = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--registry' || args[i].startsWith('--registry='))
      throw new Error('The local wrapper owns the registry setting.');
    if (args[i] === '--template') template = args[++i];
    else if (args[i].startsWith('--template='))
      template = args[i].slice('--template='.length);
    else forwarded.push(args[i]);
  }
  if (!['default', 'examples', 'hub'].includes(template))
    throw new Error('Unknown template.');
  const env = registryEnv(state);
  assertRegistries(state, env, cwd);
  run(
    'pnpm',
    [
      'create',
      `@nocobase/app@${state.versions['@nocobase/create-app']}`,
      ...forwarded,
      '--registry',
      state.registry,
      '--template',
      `@nocobase/app-template-${template}@${state.versions[`@nocobase/app-template-${template}`]}`,
    ],
    { env, cwd },
  );
}

function stop() {
  if (fs.existsSync(stateFile)) {
    const state = readState();
    const names = run(
      'docker',
      [
        'ps',
        '-a',
        '--filter',
        `name=^/${container}$`,
        '--format',
        '{{.Names}}',
      ],
      { capture: true },
    );
    if (names) {
      const label = run(
        'docker',
        [
          'inspect',
          '--format',
          '{{index .Config.Labels "nocobase.local-registry"}}',
          state.container,
        ],
        { capture: true },
      );
      if (label !== id)
        throw new Error(
          'Refusing to remove a container not owned by this checkout.',
        );
      run('docker', ['rm', '-f', '-v', state.container]);
    }
  }
  // Keep the operation lock in place throughout reset and preparation.
  for (const entry of fs.readdirSync(stateDir)) {
    if (entry !== 'lock')
      fs.rmSync(path.join(stateDir, entry), { recursive: true, force: true });
  }
  console.log(
    'Local registry and isolated caches removed. Test applications and logs retained.',
  );
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(help);
    return;
  }
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = path.join(stateDir, 'lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      /* A previous operation was interrupted. */
    }
    if (alive) throw new Error('Another local registry operation is running.');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  try {
    if (options.action === 'prepare') {
      if (options.reset) stop();
      await prepare(options);
    } else if (options.action === 'create') {
      const state = readState();
      if (!state.ready)
        throw new Error('Run pnpm local-registry:prepare first.');
      try {
        const response = await fetch(`${state.registry}-/ping`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error('Registry is unavailable.');
      } catch {
        throw new Error(
          'Local registry is unavailable. Run pnpm local-registry:stop and pnpm local-registry:prepare.',
        );
      }
      const parent = path.resolve(
        options['output-dir'] ?? path.join(repo, '..', 'nocobase-local-apps'),
      );
      const target = assertWorkdir(path.join(parent, options.name));
      createManually(
        [
          options.name,
          '--template',
          options.template,
          ...(options.json ? ['--json'] : []),
          ...(options['no-install'] ? ['--no-install'] : []),
        ],
        fs.realpathSync(parent),
      );
      if (!options.json) {
        // Creation stops at a configurable project. `--dialect` is not passed through — it decides which driver the
        // application depends on, which is a change to the application rather than to how it is scaffolded.
        const configure =
          options.dialect === 'sqlite'
            ? ['pnpm config:init']
            : [
                `pnpm add @nocobase/db-${options.dialect}`,
                `pnpm config:init --dialect ${options.dialect}`,
              ];
        console.log(
          [
            `Application: ${target}`,
            `Next: cd ${JSON.stringify(target)}`,
            ...(options['no-install'] ? ['  pnpm install'] : []),
            ...configure.map((command) => `  ${command}`),
          ].join('\n'),
        );
      }
    } else if (options.action === 'verify') {
      const state = readState();
      if (!state.ready)
        throw new Error(
          'Preparation did not complete. Stop and prepare again.',
        );
      if (options.config)
        readMainConfig(path.resolve(options.config), options.dialect);
      const directory = assertWorkdir(
        options.workdir ??
          fs.mkdtempSync(path.join(os.tmpdir(), 'nocobase-registry-test-')),
      );
      const env = registryEnv(state);
      assertRegistries(state, env);
      console.log(`Test application and logs: ${directory}`);
      run(
        'bash',
        [
          path.join(repo, 'scripts/smoke-create-app.sh'),
          '--registry',
          state.registry,
          '--create-app-version',
          state.versions['@nocobase/create-app'],
          '--template',
          `@nocobase/app-template-${options.template}@${state.versions[`@nocobase/app-template-${options.template}`]}`,
          '--dialect',
          options.dialect,
          '--json',
          '--workdir',
          directory,
          '--timeout',
          String(options.timeout),
          ...(options.config ? ['--config', path.resolve(options.config)] : []),
        ],
        { env },
      );
    } else {
      stop();
    }
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

if (import.meta.main)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
