import { nocobaseClient } from "@nocobase/portal-sdk/client";

import { getDataSourceHeaders } from "./storage";
import type { FileUploadOptions, NocoBaseFileRecord } from "./types";

export async function uploadMultipart({
  file,
  descriptor,
  signal,
}: FileUploadOptions) {
  const dataSourceKey = descriptor.dataSourceKey ?? "main";
  const formData = new FormData();

  formData.append("file", file);

  return nocobaseClient.action<NocoBaseFileRecord>(
    descriptor.fileCollection,
    "create",
    {
      method: "POST",
      body: formData,
      signal,
      headers: getDataSourceHeaders(dataSourceKey),
      query: {
        uploadDataSourceKey:
          dataSourceKey === "main" ? undefined : dataSourceKey,
      },
    }
  );
}
