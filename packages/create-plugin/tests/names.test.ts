import { describe, expect, it } from 'vitest';

import { createPluginNames, normalizePluginName } from '../src/lib/names.ts';

describe('normalizePluginName', () => {
  it.each([
    ['audit-log', 'audit-log'],
    ['app-plugin-audit-log', 'audit-log'],
    ['@nocobase/app-plugin-audit-log', 'audit-log'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePluginName(input)).toBe(expected);
  });

  it.each(['', '../escape', 'AuditLog', 'audit--log', 'audit/log'])(
    'rejects unsafe name %s',
    (name) => {
      expect(() => normalizePluginName(name)).toThrow(
        'Plugin name must start with a lowercase letter',
      );
    },
  );
});

describe('createPluginNames', () => {
  it('derives package, directory, collection, and TypeScript names', () => {
    expect(createPluginNames('audit-log')).toEqual({
      collectionName: 'appPluginAuditLogRecords',
      directoryName: 'app-plugin-audit-log',
      moduleName: 'auditLog',
      packageName: '@nocobase/app-plugin-audit-log',
      shortName: 'audit-log',
      symbolName: 'AuditLog',
    });
  });
});
