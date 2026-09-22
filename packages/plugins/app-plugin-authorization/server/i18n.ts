import {
  getRequestTranslator,
  TRANSLATOR_CONTEXT_KEY,
  type Translator,
} from '@nocobase/i18n/server';
import type { Context } from 'hono';

import { AUTHORIZATION_NAMESPACE } from '../shared.js';

export type OptionText =
  | string
  | {
      readonly key: string;
      readonly ns?: string;
      readonly defaultValue?: string;
    };

/** Optional translator for server-generated messages, bound to this plugin. */
function requestTranslator(context: Context): Translator | undefined {
  return context.get(TRANSLATOR_CONTEXT_KEY) === undefined
    ? undefined
    : getRequestTranslator(context, AUTHORIZATION_NAMESPACE);
}

/** Translates one of this plugin's own strings for the current request. */
export function translateAuthorization(
  context: Context,
  key: string,
  defaultValue: string,
): string {
  return requestTranslator(context)?.(key, { defaultValue }) ?? defaultValue;
}

export function optionLabel(key: string, defaultValue: string): OptionText {
  return { key, ns: AUTHORIZATION_NAMESPACE, defaultValue };
}

export function optionText(
  value: OptionText | undefined,
  fallback: string,
): OptionText {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value;
  return {
    ...value,
    ns: value.ns ?? AUTHORIZATION_NAMESPACE,
    defaultValue: value.defaultValue ?? humanizeKey(value.key),
  };
}

/** Two registrations agree when their text is the same string, or the same key. */
export function sameOptionText(
  left: OptionText | undefined,
  right: OptionText | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (typeof left === 'string' || typeof right === 'string')
    return left === right;
  return (
    left.key === right.key &&
    left.ns === right.ns &&
    left.defaultValue === right.defaultValue
  );
}

function humanizeKey(key: string): string {
  return (key.split('.').at(-1) ?? key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
