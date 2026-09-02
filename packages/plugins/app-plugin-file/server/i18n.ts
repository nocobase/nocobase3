import { getRequestTranslator } from '@nocobase/i18n/server';
import type { Context, Env, Input } from 'hono';

import { FILE_PLUGIN_NS } from '../shared/namespace.js';

export type FileTranslationParams = Readonly<Record<string, unknown>>;

export function translateFileMessage<
  TEnv extends Env,
  TPath extends string,
  TInput extends Input,
>(
  context: Context<TEnv, TPath, TInput>,
  key: string,
  defaultValue: string,
  params?: FileTranslationParams,
): string {
  const t = getRequestTranslator(context, FILE_PLUGIN_NS);
  return t(key, { defaultValue, ...params });
}

export function translateFileError<
  TEnv extends Env,
  TPath extends string,
  TInput extends Input,
>(
  context: Context<TEnv, TPath, TInput>,
  error: Error & {
    readonly code?: string;
    readonly i18nKey?: string;
    readonly i18nParams?: FileTranslationParams;
  },
): string {
  return translateFileMessage(
    context,
    error.i18nKey ?? fallbackErrorKey(error.code),
    error.message,
    error.i18nParams,
  );
}

function fallbackErrorKey(code: string | undefined): string {
  if (code === 'FILE_UNAVAILABLE') return 'errors.serviceUnavailable';
  if (code === 'FILE_OBJECT_NOT_FOUND') return 'errors.storageObjectNotFound';
  if (code === 'FILE_TOKEN_INVALID') return 'errors.tokenInvalid';
  if (code === 'FILE_TOKEN_EXPIRED') return 'errors.tokenExpired';
  if (code === 'FILE_LIMIT_REACHED') return 'errors.fileLimitReached';
  return 'errors.inputInvalid';
}
