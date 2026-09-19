import { type AppSessionConfig } from '@nocobase/session';

export interface AppSessionGcLotteryConfig {
  readonly hits: number;
  readonly total: number;
}

export interface AppSessionConfigInput extends Omit<
  AppSessionConfig,
  'gcLottery' | 'secret'
> {
  readonly gcLottery: AppSessionGcLotteryConfig;
  readonly secret?: string;
}
