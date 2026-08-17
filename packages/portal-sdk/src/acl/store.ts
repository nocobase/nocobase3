import {
  getNocoBaseErrorCode,
  nocobaseClient,
  normalizeNocoBaseRuntimeError,
} from "../client/index.ts";
import { portalRuntimeStore } from "../runtime/store.ts";
import type { AclStore } from "./context.ts";
import { getPortalAccessDeniedData } from "./portal-access.ts";
import {
  clearRecordPermissions,
  getRecordActionPermission,
  getRecordPermissions,
  subscribeRecordPermissions,
} from "./record-permissions.ts";
import type { AclPermissionSet, AclResponse, AclState } from "./types.ts";

const listeners = new Set<() => void>();
let activeRequest:
  | {
      id: number;
      sessionKey: string;
      promise: Promise<AclState>;
    }
  | undefined;
let requestId = 0;
let loadedSessionKey: string | undefined;
let state: AclState = { status: "idle" };

const emit = () => listeners.forEach((listener) => listener());

const setState = (next: AclState) => {
  state = next;
  emit();
  return state;
};

const getSessionKey = () => {
  return `${nocobaseClient.getToken() ?? "cookie"}:${
    nocobaseClient.getRole() ?? ""
  }`;
};

const requestAcl = async (role?: string) =>
  nocobaseClient.request<AclResponse>("roles:check", {
    unwrap: "none",
    withAclMeta: false,
    role,
    includeRole: Boolean(role),
  });

const isStaleRoleError = (error: unknown) => {
  const code = getNocoBaseErrorCode(error);
  return ["ROLE_NOT_FOUND_ERR", "ROLE_NOT_FOUND_FOR_USER"].includes(
    code ?? ""
  );
};

const normalizePermissions = (
  response: AclResponse,
  fallbackRole?: string
): AclPermissionSet => {
  const { role, roles, ...permissions } = response.data ?? {};
  const currentRole = role ?? fallbackRole;
  return {
    ...permissions,
    currentRole,
    roles: roles ?? (currentRole ? [currentRole] : []),
    dataSources: response.meta?.dataSources,
  };
};

export const getAclState = () => state;

export const subscribeAcl = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearAcl = () => {
  requestId += 1;
  activeRequest = undefined;
  loadedSessionKey = undefined;
  clearRecordPermissions();
  setState({ status: "idle" });
};

const load = async ({ force = false } = {}) => {
  const sessionKey = getSessionKey();
  if (!force && state.status === "ready" && loadedSessionKey === sessionKey) {
    return state;
  }
  if (!force && activeRequest?.sessionKey === sessionKey) {
    return activeRequest.promise;
  }

  setState({ status: "loading" });
  const currentRequestId = ++requestId;
  const requestedRole = nocobaseClient.getRole();
  const promise = (async () => {
    try {
      let response: AclResponse;
      let effectiveRole = requestedRole;
      try {
        response = await requestAcl(requestedRole);
      } catch (error) {
        if (!requestedRole || !isStaleRoleError(error)) throw error;
        effectiveRole = undefined;
        response = await requestAcl();
      }

      if (currentRequestId !== requestId) return state;

      const permissions = normalizePermissions(response, effectiveRole);
      nocobaseClient.setRole(permissions.currentRole ?? null);
      clearRecordPermissions();
      loadedSessionKey = getSessionKey();
      return setState({ status: "ready", permissions });
    } catch (error) {
      if (getNocoBaseErrorCode(error) === "USER_HAS_NO_ROLES_ERR") {
        portalRuntimeStore.setError(
          normalizeNocoBaseRuntimeError(error, "http")
        );
      }
      const normalizedError =
        error instanceof Error
          ? error
          : new Error("Unable to load permissions");
      if (currentRequestId !== requestId) return state;
      loadedSessionKey = undefined;
      return setState({
        status: "error",
        error: normalizedError,
        portalAccessDenied: getPortalAccessDeniedData(error),
      });
    } finally {
      if (activeRequest?.id === currentRequestId) activeRequest = undefined;
    }
  })();
  activeRequest = { id: currentRequestId, sessionKey, promise };
  return promise;
};

export const loadAcl = () => load();

export const retryAcl = () => load({ force: true });

export const switchRole = async (roleName: string) => {
  const previousRole = nocobaseClient.getRole();
  nocobaseClient.setRole(roleName);

  try {
    await nocobaseClient.action("users", "setDefaultRole", {
      method: "POST",
      body: { roleName },
      withAclMeta: false,
    });
    await nocobaseClient.action("auth", "syncCookies", {
      method: "POST",
      withAclMeta: false,
    });
  } catch (error) {
    nocobaseClient.setRole(previousRole);
    try {
      await nocobaseClient.action("auth", "syncCookies", {
        method: "POST",
        withAclMeta: false,
      });
    } catch {
      // Preserve the original role-switch error. The stored role still rolls
      // back and will override a stale role cookie on subsequent requests.
    }
    throw error;
  }

  clearAcl();
};

export const aclStore: AclStore = {
  getState: getAclState,
  subscribe: subscribeAcl,
  load: loadAcl,
  retry: retryAcl,
  clear: clearAcl,
  recordPermissions: {
    getState: getRecordPermissions,
    subscribe: subscribeRecordPermissions,
    getPermission: getRecordActionPermission,
  },
};
