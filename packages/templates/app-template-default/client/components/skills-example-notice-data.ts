import type { AppNoticeData } from '@nocobase/app-plugin-skills-example/server/tokens';
import { createAppClient, type AppClient } from '@nocobase/app-sdk';

export type LoadSkillsExampleNotice = () => Promise<AppNoticeData>;

export function loadSkillsExampleNotice(
  appClient: AppClient = createAppClient(),
): Promise<AppNoticeData> {
  return appClient.request<AppNoticeData>('skills-example/notice');
}
