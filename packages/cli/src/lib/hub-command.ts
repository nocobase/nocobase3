import type { Command } from '@oclif/core';
import { HubCredentialError } from './hub-auth.ts';
import {
  HubApiError,
  HubNetworkError,
  HubProtocolError,
} from './hub-client.ts';
import { LocalOperationError } from './operation-store.ts';
import { LocalReleaseArtifactError } from './release-artifact.ts';

export interface HubCommandErrorDetails {
  code: string;
  message: string;
  requestId?: string;
  retryable: boolean;
  hint?: string;
  exitCode: number;
}

export interface HubCommandFailureResources {
  readonly application?: unknown;
  readonly release?: unknown;
  readonly deployment?: unknown;
}

export class AppBuildError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppBuildError';
  }
}

export function failHubCommand(
  command: Command,
  error: unknown,
  json: boolean,
  fallbackHint?: string,
  operationId?: string,
  resources: HubCommandFailureResources = {},
): never {
  const details = hubCommandErrorDetails(error, fallbackHint);
  const hint = commandHint(command, details.hint);
  if (json) {
    command.log(
      JSON.stringify({
        ok: false,
        ...(operationId ? { operationId } : {}),
        ...(resources.application
          ? { application: resources.application }
          : {}),
        ...(resources.release ? { release: resources.release } : {}),
        ...(resources.deployment ? { deployment: resources.deployment } : {}),
        error: {
          code: details.code,
          message: details.message,
          retryable: details.retryable,
          ...(details.requestId ? { requestId: details.requestId } : {}),
          ...(hint ? { hint } : {}),
        },
      }),
    );
    return command.exit(details.exitCode);
  }
  return command.error(
    [
      `${details.code}: ${details.message}`,
      ...(details.requestId ? [`Request ID: ${details.requestId}`] : []),
      ...(hint ? [`Next: ${hint}`] : []),
    ].join('\n'),
    { exit: details.exitCode },
  );
}

function commandHint(
  command: Command,
  hint: string | undefined,
): string | undefined {
  if (!hint || command.config.bin !== 'pnpm run') return hint;
  if (!hint.startsWith('nb3 hub login ')) return hint;
  return `pnpm run hub:login ${hint.slice('nb3 hub login '.length)}`;
}

export function hubCommandErrorDetails(
  error: unknown,
  fallbackHint?: string,
): HubCommandErrorDetails {
  if (error instanceof HubCredentialError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      hint: error.hint,
      exitCode: error.code === 'NOT_LOGGED_IN' ? 3 : 4,
    };
  }
  if (error instanceof HubApiError) {
    return {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable,
      hint: fallbackHint,
      exitCode: apiExitCode(error),
    };
  }
  if (error instanceof HubNetworkError) {
    return {
      code: error.code,
      message: error.message,
      retryable: true,
      hint: fallbackHint,
      exitCode: 6,
    };
  }
  if (error instanceof HubProtocolError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      hint: fallbackHint,
      exitCode: 6,
    };
  }
  if (error instanceof AppBuildError) {
    return {
      code: 'APP_BUILD_FAILED',
      message: error.message,
      retryable: false,
      hint: fallbackHint,
      exitCode: 7,
    };
  }
  if (
    error instanceof LocalOperationError ||
    error instanceof LocalReleaseArtifactError
  ) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
      hint: fallbackHint,
      exitCode: 2,
    };
  }
  return {
    code: 'LOCAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
    hint: fallbackHint,
    exitCode: 2,
  };
}

function apiExitCode(error: HubApiError): number {
  if (error.status === 401) return 3;
  if (error.status === 403) return 4;
  if (error.status === 404 || error.status === 409) return 5;
  if (error.status >= 500 || error.retryable) return 6;
  return 2;
}
