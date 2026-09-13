import type { AppDriveDiskConfig } from '@nocobase/drive';

export interface HubPluginConfig {
  readonly artifact: AppDriveDiskConfig;
  readonly host: {
    readonly enabled: boolean;
    readonly driver: 'node' | 'tsx';
    readonly appDeploymentsDir: string;
    readonly appVolumesDir: string;
    readonly configPath: string;
    readonly host?: string;
    readonly port?: number;
    readonly startTimeoutMs?: number;
    readonly ipcTimeoutMs?: number;
    readonly shutdownTimeoutMs?: number;
    readonly autoRestart?: boolean;
    readonly maxAutomaticRestarts?: number;
    readonly automaticRestartWindowMs?: number;
    readonly automaticRestartBaseDelayMs?: number;
    readonly entrypoint?: string;
    readonly tsxCli?: string;
    readonly tsconfig?: string;
  };
}
