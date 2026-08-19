import { createLogger } from './logger.js';
import type { Logger, LoggingConfig } from './types.js';

export class Logging {
  private readonly loggers = new Map<string, Logger>();

  constructor(private readonly config: LoggingConfig) {
    if (!config.loggers[config.default]) {
      throw new Error(`Default logger "${config.default}" is not configured.`);
    }
  }

  getLogger(name = this.config.default): Logger {
    const existing = this.loggers.get(name);
    if (existing) {
      return existing;
    }

    const config = this.config.loggers[name];
    if (!config) {
      throw new Error(`Logger "${name}" is not configured.`);
    }

    const logger = createLogger(config);
    this.loggers.set(name, logger);
    return logger;
  }

  hasLogger(name: string): boolean {
    return Boolean(this.config.loggers[name]);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.loggers.values()].map((logger) => flushLogger(logger)));
  }
}

async function flushLogger(logger: Logger): Promise<void> {
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
