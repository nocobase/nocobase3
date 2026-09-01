import type { AppNoticeData } from '@nocobase/app-plugin-skills-example/server/tokens';
import type { AppClient } from '@nocobase/app-client';

export type LoadSkillsExampleNotice = () => Promise<AppNoticeData>;

/**
 * Takes the client rather than creating one, so the request goes through the Application's own API client and follows
 * whatever `api.baseURL` it is configured with.
 */
export function loadSkillsExampleNotice(
  appClient: AppClient,
): Promise<AppNoticeData> {
  return appClient.request<AppNoticeData>('skills-example/notice');
}
