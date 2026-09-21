import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { collectRuntimeSpecifiers } from '../../scripts/check-runtime-deps.mjs';

const root = path.resolve(import.meta.dirname, '../../packages/templates');
const templates = ['default', 'examples', 'hub'].map((kind) => {
  const directory = path.join(root, `app-template-${kind}`);
  return {
    kind,
    directory,
    manifest: JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ),
  };
});
const [baseline] = templates;
const runtimeExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs'];
const builtins = new Set(
  builtinModules.flatMap((name) => [name, name.replace(/^node:/u, '')]),
);

function filesIn(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory()
        ? filesIn(path.join(directory, entry.name), relative)
        : [relative];
    })
    .sort();
}

function runtimeFilesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ['dev-commands', 'dist', 'node_modules', 'tests'].includes(entry.name)
    ) {
      return [];
    }
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeFilesIn(target);
    return runtimeExtensions.includes(path.extname(entry.name)) ? [target] : [];
  });
}

function resolveRuntimeRelative(from, specifier) {
  const unresolved = path.resolve(path.dirname(from), specifier);
  const base = unresolved.replace(/\.(?:c|m)?js$/u, '');
  const candidates = [
    unresolved,
    ...runtimeExtensions.map((extension) => `${base}${extension}`),
    ...runtimeExtensions.map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function runtimePackageName(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('#') ||
    specifier.startsWith('@/') ||
    specifier.startsWith('node:')
  ) {
    return undefined;
  }
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
}

function runtimeDependencies(template) {
  const pending = ['server', 'database', 'cli'].flatMap((directory) =>
    runtimeFilesIn(path.join(template.directory, directory)),
  );
  const visited = new Set();
  const imported = new Map();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of collectRuntimeSpecifiers(
      readFileSync(file, 'utf8'),
      file,
    )) {
      if (specifier.startsWith('.')) {
        const resolved = resolveRuntimeRelative(file, specifier);
        assert.ok(
          resolved,
          `${template.kind}: unresolved ${specifier} from ${file}`,
        );
        if (
          !resolved.includes(`${path.sep}cli${path.sep}dev-commands${path.sep}`)
        ) {
          pending.push(resolved);
        }
        continue;
      }
      const dependency = runtimePackageName(specifier);
      if (
        dependency &&
        dependency !== template.manifest.name &&
        !builtins.has(dependency)
      ) {
        imported.set(dependency, path.relative(template.directory, file));
      }
    }
  }
  return imported;
}

function sharedFrameworkSource(template, file) {
  let source = readFileSync(path.join(template.directory, file), 'utf8');
  if (
    template.kind === 'examples' &&
    file === 'client/layouts/components/header-actions.tsx'
  ) {
    // Examples owns the notification-center demonstration. Exclude only its
    // explicit entry; all shared header behavior must still match Default.
    const additions = [
      /^import \{ NotificationButton \} from '@\/components\/notification-button';\n/gm,
      /^[\t ]*\{\/\* Examples owns its notification center; keep its unread shortcut on every authenticated surface\. \*\/\}\n[\t ]*<NotificationButton \/>\n/gm,
    ];
    return additions.reduce((shared, addition) => {
      assert.equal(
        [...shared.matchAll(addition)].length,
        1,
        'Examples header must contain exactly one notification entry',
      );
      return shared.replace(addition, '');
    }, source);
  }

  // The pm2 configuration names the process after the template; everything else about how it starts is shared.
  if (file === 'ecosystem.config.js') {
    const processName = (manifest) =>
      `nocobase-${manifest.name.replace(/^@nocobase\//u, '')}`;
    const name = processName(template.manifest);
    assert.ok(
      source.includes(`name: '${name}',`),
      `${template.kind}: ecosystem.config.js must name the process ${name}`,
    );
    return source.replace(
      `name: '${name}',`,
      `name: '${processName(baseline.manifest)}',`,
    );
  }

  // Keep product identity and Hub's deliberate menu order local while comparing the shared layout.
  if (file === 'client/layouts/components/sidebar-footer.tsx') {
    source = source
      .replace("'Examples Template'", "'Default Template'")
      .replace("'NocoBase Hub'", "'Default Template'");
  }
  if (
    template.kind === 'hub' &&
    file === 'client/layouts/components/app-brand.tsx'
  ) {
    source = source
      .replace('AppBrand(props:', 'AppBrand(inputProps:')
      .replace('= props;', '= inputProps;')
      .replace(
        /aria-label=\{t\('navigation.brandApps', \{\s*defaultValue: 'NocoBase applications',\s*\}\)\}/u,
        "aria-label={t('navigation.brandHome', { defaultValue: 'NocoBase home' })}",
      );
  }
  if (template.kind === 'hub' && file === 'client/layouts/app-layout.tsx') {
    source = source
      .replace('  type RouteNavigationItem,\n', '')
      .replace(
        'const { items, denied } = useRouteNavigation(routes);\n  const menuItems = orderHubNavigation(items);',
        'const { items: menuItems, denied } = useRouteNavigation(routes);',
      )
      .replace("t('navigation.console',", "t('shell.workspace',")
      .replace(
        "defaultValue: 'Hub console'",
        "defaultValue: 'AI application workspace'",
      );
    // The Hub client-shell suite verifies this product-specific sort order.
    const helper = source.indexOf('\nconst HUB_NAVIGATION_PATHS');
    assert.notEqual(
      helper,
      -1,
      'Hub must retain its navigation ordering helper',
    );
    source = source.slice(0, helper).trimEnd() + '\n';
  }

  if (template.kind !== 'hub' || file !== 'server/standalone.ts') {
    return source;
  }

  // Hub alone fronts App Host. Its proxy behavior is covered by the Hub tests;
  // compare every other part of the standalone entry with Default unchanged.
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const standalone = parsed.statements
    .filter(ts.isVariableStatement)
    .flatMap(({ declarationList }) => declarationList.declarations)
    .find(({ name }) => ts.isIdentifier(name) && name.text === 'standalone');
  const call = standalone?.initializer;
  assert.ok(
    call &&
      ts.isCallExpression(call) &&
      ts.isIdentifier(call.expression) &&
      call.expression.text === 'defineStandaloneServer',
  );
  const [options] = call.arguments;
  assert.ok(options && ts.isObjectLiteralExpression(options));
  const proxy = options.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === 'proxy',
  );
  assert.ok(proxy, 'Hub standalone must configure its App Host proxy');
  const end = proxy.end + (source[proxy.end] === ',' ? 1 : 0);
  return (source.slice(0, proxy.getFullStart()) + source.slice(end)).replace(
    "import { hubServiceToken } from '@nocobase/app-plugin-hub/server';\n",
    '',
  );
}

// These are shared framework mechanisms, not product pages or plugin composition.
// Compare both directions so adding a build helper in only one template also fails.
for (const template of templates) {
  test(`${template.kind} keeps the shared build and CLI framework aligned with Default`, () => {
    for (const directory of [
      'scripts',
      'client/routing',
      'client/layouts',
      'client/theme',
    ]) {
      const expected = filesIn(path.join(baseline.directory, directory));
      assert.deepEqual(
        filesIn(path.join(template.directory, directory)),
        expected,
      );
      for (const file of expected) {
        const relative = path.join(directory, file);
        assert.equal(
          sharedFrameworkSource(template, relative),
          sharedFrameworkSource(baseline, relative),
          `${template.kind}: ${relative}`,
        );
      }
    }
    for (const file of [
      'tsconfig.json',
      'tsconfig.server.json',
      'eslint.config.js',
      'vitest.config.ts',
      'vite.config.ts',
      'ecosystem.config.js',
      'server/app.ts',
      'server/embedded.ts',
      'server/standalone.ts',
    ]) {
      assert.equal(
        sharedFrameworkSource(template, file),
        sharedFrameworkSource(baseline, file),
        `${template.kind}: ${file}`,
      );
    }
    // Product-specific scripts need a documented exception; compare the shared contract in both directions.
    const exceptions = [
      'upload', // Hub publishing commands are implemented only by Default.
      'deploy',
      ...(template.kind === 'hub' ? ['test:e2e'] : []), // Hub has no AI plugin.
    ];
    const sharedScripts = (scripts) =>
      Object.fromEntries(
        Object.entries(scripts).filter(([name]) => !exceptions.includes(name)),
      );
    assert.deepEqual(
      sharedScripts(template.manifest.scripts),
      sharedScripts(baseline.manifest.scripts),
      `${template.kind}: shared scripts`,
    );
  });

  test(`${template.kind} exposes publishing scripts only when supported`, () => {
    for (const command of ['upload', 'deploy']) {
      if (template.kind === 'default') {
        // Straight at the CLI entry, not through `pnpm nocobase`: a script
        // calling another script is a second `pnpm run`, and each layer
        // prints its own ELIFECYCLE line for one non-zero exit.
        assert.equal(
          template.manifest.scripts[command],
          `tsx ./cli/index.ts app ${command}`,
        );
      } else {
        assert.equal(Object.hasOwn(template.manifest.scripts, command), false);
      }
    }
  });

  test(`${template.kind} publishes the database directory by part, not whole`, () => {
    // `files` is a whitelist npm applies ahead of every ignore file, so a bare `database` entry publishes
    // whatever `collections:generate` happens to have written locally: a snapshot of one developer's database,
    // in whatever dialect they run it against, shipped to every application scaffolded from the template.
    // Neither .gitignore nor .npmignore can take it back out. Name the parts that are source instead.
    const { files } = template.manifest;
    assert.equal(files.includes('database'), false);
    for (const entry of [
      'database/tsconfig.json',
      'database/*/migrations/**',
      'database/*/seeds/**',
    ]) {
      assert.ok(
        files.includes(entry),
        `${template.kind}: files must list ${entry}`,
      );
    }
  });

  test(`${template.kind} declares server runtime packages in dependencies only`, () => {
    const { dependencies, devDependencies } = template.manifest;
    const duplicates = Object.keys(dependencies).filter(
      (name) => name in devDependencies,
    );
    assert.deepEqual(duplicates, []);
    assert.ok(dependencies['@nocobase/db']);
    // create-app adds SQLite when selected; templates must not force its installation.
    assert.equal(
      dependencies['@nocobase/db-sqlite'],
      undefined,
      `${template.kind}: the SQLite driver must be supplied by create-app`,
    );
    assert.equal(
      devDependencies['@nocobase/db-sqlite'],
      undefined,
      `${template.kind}: devDependencies must not force SQLite installation`,
    );
    assert.equal(dependencies.hono, 'catalog:');
    assert.equal(devDependencies.hono, undefined);
    for (const [name, file] of runtimeDependencies(template)) {
      assert.ok(
        dependencies[name],
        `${template.kind}: ${name} is imported at runtime by ${file} but is not in dependencies`,
      );
    }
    for (const field of [
      'engines',
      'packageManager',
      'type',
      'prettier',
      'browserslist',
    ]) {
      assert.deepEqual(
        template.manifest[field],
        baseline.manifest[field],
        field,
      );
    }
    for (const [name, range] of Object.entries(devDependencies)) {
      const baselineRange = baseline.manifest.devDependencies[name];
      if (baselineRange) assert.equal(range, baselineRange, name);
    }
  });
}
