import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface AppScheduleDefinitionContribution {
  readonly packageName: string;
  readonly location: string;
}

export class AppScheduleDefinitionContributions {
  private readonly contributions: AppScheduleDefinitionContribution[] = [];

  public add(contribution: AppScheduleDefinitionContribution): void {
    this.contributions.push(Object.freeze({ ...contribution }));
  }

  public list(): readonly AppScheduleDefinitionContribution[] {
    return Object.freeze([...this.contributions]);
  }
}

export const appScheduleDefinitionContributionsToken: ServiceToken<AppScheduleDefinitionContributions> =
  createServiceToken<AppScheduleDefinitionContributions>(
    '@nocobase/app-server/schedule-definition-contributions',
  );
