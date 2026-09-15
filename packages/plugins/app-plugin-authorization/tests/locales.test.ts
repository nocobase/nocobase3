import { describe, expect, it } from 'vitest';

import enUS from '../client/locales/en-US.js';
import locales from '../client/locales/index.js';
import zhCN from '../client/locales/zh-CN.js';

/** Every leaf, as a dotted path, so a missing or extra key names itself. */
function keys(value: unknown, prefix: string = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([name, child]) =>
    keys(child, prefix ? `${prefix}.${name}` : name),
  );
}

describe('locales', () => {
  it('declares the same keys in both languages', () => {
    expect(keys(zhCN).toSorted()).toEqual(keys(enUS).toSorted());
  });

  it('translates rather than copying the English', () => {
    // A leaf whose two languages are identical is either untranslated or a
    // placeholder-only string, such as an interpolation with no words of its own.
    const copied = keys(enUS).filter((key) => {
      const [english, chinese] = [enUS, zhCN].map((catalogue) =>
        read(catalogue, key),
      );
      return (
        english === chinese &&
        /\p{L}/u.test(english.replace(/\{\{\w+\}\}/gu, ''))
      );
    });
    expect(copied).toEqual(['editors.actionsPlaceholder']);
  });

  it('loads one module per locale', () => {
    expect(Object.keys(locales).toSorted()).toEqual(['en-US', 'zh-CN']);
  });
});

function read(catalogue: unknown, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        typeof node === 'object' && node !== null
          ? Reflect.get(node, part)
          : undefined,
      catalogue,
    );
  return typeof value === 'string' ? value : '';
}
