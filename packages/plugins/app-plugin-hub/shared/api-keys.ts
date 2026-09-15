export const HUB_API_KEY_SCOPES = [
  'upload-release',
  'read-release',
  'deploy',
  'read-operation',
] as const;
export type HubApiKeyScope = (typeof HUB_API_KEY_SCOPES)[number];
export const HUB_API_KEY_ACTIONS: Readonly<Record<HubApiKeyScope, string>> = {
  'upload-release': 'upload-release',
  'read-release': 'read-release',
  deploy: 'deploy',
  'read-operation': 'read-deployment',
};
export interface HubApiKeySummary {
  readonly id: string;
  readonly appId: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly HubApiKeyScope[];
  readonly status: 'active' | 'disabled' | 'expired';
  readonly createdBy: string;
  readonly creatorName: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
}
export interface CreateHubApiKeyInput {
  readonly name: string;
  readonly scopes: readonly HubApiKeyScope[];
  readonly expiresAt?: string | null;
}
export interface CreatedHubApiKey {
  readonly key: HubApiKeySummary;
  readonly secret: string;
}
