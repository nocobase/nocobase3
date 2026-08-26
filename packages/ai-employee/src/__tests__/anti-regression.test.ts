/**
 * Static architecture checks for the runtime-neutral AI employee package.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const FORBIDDEN_PACKAGES = [
  '@nocobase/actions',
  '@nocobase/server',
  '@nocobase/plugin-file-manager',
  '@nocobase/data-source-manager',
  '@nocobase/cache',
  '@nocobase/utils',
  '@nocobase/resourcer',
  '@nocobase/logger',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      walk(p, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

const FORBIDDEN_SOURCE_PATTERNS: Array<[string, RegExp]> = [
  ['legacy path', /(?:^|[/'\"])(?:app\/)?legacy(?:[/'\"]|$)/],
  ['AILegacy type', /\bAILegacy\w*/],
  ['RuntimeApp abstraction', /\bRuntimeApp\b/],
  ['duplicate runtime file manager', /\bRuntimeFileManager\b/],
  ['runtime attachment contract', /runtime\/attachments|\bRuntimeAttachment\b/],
  [
    'AIEngine locator',
    /\b(?:AIEngine|AIEmployeeModule|createAIEngineHost|attachAIManager)\b/,
  ],
  ['plugin manager service lookup', /\.pm\.get\(\s*['"]ai['"]\s*\)/],
  [
    'compatibility persistence layer',
    /\b(?:MemoryDatabase|RepositoryRuntimeDatabase|RuntimeDatabase|RuntimeModel|aiEmployeeRecords)\b/,
  ],
  [
    'ORM-style persistence access',
    /\bctx\.db\b|\.getRepository\(|\.getModel\(|\.sequelize\b/,
  ],
];

describe('packages/ai-employee dependency boundary', () => {
  it('does not import old NocoBase runtime packages', () => {
    const files = walk(SRC);
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pkg of FORBIDDEN_PACKAGES) {
        const re = new RegExp(`from\\s*['"]${pkg}['"]`);
        if (re.test(content)) {
          offenders.push(`${path.relative(SRC, file)} -> ${pkg}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not reintroduce removed runtime layers or service locators', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const [label, pattern] of FORBIDDEN_SOURCE_PATTERNS) {
        if (pattern.test(content))
          offenders.push(`${path.relative(SRC, file)} -> ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('publishes only the package root entry', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    );
    expect(Object.keys(manifest.exports)).toEqual(['.', './package.json']);
  });
});

describe('LLM provider full registry', () => {
  it('exposes the complete provider option registry', async () => {
    const ai = (await import('../index.js')) as Record<string, unknown>;
    const expected = [
      ['google-genai', 'googleGenAIProviderOptions'],
      ['openai', 'openaiResponsesProviderOptions'],
      ['anthropic', 'anthropicProviderOptions'],
      ['deepseek', 'deepseekProviderOptions'],
      ['dashscope', 'dashscopeProviderOptions'],
      ['kimi', 'kimiProviderOptions'],
      ['mimo', 'mimoProviderOptions'],
      ['mistral', 'mistralProviderOptions'],
      ['ollama', 'ollamaProviderOptions'],
      ['openai-completions', 'openaiCompletionsProviderOptions'],
      ['xai', 'xaiProviderOptions'],
      ['orcarouter', 'orcarouterProviderOptions'],
      ['shengsuanyun', 'shengsuanyunProviderOptions'],
    ] as const;
    for (const [, optionName] of expected) {
      expect(
        ai[optionName],
        `provider option ${optionName} must be exported`,
      ).toBeTruthy();
    }
    expect(expected.length).toBe(13);
  });
});
