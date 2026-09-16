import { HUB_RELEASE_ACTIONS } from './permissions.js';
// These are the existing hub.app actions used by Administrator and Operator grants.
export const HUB_API_KEY_SCOPES: readonly [
  typeof HUB_RELEASE_ACTIONS.upload,
  typeof HUB_RELEASE_ACTIONS.deploy,
] = [HUB_RELEASE_ACTIONS.upload, HUB_RELEASE_ACTIONS.deploy] as const;
export type HubApiKeyScope = (typeof HUB_API_KEY_SCOPES)[number];
export interface HubApiKeyApp {
  readonly id: string;
  readonly name: string;
}
export interface HubApiKeyAppOption extends HubApiKeyApp {
  readonly permissions: readonly HubApiKeyScope[];
}
export interface HubApiKeySummary {
  readonly canCopy: boolean;
  readonly id: string;
  readonly apps: readonly HubApiKeyApp[];
  readonly allApps: boolean;
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
  readonly appIds: readonly string[];
  readonly allApps?: boolean;
  readonly name: string;
  readonly scopes: readonly HubApiKeyScope[];
  readonly expiresAt?: string | null;
}
export interface CreatedHubApiKey {
  readonly key: HubApiKeySummary;
  readonly secret: string;
}
