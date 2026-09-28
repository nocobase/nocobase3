import {
  parseAuthorizationTitle,
  type AuthorizationTitle,
} from '@nocobase/authorization/core';

import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';
import { PACKAGE_NAME } from './resources.js';

/**
 * A stored department title. Seeded departments store a JSON translation descriptor, the way permission-set titles
 * are stored; a department someone created or renamed stores its plain text.
 */
export function readTitle(raw: string): AuthorizationTitle {
  if (!raw.startsWith('{')) return raw;
  try {
    return parseAuthorizationTitle(JSON.parse(raw)) ?? raw;
  } catch {
    return raw;
  }
}

function lookup(resource: unknown, key: string): string | undefined {
  let value: unknown = resource;
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Every text a title is shown as, so a search in either language finds a seeded department. The first entry is
 * the English text, which also orders the picker.
 */
export function titleTexts(title: AuthorizationTitle): readonly string[] {
  if (typeof title === 'string') return [title];
  if (title.ns !== PACKAGE_NAME) return [title.key];
  const texts = [lookup(enUS, title.key), lookup(zhCN, title.key)].filter(
    (text): text is string => text !== undefined,
  );
  return texts.length ? texts : [title.key];
}
