import { createLogger } from './pino.js';
import type {
  AppLoggerConfig,
  CreateLoggerManagerOptions,
  NocoBaseLogger,
  NocoBaseLoggerManager,
} from './types.js';

export function createSilentLoggerConfig(): AppLoggerConfig {
  return {
    default: 'silent',
    channels: {
      silent: {
        driver: 'silent',
      },
    },
  };
}

export function createLoggerManager(
  config: AppLoggerConfig,
  options: CreateLoggerManagerOptions = {},
): NocoBaseLoggerManager {
  assertDefaultChannel(config);

  const channels = new Map<string, NocoBaseLogger>(
    Object.entries(config.channels).map(([name, channel]) => [
      name,
      createLogger(channel, {
        channel: name,
        destination: options.destination,
      }),
    ]),
  );

  return {
    use(name = config.default): NocoBaseLogger {
      const logger = channels.get(name);
      if (!logger) {
        throw new Error(`Logger channel "${name}" is not configured.`);
      }

      return logger;
    },

    async flushAll(): Promise<void> {
      await Promise.all(Array.from(channels.values(), flushLogger));
    },
  };
}

export function assertDefaultChannel(config: AppLoggerConfig): void {
  if (!config.channels[config.default]) {
    throw new Error(`Default logger channel "${config.default}" is not configured.`);
  }
}

async function flushLogger(logger: NocoBaseLogger): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    logger.flush((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
