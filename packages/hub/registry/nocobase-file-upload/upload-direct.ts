import { nocobaseClient } from "@nocobase/portal-sdk/client";

import { getDataSourceHeaders } from "./storage";
import type {
  FileUploadMessages,
  FileUploadOptions,
  NocoBaseFileRecord,
} from "./types";

export type PresignedFileInfo = {
  key: string;
  title: string;
  extname?: string;
  size?: number;
  mimetype?: string;
  url?: string;
};

export type PresignedUploadResult = {
  putUrl: string;
  fileInfo: PresignedFileInfo;
};

export async function uploadDirect(
  { file, descriptor, storage, signal }: FileUploadOptions,
  messages: Pick<FileUploadMessages, "directUploadFailed">
) {
  const dataSourceKey = descriptor.dataSourceKey ?? "main";
  const headers = getDataSourceHeaders(dataSourceKey);
  const mimetype = file.type || "application/octet-stream";

  const initialized = await nocobaseClient.action<PresignedUploadResult>(
    "storages",
    "createPresignedUrl",
    {
      method: "POST",
      headers,
      signal,
      query: {
        uploadDataSourceKey:
          dataSourceKey === "main" ? undefined : dataSourceKey,
      },
      body: {
        name: file.name,
        size: file.size,
        type: mimetype,
        storageId: storage.id,
        storageType: storage.type,
      },
    }
  );

  const uploaded = await fetch(initialized.putUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimetype,
    },
    body: file,
    signal,
  });

  if (!uploaded.ok) {
    throw new Error(messages.directUploadFailed(uploaded.status));
  }

  const { fileInfo } = initialized;

  return nocobaseClient.action<NocoBaseFileRecord>(
    descriptor.fileCollection,
    "create",
    {
      method: "POST",
      headers,
      signal,
      query: {
        uploadDataSourceKey:
          dataSourceKey === "main" ? undefined : dataSourceKey,
      },
      body: {
        title: fileInfo.title,
        filename: fileInfo.key,
        extname: fileInfo.extname,
        path: "",
        size: fileInfo.size ?? file.size,
        url: fileInfo.url ?? "",
        mimetype: fileInfo.mimetype ?? mimetype,
        meta: {},
        storageId: storage.id,
      },
    }
  );
}
