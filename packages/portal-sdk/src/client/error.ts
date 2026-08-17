export class NocoBaseHttpError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly code?: string;
  readonly requestId?: string;

  constructor({
    message,
    status,
    payload,
    requestId,
  }: {
    message: string;
    status: number;
    payload?: unknown;
    requestId?: string;
  }) {
    super(message);
    this.name = "NocoBaseHttpError";
    this.status = status;
    this.payload = payload;
    this.code = getNocoBaseErrorDetail(payload)?.code;
    this.requestId = requestId;
  }
}

export type NocoBaseErrorDetail = {
  code?: string;
  command?: {
    name?: string;
    [key: string]: unknown;
  };
  maintaining?: boolean;
  message?: string;
  refresh?: boolean;
  requestId?: string;
  status?: number;
  [key: string]: unknown;
};

export type NocoBaseRuntimeErrorSource =
  | "http"
  | "network"
  | "websocket";

export type NocoBaseRuntimeError = NocoBaseErrorDetail & {
  payload?: unknown;
  source: NocoBaseRuntimeErrorSource;
};

export const isNocoBaseLifecycleError = (error: NocoBaseErrorDetail) =>
  error.maintaining === true ||
  error.code?.startsWith("APP_") === true ||
  error.code?.startsWith("COMMAND_") === true;

export const isNocoBaseServiceError = (error: NocoBaseErrorDetail) =>
  isNocoBaseLifecycleError(error) ||
  (error.status !== undefined && [502, 503, 504].includes(error.status));

const asRecord = (value: unknown) =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;

const asErrorDetail = (value: unknown): NocoBaseErrorDetail | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  return record as NocoBaseErrorDetail;
};

export function getNocoBaseErrorDetail(
  payload: unknown
): NocoBaseErrorDetail | undefined {
  const value = asRecord(payload);
  if (!value) return undefined;

  const directError = asErrorDetail(value.error);
  if (directError) return directError;

  const errors = Array.isArray(value.errors) ? value.errors : undefined;
  const firstError = asErrorDetail(errors?.[0]);
  if (firstError) return firstError;

  const messages = Array.isArray(value.messages) ? value.messages : undefined;
  const firstMessage = asErrorDetail(messages?.[0]);
  if (firstMessage) return firstMessage;

  if (
    typeof value.code === "string" ||
    typeof value.message === "string" ||
    typeof value.maintaining === "boolean"
  ) {
    return value as NocoBaseErrorDetail;
  }

  return undefined;
}

export function normalizeNocoBaseRuntimeError(
  error: unknown,
  source: NocoBaseRuntimeErrorSource = "http"
): NocoBaseRuntimeError {
  if (error instanceof NocoBaseHttpError) {
    const detail = getNocoBaseErrorDetail(error.payload);
    return {
      ...detail,
      code: detail?.code ?? error.code,
      message: detail?.message ?? error.message,
      payload: error.payload,
      requestId: detail?.requestId ?? error.requestId,
      source,
      status: detail?.status ?? error.status,
    };
  }

  const detail = getNocoBaseErrorDetail(error);
  if (detail) {
    return {
      ...detail,
      message: detail.message ?? "NocoBase request failed",
      payload: error,
      source,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      payload: error,
      source,
    };
  }

  return {
    message:
      typeof error === "string" && error
        ? error
        : "NocoBase request failed",
    payload: error,
    source,
  };
}

export const getNocoBaseErrorCode = (error: unknown) =>
  normalizeNocoBaseRuntimeError(error).code;

export const getNocoBaseErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string") return payload || fallback;
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as {
    message?: string;
    error?: { message?: string };
    errors?: Array<{ message?: string } | string>;
    messages?: Array<{ message?: string } | string>;
  };
  const first = value.errors?.[0] ?? value.messages?.[0];
  if (typeof first === "string") return first;
  return first?.message ?? value.error?.message ?? value.message ?? fallback;
};
