import type { ResourceAcl } from "./types.ts";

type DataSourceMeta = {
  dataSourceKey?: unknown;
  acl?: ResourceAcl;
};

export const resolveAclDataSourceKey = (
  ...candidates: Array<DataSourceMeta | null | undefined>
) => {
  for (const candidate of candidates) {
    if (typeof candidate?.dataSourceKey === "string") {
      return candidate.dataSourceKey;
    }
    if (
      candidate?.acl &&
      candidate.acl.type === "collection" &&
      candidate.acl.dataSourceKey
    ) {
      return candidate.acl.dataSourceKey;
    }
  }
  return undefined;
};
