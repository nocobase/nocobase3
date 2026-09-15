import {
  getRequestTranslator,
  TRANSLATOR_CONTEXT_KEY,
  type Translator,
} from '@nocobase/i18n/server';
import type { Context } from 'hono';

import { AUTHORIZATION_NAMESPACE } from '../shared.js';

/**
 * Text an application registered with a Collection or a Record Access Policy:
 * written out, or a key in a catalogue it ships.
 *
 * It never reaches the wire. The options endpoint resolves it against the
 * request's locale first, so every client still receives a plain string.
 */
export type OptionText =
  string | { readonly key: string; readonly ns?: string };

/**
 * The translator for this request, bound to this plugin's namespace, or nothing
 * when the host mounted no i18n middleware. The options endpoint answers either
 * way: without one, every string is the English default written at the call
 * site, which is what it sent before it translated anything.
 */
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

/**
 * A registration's text as the request's locale renders it. A string is used as
 * written; a key resolves against its own namespace, and falls back to its last
 * segment humanised so a missing catalogue still reads as a label rather than
 * as a dotted path.
 */
export function resolveOptionText(
  context: Context,
  value: OptionText | undefined,
  fallback: string,
): string {
  if (value === undefined) return fallback;
  if (typeof value === 'string') return value;
  const humanized = humanizeKey(value.key);
  return (
    requestTranslator(context)?.(value.key, {
      ...(value.ns === undefined ? {} : { ns: value.ns }),
      defaultValue: humanized,
    }) ?? humanized
  );
}

/** Two registrations agree when their text is the same string, or the same key. */
export function sameOptionText(
  left: OptionText | undefined,
  right: OptionText | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (typeof left === 'string' || typeof right === 'string')
    return left === right;
  return left.key === right.key && left.ns === right.ns;
}

function humanizeKey(key: string): string {
  return (key.split('.').at(-1) ?? key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
