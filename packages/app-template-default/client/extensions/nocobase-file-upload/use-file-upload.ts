import {
  completeFileUploadPlan,
  executeFileUploadPlan,
  FileClientError,
} from '@nocobase/app-plugin-files/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { appFileClient } from './app-client';
import { normalizeFileBasePath } from './base-path';
import { validateFile } from './validation';
import type {
  CreateScopedFileResponse,
  FileUploadItem,
  FileUploadMessages,
  FileUploadPlan,
  FileUploadProgress,
  StoredFile,
} from './types';

export type UseFileUploadOptions = {
  basePath: string;
  value: StoredFile[];
  onChange: (value: StoredFile[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  accept?: string | readonly string[];
  messages: FileUploadMessages;
  onUploadStart?: (file: File) => void;
  onUploadProgress?: (progress: FileUploadProgress, file: File) => void;
  onUploadComplete?: (file: StoredFile) => void | Promise<void>;
  onUploadError?: (error: Error, file: File) => void;
};

let uploadKeySeed = 0;

export function useFileUpload({
  basePath,
  value,
  onChange,
  disabled,
  readOnly,
  multiple = false,
  maxFiles,
  maxBytes,
  accept,
  messages,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
}: UseFileUploadOptions) {
  const path = useMemo(() => normalizeFileBasePath(basePath), [basePath]);
  const controlledValue = useMemo(
    () => (multiple ? value : value.slice(0, 1)),
    [multiple, value],
  );
  const recordsRef = useRef(controlledValue);
  const controllersRef = useRef(new Map<string, AbortController>());
  const attemptKeysRef = useRef(new Set<string>());
  const completePlansRef = useRef(new Map<string, FileUploadPlan>());
  const [operationError, setOperationError] = useState<Error | null>(null);
  const [attempts, setAttempts] = useState<FileUploadItem[]>([]);
  const items = useMemo(
    () => [...controlledValue.map(toReadyItem), ...attempts],
    [attempts, controlledValue],
  );
  const canUpload = !disabled && !readOnly;
  const additionCount = attempts.filter(
    (item) => isActiveItem(item) && item.replaceFileId === undefined,
  ).length;
  const reachedLimit =
    multiple &&
    maxFiles !== undefined &&
    controlledValue.length + additionCount >= maxFiles;
  const uploadActive = attempts.some(isActiveItem);

  useEffect(() => {
    recordsRef.current = controlledValue;
  }, [controlledValue]);

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      attemptKeysRef.current.clear();
      completePlansRef.current.clear();
    },
    [],
  );

  const runUpload = useCallback(
    async (item: FileUploadItem): Promise<void> => {
      if (!item.rawFile || !attemptKeysRef.current.has(item.key)) return;
      const source = item.rawFile;
      const controller = new AbortController();
      controllersRef.current.set(item.key, controller);
      setOperationError(null);
      let completePlan = completePlansRef.current.get(item.key);

      try {
        const validation = validateFile(source, {
          maxBytes,
          accept,
          messages,
        });
        if (!validation.valid) throw new Error(validation.message);

        let ready: StoredFile;
        if (completePlan) {
          updateAttempt(setAttempts, item.key, (current) => ({
            ...current,
            status: 'completing',
            error: undefined,
            progress: {
              loaded: source.size,
              total: source.size,
              percentage: 100,
            },
          }));
          ready = await completeFileUploadPlan(completePlan);
        } else {
          onUploadStart?.(source);
          updateAttempt(setAttempts, item.key, (current) => ({
            ...current,
            status: 'uploading',
            error: undefined,
            progress: { loaded: 0, total: source.size, percentage: 0 },
          }));
          const created = await appFileClient.request<CreateScopedFileResponse>(
            path,
            {
              method: 'POST',
              body: JSON.stringify({
                name: source.name,
                size: source.size,
                ...(source.type ? { contentType: source.type } : {}),
                ...(item.replaceFileId
                  ? { replaceFileId: item.replaceFileId }
                  : {}),
              }),
            },
          );
          assertCreatedUpload(created);
          completePlan = created.plan;
          ready = await executeFileUploadPlan(created.plan, source, {
            signal: controller.signal,
            onProgress: (progress) => {
              updateAttempt(setAttempts, item.key, (current) => ({
                ...current,
                status: progress.percentage >= 100 ? 'completing' : 'uploading',
                progress,
              }));
              onUploadProgress?.(progress, source);
            },
          });
        }

        const nextRecords = replaceRecord(
          recordsRef.current,
          ready,
          item.replaceFileId,
          multiple,
        );
        recordsRef.current = nextRecords;
        attemptKeysRef.current.delete(item.key);
        controllersRef.current.delete(item.key);
        completePlansRef.current.delete(item.key);
        setAttempts((current) =>
          current.filter((currentItem) => currentItem.key !== item.key),
        );
        onChange(nextRecords);
        try {
          await onUploadComplete?.(ready);
        } catch (error) {
          onUploadError?.(toError(error), source);
        }
      } catch (error) {
        controllersRef.current.delete(item.key);
        attemptKeysRef.current.delete(item.key);
        const cancelled = controller.signal.aborted;
        const resolvedError = toError(error);
        const retainedPlan = isUncertainCompleteError(error)
          ? completePlan
          : undefined;
        if (retainedPlan) {
          completePlansRef.current.set(item.key, retainedPlan);
        } else {
          completePlansRef.current.delete(item.key);
        }
        updateAttempt(setAttempts, item.key, (current) => ({
          ...current,
          status: cancelled ? 'cancelled' : 'error',
          error: cancelled ? undefined : resolvedError,
          progress: undefined,
        }));
        if (!cancelled) onUploadError?.(resolvedError, source);
      }
    },
    [
      accept,
      maxBytes,
      messages,
      multiple,
      onChange,
      onUploadComplete,
      onUploadError,
      onUploadProgress,
      onUploadStart,
      path,
    ],
  );

  const queueFiles = useCallback(
    async (
      fileList: FileList | readonly File[],
      replaceFileId?: string,
    ): Promise<void> => {
      if (!canUpload) return;
      const selected = Array.from(fileList);
      const replaceTarget =
        replaceFileId ?? (!multiple ? recordsRef.current[0]?.id : undefined);
      const available = replaceTarget
        ? 1
        : getAvailableFileCount(
            multiple ? maxFiles : 1,
            recordsRef.current.length,
            additionCount,
            selected.length,
          );
      const additions = selected.slice(0, available).map((file) => ({
        key: createUploadKey(file),
        rawFile: file,
        displayName: file.name,
        status: 'queued' as const,
        ...(replaceTarget ? { replaceFileId: replaceTarget } : {}),
      }));
      if (!additions.length) return;

      additions.forEach((item) => attemptKeysRef.current.add(item.key));
      setAttempts((current) => {
        current
          .filter(
            (item) => item.status === 'error' || item.status === 'cancelled',
          )
          .forEach((item) => completePlansRef.current.delete(item.key));
        return [
          ...current.filter(
            (item) => item.status !== 'error' && item.status !== 'cancelled',
          ),
          ...additions,
        ];
      });
      for (const item of additions) await runUpload(item);
    },
    [additionCount, canUpload, maxFiles, multiple, runUpload],
  );

  const addFiles = useCallback(
    (fileList: FileList | readonly File[]) => queueFiles(fileList),
    [queueFiles],
  );

  const replaceFile = useCallback(
    (replaceFileId: string, file: File) => queueFiles([file], replaceFileId),
    [queueFiles],
  );

  const cancelItem = useCallback((key: string): void => {
    const controller = controllersRef.current.get(key);
    if (controller) {
      controller.abort();
      return;
    }
    attemptKeysRef.current.delete(key);
    completePlansRef.current.delete(key);
    updateAttempt(setAttempts, key, (item) => ({
      ...item,
      status: 'cancelled',
    }));
  }, []);

  const retryItem = useCallback(
    async (key: string): Promise<void> => {
      if (!canUpload) return;
      const item = attempts.find((current) => current.key === key);
      if (!item?.rawFile) return;
      attemptKeysRef.current.add(key);
      await runUpload(item);
    },
    [attempts, canUpload, runUpload],
  );

  const removeItem = useCallback(
    async (key: string): Promise<void> => {
      const item = items.find((current) => current.key === key);
      if (!item) return;
      if (item.status !== 'done' || !item.record) {
        controllersRef.current.get(key)?.abort();
        controllersRef.current.delete(key);
        attemptKeysRef.current.delete(key);
        completePlansRef.current.delete(key);
        setAttempts((current) => current.filter((entry) => entry.key !== key));
        return;
      }

      setOperationError(null);
      try {
        await appFileClient.request(
          `${path}/${encodeURIComponent(item.record.id)}`,
          {
            method: 'DELETE',
          },
        );
        const nextRecords = recordsRef.current.filter(
          (record) => record.id !== item.record?.id,
        );
        recordsRef.current = nextRecords;
        onChange(nextRecords);
      } catch (error) {
        setOperationError(toError(error));
      }
    },
    [items, onChange, path],
  );

  return {
    items,
    addFiles,
    replaceFile,
    removeItem,
    cancelItem,
    retryItem,
    operationError,
    canUpload,
    multiple,
    reachedLimit,
    uploadActive,
  };
}

function createUploadKey(file: File): string {
  uploadKeySeed += 1;
  return `${file.name}-${file.size}-${file.lastModified}-${uploadKeySeed}`;
}

function toReadyItem(record: StoredFile): FileUploadItem {
  return {
    key: record.id,
    displayName: record.name,
    status: 'done',
    record,
  };
}

function replaceRecord(
  current: StoredFile[],
  ready: StoredFile,
  replaceFileId: string | undefined,
  multiple: boolean,
): StoredFile[] {
  if (!multiple) return [ready];
  if (!replaceFileId) return [...current, ready];
  const index = current.findIndex((record) => record.id === replaceFileId);
  if (index < 0) return [...current, ready];
  return current.map((record, currentIndex) =>
    currentIndex === index ? ready : record,
  );
}

function getAvailableFileCount(
  limit: number | undefined,
  readyCount: number,
  pendingCount: number,
  selectedCount: number,
): number {
  if (limit === undefined) return selectedCount;
  return Math.max(
    0,
    Math.min(selectedCount, limit - readyCount - pendingCount),
  );
}

function assertCreatedUpload(value: CreateScopedFileResponse): void {
  if (
    !value ||
    value.file?.status !== 'pending' ||
    !value.file.id ||
    value.plan?.fileId !== value.file.id
  ) {
    throw new Error('The Scoped Files route returned an invalid upload plan.');
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isUncertainCompleteError(value: unknown): boolean {
  return (
    value instanceof FileClientError &&
    value.operation === 'complete' &&
    (value.status === 0 ||
      value.status >= 500 ||
      (value.status >= 200 && value.status < 300))
  );
}

function updateAttempt(
  setAttempts: Dispatch<SetStateAction<FileUploadItem[]>>,
  key: string,
  update: (item: FileUploadItem) => FileUploadItem,
): void {
  setAttempts((current) =>
    current.map((item) => (item.key === key ? update(item) : item)),
  );
}

function isActiveItem(item: FileUploadItem): boolean {
  return (
    item.status === 'queued' ||
    item.status === 'uploading' ||
    item.status === 'completing'
  );
}
