import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = new URL('../server', import.meta.url);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

function source(path: URL): string {
  return readFileSync(path, 'utf8');
}

describe('AI employee runtime architecture boundaries', () => {
  it('does not restore the broad runtime context or request adapter', () => {
    expect(
      existsSync(
        new URL('../server/internal/runtime-context.ts', import.meta.url),
      ),
    ).toBe(false);
    const allServerSource = sourceFiles(serverRoot.pathname)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(allServerSource).not.toContain('PluginToolsContext');
    expect(allServerSource).not.toContain('createRequestRuntime');
    expect(allServerSource).not.toMatch(/\[key:\s*string\]:\s*any/);
  });

  it('keeps broad HTTP context out of services and managers', () => {
    for (const directory of ['service', 'manager']) {
      for (const path of sourceFiles(
        new URL(`../server/${directory}`, import.meta.url).pathname,
      )) {
        const fileSource = readFileSync(path, 'utf8');
        expect(fileSource, path).not.toMatch(/ctx:\s*Context/);
        expect(fileSource, path).not.toMatch(
          /ctx\.(?:auth|state|throw|requestExecution)/,
        );
      }
    }
    expect(
      source(new URL('../server/route/ai-conversations.ts', import.meta.url)),
    ).toContain("from 'hono'");
    expect(
      source(new URL('../server/agent/context.ts', import.meta.url)),
    ).toContain('AppAgentContext');
  });

  it('does not restore legacy task conversation execution', () => {
    const allPackageSource = [
      serverRoot,
      new URL('../registry', import.meta.url),
    ]
      .flatMap((root) => sourceFiles(root.pathname))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(allPackageSource).not.toContain('workflowTaskUnreadCount');
    expect(allPackageSource).not.toContain('new AIEmployee(');
    expect(allPackageSource).not.toContain('AIEmployeeOptions');
    expect(allPackageSource).not.toMatch(/legacy\s*:/);
    expect(allPackageSource).not.toMatch(
      /category\??:\s*['"]chat['"]\s*\|\s*['"]task['"]/,
    );
    expect(allPackageSource).not.toMatch(/category\s*===\s*['"]task['"]/);
  });
});
