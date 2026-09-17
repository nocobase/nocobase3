import {
  createLogging,
  reportLoggingFailure,
  type LoggingConfig,
} from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import { normalizeRuntimeLogging, type AppLoggingConfig } from './config.js';
import { loggingToken } from './token.js';

export class LoggingProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server/logging';

  public override register(): void {
    this.app.container.singleton(loggingToken, () =>
      createLogging(this.createLoggingConfig()),
    );
  }

  private createLoggingConfig(): LoggingConfig {
    const config = this.app.config.get<AppLoggingConfig>('logging')!;
    if (config.file?.maxSizeMB !== undefined)
      reportLoggingFailure(
        'logging.file.maxSizeMB is deprecated; use maxTotalSizeMB',
      );
    const policy = this.app.runtimeLogging
      ? normalizeRuntimeLogging(this.app.runtimeLogging)
      : undefined;
    const policyFile = policy?.file ?? {};
    const policyConsole =
      typeof policy?.console === 'boolean'
        ? { enabled: policy.console }
        : policy?.console;
    if (
      policy &&
      (config.transport ||
        Object.values(config.loggers ?? {}).some((entry) => entry.transport))
    ) {
      reportLoggingFailure(
        'Hosted logging policy overrides custom transports; use file and console settings',
      );
    }
    const base = {
      service: 'app',
      ...config.base,
      appId: this.app.appName,
      ...policy?.bindings,
    };
    const loggers = Object.fromEntries(
      Object.entries(config.loggers ?? {}).map(([name, entry]) => [
        name,
        {
          ...entry,
          ...(policy?.level ? { level: policy.level } : {}),
          ...(policy ? { enabled: true, transport: undefined } : {}),
          file: {
            ...entry.file,
            ...(policyFile.enabled === undefined
              ? {}
              : { enabled: policyFile.enabled }),
          },
          base: { ...entry.base, ...base },
        },
      ]),
    );
    return {
      ...config,
      ...(policy ? { enabled: true, transport: undefined } : {}),
      loggers,
      level: policy?.level ?? config.level,
      base,
      file: {
        ...config.file,
        ...Object.fromEntries(
          Object.entries(policyFile).filter(([, value]) => value !== undefined),
        ),
        maxSizeMB: undefined,
        directory: this.app.paths.storage('logs'),
        enabled: policyFile.enabled ?? config.file?.enabled ?? true,
        retentionDays:
          policyFile.retentionDays ?? config.file?.retentionDays ?? 7,
        maxTotalSizeMB:
          policyFile.maxSizeMB ??
          policyFile.maxTotalSizeMB ??
          config.file?.maxSizeMB ??
          config.file?.maxTotalSizeMB ??
          500,
      },
      console: {
        enabled:
          policyConsole?.enabled ??
          config.console?.enabled ??
          config.pretty ??
          true,
        pretty:
          policyConsole?.pretty ??
          config.console?.pretty ??
          config.pretty ??
          false,
      },
    };
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(loggingToken)?.close();
  }
}
