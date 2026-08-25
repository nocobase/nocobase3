import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { starter as enUS } from '@/locales/en-US';
import { starter as zhCN } from '@/locales/zh-CN';

const clientRoot = path.resolve(process.cwd(), 'client');

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'locales' ? [] : collectSourceFiles(entryPath);
    }
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function collectLiteralTranslationKeys(source: string): string[] {
  const patterns = [
    /(?:translate|\bt)\(\s*['"]([^'"]+)['"]/g,
    /(?:i18nKey|titleKey|descriptionKey)\s*[:=]\s*['"]([^'"]+)['"]/g,
  ];

  return patterns.flatMap((pattern) =>
    Array.from(source.matchAll(pattern), (match) => match[1]),
  );
}

describe('Hub translation resources', () => {
  it('defines every literal client translation key in English and Chinese', () => {
    const usedKeys = new Set(
      collectSourceFiles(clientRoot).flatMap((file) =>
        collectLiteralTranslationKeys(fs.readFileSync(file, 'utf8')),
      ),
    );

    const missingEnglish = [...usedKeys].filter((key) => !(key in enUS)).sort();
    const missingChinese = [...usedKeys].filter((key) => !(key in zhCN)).sort();

    expect(missingEnglish).toEqual([]);
    expect(missingChinese).toEqual([]);
  });

  it('keeps the English and Chinese resource key sets aligned', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort());
  });
});
