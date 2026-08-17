import type { BaseKey, IResourceItem } from "@refinedev/core";

export type RoleMode = "default" | "allow-use-union" | "only-use-union";

export type PortalAccessDeniedData = {
  portalName: string;
  role?: string;
  roles: string[];
  roleMode?: RoleMode;
  allowAnonymous?: boolean;
};

export type Role = {
  name: string;
  title?: string;
};

export type RoleConstraint = {
  anyOf?: string[];
  allOf?: string[];
  noneOf?: string[];
};

export type RouteAccessConstraint = {
  roles: RoleConstraint;
};

export type AclActionParams = Record<string, unknown> & {
  fields?: string[];
  whitelist?: string[];
  appends?: string[];
};

export type AclResourcePermissions = {
  snippets?: string[];
  resources?: string[];
  actions?: Record<string, AclActionParams>;
  actionAlias?: Record<string, string>;
  strategy?: {
    actions?: string[];
  };
  allowAll?: boolean;
  allowConfigure?: boolean;
  availableActions?: string[];
  allowMenuItemIds?: Array<string | number>;
  allowAnonymous?: boolean;
  uiButtonSchemasBlacklist?: string[];
};

export type AclPermissionSet = AclResourcePermissions & {
  currentRole?: string;
  roles: string[];
  roleMode?: RoleMode;
  dataSources?: Record<string, Partial<AclResourcePermissions>>;
};

export type AclResponse = {
  data?: AclResourcePermissions & {
    role?: string;
    roles?: string[];
    roleMode?: RoleMode;
  };
  meta?: {
    dataSources?: Record<string, Partial<AclResourcePermissions>>;
  };
};

export type AclState =
  | {
      status: "idle" | "loading";
      permissions?: undefined;
      error?: undefined;
    }
  | {
      status: "ready";
      permissions: AclPermissionSet;
      error?: undefined;
    }
  | {
      status: "error";
      permissions?: undefined;
      error: Error;
      portalAccessDenied?: PortalAccessDeniedData;
    };

type ResourceAclRule = {
  roles?: RoleConstraint;
} & (
  | {
      type: "authenticated";
    }
  | {
      type: "collection";
      resource?: string;
      dataSourceKey?: string;
      actionMap?: Record<string, string>;
    }
  | {
      type: "snippet";
      name: string;
    }
  | {
      type: "route";
      routeId: string | number;
    }
);

export type ResourceAcl = false | ResourceAclRule;

export type AclAccessRequest = {
  roles?: RoleConstraint;
  resource?: string;
  action?: string;
  id?: BaseKey;
  field?: string;
  dataSourceKey?: string;
  meta?: Record<string, unknown>;
  resourceItem?: IResourceItem;
};

export type AclIdentity = {
  id: number | string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  avatar?: string;
  roles: Role[];
};
