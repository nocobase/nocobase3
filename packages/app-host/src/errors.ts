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

export class AppReadinessFailedError extends AppRegistryError {
  constructor(id: string, healthPath: string, reason: string) {
    super(`App "${id}" failed readiness check at ${healthPath}: ${reason}`, {
      status: 422,
      code: 'APP_READINESS_FAILED',
    });
  }
}

export class AppReleaseConflictError extends AppRegistryError {
  constructor(id: string, releaseId: string) {
    super(
      `Release "${releaseId}" for app "${id}" does not match the active immutable release`,
      {
        status: 409,
        code: 'APP_RELEASE_CONFLICT',
      },
    );
  }
}

export class AppReleaseIntegrityError extends AppRegistryError {
  constructor(id: string, releaseId: string, reason: string) {
    super(
      `Release "${releaseId}" for app "${id}" failed integrity verification: ${reason}`,
      {
        status: 409,
        code: 'APP_RELEASE_INTEGRITY_FAILED',
      },
    );
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

export class AppStoppedError extends AppRegistryError {
  constructor(id: string) {
    super(`App "${id}" is stopped`, {
      status: 503,
      code: 'APP_STOPPED',
    });
  }
}

export class AppLifecycleConflictError extends AppRegistryError {
  constructor(id: string, message: string) {
    super(`App "${id}" ${message}`, {
      status: 409,
      code: 'APP_LIFECYCLE_CONFLICT',
    });
  }
}

export class AppLifecycleTransitionError extends AppRegistryError {
  constructor(id: string) {
    super(`App "${id}" is changing runtime state`, {
      status: 503,
      code: 'APP_LIFECYCLE_IN_PROGRESS',
    });
  }
}
