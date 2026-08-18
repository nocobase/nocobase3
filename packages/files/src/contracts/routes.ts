export const FILES_API_PREFIX = "/api/files/v1" as const;
export const FILES_ROUTES = {
  getConfig: { method: "GET", path: `${FILES_API_PREFIX}/config`, operationId: "filesGetConfig" },
  getFile: { method: "GET", path: `${FILES_API_PREFIX}/files/:fileId`, operationId: "filesGetFile" },
  createUpload: { method: "POST", path: `${FILES_API_PREFIX}/uploads`, operationId: "filesCreateUpload" },
  uploadProxyContent: { method: "PUT", path: `${FILES_API_PREFIX}/uploads/:uploadId/content`, operationId: "filesUploadProxyContent" },
  completeUpload: { method: "POST", path: `${FILES_API_PREFIX}/uploads/:uploadId/complete`, operationId: "filesCompleteUpload" },
  createUrl: { method: "POST", path: `${FILES_API_PREFIX}/files/:fileId/url`, operationId: "filesCreateUrl" },
  deleteFile: { method: "DELETE", path: `${FILES_API_PREFIX}/files/:fileId`, operationId: "filesDeleteFile" },
} as const;
export type FilesRoute = (typeof FILES_ROUTES)[keyof typeof FILES_ROUTES];
