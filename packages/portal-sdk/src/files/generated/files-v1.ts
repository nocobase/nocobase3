// DO NOT EDIT. Generated from packages/files/openapi/files-v1.json.
export interface paths {
    "/api/files/v1/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["filesGetConfig"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/files/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["filesGetFile"];
        put?: never;
        post?: never;
        delete: operations["filesDeleteFile"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/files/{fileId}/url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["filesCreateUrl"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/delivery/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["filesDeliverLocalFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["filesCreateUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/uploads/{uploadId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put: operations["filesUploadProxyContent"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/v1/uploads/{uploadId}/complete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["filesCompleteUpload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    filesGetConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Public files configuration */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** @enum {string} */
                            apiVersion: "files/v1";
                            defaultPolicy: string;
                            policies: {
                                [key: string]: {
                                    description: string;
                                    maxSize: number;
                                    allowedContentTypes: string[];
                                    url: {
                                        defaultTtlSeconds: number;
                                        maxTtlSeconds: number;
                                    };
                                };
                            };
                            capabilities: {
                                uploadModes: ("proxy" | "presigned-put")[];
                                /** @enum {boolean} */
                                temporaryUrls: true;
                            };
                        };
                    };
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Internal error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    filesGetFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File metadata */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            id: string;
                            policy: string;
                            originalName: string;
                            contentType: string;
                            size: number;
                            checksum?: {
                                /** @enum {string} */
                                algorithm: "sha256";
                                value: string;
                            };
                            /** @enum {string} */
                            status: "pending" | "ready" | "failed" | "deleted";
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            allowedActions?: ("read" | "delete")[];
                        };
                    };
                };
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesDeleteFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description File deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesCreateUrl: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                fileId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    disposition?: "inline" | "attachment";
                    expiresIn?: number;
                };
            };
        };
        responses: {
            /** @description Temporary read URL */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            /** Format: uri */
                            url: string;
                            /** Format: date-time */
                            expiresAt: string;
                            /** @enum {string} */
                            method: "GET";
                            headers: {
                                [key: string]: string;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesDeliverLocalFile: {
        parameters: {
            query: {
                token: string;
            };
            header?: never;
            path: {
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Capability-authorized file content */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesCreateUpload: {
        parameters: {
            query?: never;
            header: {
                "Idempotency-Key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    policy?: string;
                    originalName: string;
                    contentType: string;
                    size: number;
                    checksum?: {
                        /** @enum {string} */
                        algorithm: "sha256";
                        value: string;
                    };
                    context?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Upload created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            uploadId: string;
                            fileId: string;
                            /** Format: date-time */
                            expiresAt: string;
                            target: {
                                /** @enum {string} */
                                mode: "proxy" | "presigned-put";
                                /** @enum {string} */
                                method: "PUT";
                                /** Format: uri */
                                url: string;
                                headers: {
                                    [key: string]: string;
                                };
                                /** Format: date-time */
                                expiresAt: string;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesUploadProxyContent: {
        parameters: {
            query: {
                token: string;
            };
            header?: never;
            path: {
                uploadId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/octet-stream": string;
            };
        };
        responses: {
            /** @description Content stored */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Error */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
    filesCompleteUpload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                uploadId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Upload completed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            file: {
                                id: string;
                                policy: string;
                                originalName: string;
                                contentType: string;
                                size: number;
                                checksum?: {
                                    /** @enum {string} */
                                    algorithm: "sha256";
                                    value: string;
                                };
                                /** @enum {string} */
                                status: "pending" | "ready" | "failed" | "deleted";
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                updatedAt: string;
                                allowedActions?: ("read" | "delete")[];
                            };
                        };
                    };
                };
            };
            /** @description Error */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            415: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
            /** @description Error */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            /** @enum {string} */
                            code: "FILES_INVALID_REQUEST" | "FILES_POLICY_NOT_FOUND" | "FILES_FILE_NOT_FOUND" | "FILES_UPLOAD_NOT_FOUND" | "FILES_FORBIDDEN" | "FILES_FILE_TOO_LARGE" | "FILES_CONTENT_TYPE_NOT_ALLOWED" | "FILES_UPLOAD_EXPIRED" | "FILES_UPLOAD_INCOMPLETE" | "FILES_FILE_SIZE_MISMATCH" | "FILES_CHECKSUM_MISMATCH" | "FILES_IDEMPOTENCY_KEY_REUSED" | "FILES_STORAGE_UNAVAILABLE" | "FILES_CONFLICT" | "FILES_INTERNAL_ERROR";
                            message: string;
                            retryable: boolean;
                            requestId?: string;
                            details?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
            };
        };
    };
}
