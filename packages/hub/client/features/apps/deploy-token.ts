import { getPortalBase } from '@nocobase/app-portal-sdk/runtime';

const STORAGE_KEY_PREFIX = 'nocobase:hub:deploy-token';
const tokenRequests = new Map<string, Promise<string>>();

export function rememberDeployToken(appId: string, deployToken: string): void {
  if (typeof window === 'undefined') return;
  const token = deployToken.trim();
  if (!token) return;
  try {
    window.localStorage.setItem(storageKey(appId), token);
  } catch {
    // The command still works in the current dialog when storage is unavailable.
  }
}

export function readRememberedDeployToken(appId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(appId))?.trim() || null;
  } catch {
    return null;
  }
}

export async function getDeployTokenForCommand(appId: string): Promise<string> {
  const remembered = readRememberedDeployToken(appId);
  if (remembered) return remembered;

  const existing = tokenRequests.get(appId);
  if (existing) return existing;

  const request = issueDeployToken(appId).finally(() => {
    tokenRequests.delete(appId);
  });
  tokenRequests.set(appId, request);
  return request;
}

async function issueDeployToken(appId: string): Promise<string> {
  const response = await fetch(
    `${hubBasePath()}/api/apps/${encodeURIComponent(appId)}/deploy-token`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'NocoBase3',
      },
      credentials: 'include',
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const deployToken =
    typeof payload.deployToken === 'string' ? payload.deployToken.trim() : '';
  if (!response.ok || !deployToken) {
    throw new Error(`Unable to issue a deployment token (${response.status})`);
  }
  rememberDeployToken(appId, deployToken);
  return deployToken;
}

function storageKey(appId: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(hubBasePath())}:${encodeURIComponent(appId)}`;
}

function hubBasePath(): string {
  return getPortalBase().replace(/\/+$/, '');
}
