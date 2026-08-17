import { useQuery } from "@tanstack/react-query";

import { nocobaseClient } from "@nocobase/portal-sdk/client";

import { getDataSourceHeaders } from "./storage";
import type { FileFieldDescriptor, StorageCheckResult } from "./types";

export function checkFileStorage(
  descriptor: FileFieldDescriptor,
  options: { signal?: AbortSignal } = {}
) {
  const dataSourceKey = descriptor.dataSourceKey ?? "main";

  return nocobaseClient.action<StorageCheckResult>("storages", "check", {
    method: "POST",
    query: {
      fileCollectionName: descriptor.fileCollection,
      uploadDataSourceKey:
        dataSourceKey === "main" ? undefined : dataSourceKey,
    },
    headers: getDataSourceHeaders(dataSourceKey),
    signal: options.signal,
  });
}

export function useFileStorage(
  descriptor: FileFieldDescriptor,
  options: { enabled?: boolean } = {}
) {
  const dataSourceKey = descriptor.dataSourceKey ?? "main";

  return useQuery({
    queryKey: [
      "nocobase",
      "file-storage",
      dataSourceKey,
      descriptor.fileCollection,
    ],
    queryFn: () => checkFileStorage(descriptor),
    enabled: options.enabled ?? false,
    staleTime: 5 * 60 * 1000,
  });
}
