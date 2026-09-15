import fs from 'node:fs';

// Verdaccio uses the first matching package rule. PRs keep their committed versions, so workspace packages must not
// fall through to an upstream copy of that version. External @nocobase packages still need the normal proxy rule.
export function isolateWorkspacePackages(config, packages) {
  if (!config.includes('packages:\n')) {
    throw new Error(
      'Missing packages section in the smoke registry configuration',
    );
  }
  const rules = packages
    .filter((pkg) => !pkg.private)
    .map(
      (pkg) =>
        `  ${JSON.stringify(pkg.name)}:\n    access: $all\n    publish: $authenticated\n    unpublish: $authenticated\n`,
    )
    .join('');
  if (!rules) throw new Error('No publishable workspace packages found');
  return config.replace('packages:\n', `packages:\n${rules}`);
}

if (import.meta.main) {
  const packages = fs
    .globSync('packages/*/*/package.json')
    .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const config = fs.readFileSync('.github/verdaccio/config.yaml', 'utf8');
  process.stdout.write(isolateWorkspacePackages(config, packages));
}
