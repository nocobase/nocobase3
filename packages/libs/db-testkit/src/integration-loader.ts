/** Selectively loads shared integration modules from a dialect wrapper. */
export async function loadDatabaseIntegrationTests(
  modules: Record<string, () => Promise<unknown>>,
  selectedFiles: string | undefined = process.env.DB_TEST_FILES,
): Promise<void> {
  const selections = new Set(parseSelectedFiles(selectedFiles));
  const matchedSelections = new Set<string>();

  for (const [path, load] of Object.entries(modules)) {
    const normalizedPath = normalizeModulePath(path);
    if (selections.size > 0 && !selections.has(normalizedPath)) continue;
    if (selections.size > 0) matchedSelections.add(normalizedPath);
    await load();
  }

  const unmatchedSelections = [...selections].filter(
    (selection) => !matchedSelections.has(selection),
  );
  if (unmatchedSelections.length > 0)
    throw new Error(
      `No database integration test file matched: ${unmatchedSelections.join(', ')}`,
    );
}

function parseSelectedFiles(selectedFiles: string | undefined): string[] {
  if (!selectedFiles) return [];
  try {
    const parsed: unknown = JSON.parse(selectedFiles);
    if (Array.isArray(parsed))
      return parsed
        .filter((value): value is string => typeof value === 'string')
        .map(normalizeSelection)
        .filter((value): value is string => Boolean(value));
  } catch {
    // Keep accepting the original comma-separated form for local compatibility.
  }
  return selectedFiles
    .split(',')
    .map(normalizeSelection)
    .filter((value): value is string => Boolean(value));
}

function normalizeSelection(path: string): string | undefined {
  const normalized = path.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  const marker = 'tests/integration/';
  const index = normalized.indexOf(marker);
  return index >= 0
    ? normalized.slice(index + marker.length)
    : normalized || undefined;
}

function normalizeModulePath(path: string): string {
  return normalizeSelection(path) ?? path;
}
