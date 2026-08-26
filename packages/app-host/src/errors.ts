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

export class AppStoppedError extends AppRegistryError {
  constructor(id: string) {
    super(`App "${id}" is stopped`, {
      status: 503,
      code: 'APP_STOPPED',
    });
  }
}

export class AppCreateFailedError extends AppRegistryError {
  constructor(id: string, cause: unknown) {
    super(`App "${id}" failed to initialize`, {
      status: 500,
      code: 'APP_CREATE_FAILED',
      cause,
    });
  }
}

export class AppReloadFailedError extends AppRegistryError {
  constructor(id: string, cause: unknown) {
    super(`App "${id}" failed to reload`, {
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
