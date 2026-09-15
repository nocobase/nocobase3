/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export class AppRegistryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { status: number; code: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
  }
}

export function rootErrorMessage(error: unknown): string {
  let current = error;
  const visited = new Set<unknown>();

  while (
    current instanceof Error &&
    current.cause !== undefined &&
    !visited.has(current)
  ) {
    visited.add(current);
    current = current.cause;
  }

  return current instanceof Error ? current.message : String(current);
}

export class InvalidAppIdError extends AppRegistryError {
  constructor(id: string) {
    super(
      `Invalid app id "${id}". Use letters, numbers, underscores, or hyphens.`,
      {
        status: 400,
        code: 'APP_INVALID_ID',
      },
    );
  }
}

export class AppAlreadyExistsError extends AppRegistryError {
  constructor(id: string) {
    super(`App "${id}" already exists`, {
      status: 409,
      code: 'APP_ALREADY_EXISTS',
    });
  }
}

export class AppNotFoundError extends AppRegistryError {
  constructor(id: string) {
    super(`App "${id}" does not exist`, {
      status: 404,
      code: 'APP_NOT_FOUND',
    });
  }
}

export class AppCreateFailedError extends AppRegistryError {
  constructor(id: string, cause: unknown) {
    // The cause is folded into the message rather than left on `cause` alone. This error crosses the Hub IPC
    // boundary, which serialises an error to its message and reconstructs it on the other side, so anything not in
    // the message is lost before an operator ever sees it — leaving "failed to initialize" as the whole diagnosis.
    super(`App "${id}" failed to initialize: ${describeCause(cause)}`, {
      status: 500,
      code: 'APP_CREATE_FAILED',
      cause,
    });
  }
}

export class AppReloadFailedError extends AppRegistryError {
  constructor(id: string, cause: unknown) {
    super(`App "${id}" failed to reload: ${describeCause(cause)}`, {
      status: 500,
      code: 'APP_RELOAD_FAILED',
      cause,
    });
  }
}

export class AppCapacityExceededError extends AppRegistryError {
  constructor(maxActiveApps: number) {
    super(
      `Active app capacity exceeded and no idle app can be evicted. maxActiveApps=${maxActiveApps}`,
      {
        status: 503,
        code: 'APP_CAPACITY_EXCEEDED',
      },
    );
  }
}

/**
 * The message of whatever went wrong, for folding into an error that has to survive serialisation.
 *
 * An `AggregateError` is unfolded because its own message says only that several things failed. The replacement
 * path throws one holding both the activation failure and the restore failure, and those two messages are the
 * diagnosis; reporting the summary alone would keep the exact defect this folding exists to remove.
 */
function describeCause(cause: unknown): string {
  if (cause instanceof AggregateError && cause.errors.length > 0) {
    const reasons = cause.errors.map((error) => describeCause(error));
    return `${cause.message} (${reasons.join('; ')})`;
  }

  return cause instanceof Error ? cause.message : String(cause);
}
