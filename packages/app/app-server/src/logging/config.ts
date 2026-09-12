import type { LoggingConfig } from '@nocobase/logging';

export interface AppLoggingConfig extends LoggingConfig {
  readonly pretty?: boolean;
}
