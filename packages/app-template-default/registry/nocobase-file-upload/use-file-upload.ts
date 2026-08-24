import { executeFileUploadPlan } from '@nocobase/app-plugin-files/client';
import { nocobaseClient } from '@nocobase/portal-sdk/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { normalizeFileBasePath } from './base-path';
import { validateFile } from './validation';
import type {
  CreateScopedFileResponse,
  FileUploadItem,
  FileUploadMessages,
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
  const attemptsRef = useRef(new Map<string, string | undefined>());
  const [operationError, setOperationError] = useState<Error | null>(null);
  const [items, setItems] = useState<FileUploadItem[]>(() =>
    controlledValue.map(toReadyItem),
  );
  const canUpload = !disabled && !readOnly;
  const activeCount = attemptsRef.current.size;
  const additionCount = Array.from(attemptsRef.current.values()).filter(
    (replaceFileId) => replaceFileId === undefined,
  ).length;
  const reachedLimit =
    multiple &&
    maxFiles !== undefined &&
    recordsRef.current.length + additionCount >= maxFiles;

  useEffect(() => {
    recordsRef.current = controlledValue;
    setItems((current) => {
      const next = [
        ...controlledValue.map(toReadyItem),
        ...current.filter((item) => item.status !== 'done'),
      ];
      return hasSameItems(current, next) ? current : next;
    });
  }, [controlledValue]);

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      attemptsRef.current.clear();
    },
    [],
  );

  const updateAttempt = useCallback(
    (key: string, update: (item: FileUploadItem) => FileUploadItem) => {
      setItems((current) =>
        current.map((item) => (item.key === key ? update(item) : item)),
      );
    },
    [],
  );

  const runUpload = useCallback(
    async (item: FileUploadItem): Promise<void> => {
      if (!item.rawFile || !attemptsRef.current.has(item.key)) return;
      const source = item.rawFile;
      const controller = new AbortController();
      controllersRef.current.set(item.key, controller);
      setOperationError(null);

      try {
        const validation = validateFile(source, {
          maxBytes,
          accept,
          messages,
        });
        if (!validation.valid) throw new Error(validation.message);

        onUploadStart?.(source);
        updateAttempt(item.key, (current) => ({
          ...current,
          status: 'uploading',
          error: undefined,
          progress: { loaded: 0, total: source.size, percentage: 0 },
        }));
        const created = await nocobaseClient.request<CreateScopedFileResponse>(
          path,
          {
            method: 'POST',
            body: {
              name: source.name,
              size: source.size,
              ...(source.type ? { contentType: source.type } : {}),
              ...(item.replaceFileId
                ? { replaceFileId: item.replaceFileId }
                : {}),
            },
            signal: controller.signal,
          },
        );
        assertCreatedUpload(created);
        const ready = await executeFileUploadPlan(created.plan, source, {
          signal: controller.signal,
          onProgress: (progress) => {
            updateAttempt(item.key, (current) => ({
              ...current,
              status: progress.percentage >= 100 ? 'completing' : 'uploading',
              progress,
            }));
            onUploadProgress?.(progress, source);
          },
        });
        if (controller.signal.aborted) return;

        const nextRecords = replaceRecord(
          recordsRef.current,
          ready,
          item.replaceFileId,
          multiple,
        );
        recordsRef.current = nextRecords;
        attemptsRef.current.delete(item.key);
        controllersRef.current.delete(item.key);
        setItems((current) => [
          ...current.filter(
            (currentItem) =>
              currentItem.key !== item.key &&
              currentItem.record?.id !== item.replaceFileId,
          ),
          toReadyItem(ready),
        ]);
        onChange(nextRecords);
        try {
          await onUploadComplete?.(ready);
        } catch (error) {
          onUploadError?.(toError(error), source);
        }
      } catch (error) {
        controllersRef.current.delete(item.key);
        attemptsRef.current.delete(item.key);
        const cancelled = controller.signal.aborted;
        const resolvedError = toError(error);
        updateAttempt(item.key, (current) => ({
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
      updateAttempt,
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

      additions.forEach((item) =>
        attemptsRef.current.set(item.key, item.replaceFileId),
      );
      setItems((current) => [
        ...current.filter(
          (item) =>
            item.status === 'done' ||
            (item.status !== 'error' && item.status !== 'cancelled'),
        ),
        ...additions,
      ]);
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

  const cancelItem = useCallback(
    (key: string): void => {
      const controller = controllersRef.current.get(key);
      if (controller) {
        controller.abort();
        return;
      }
      attemptsRef.current.delete(key);
      updateAttempt(key, (item) => ({ ...item, status: 'cancelled' }));
    },
    [updateAttempt],
  );

  const retryItem = useCallback(
    async (key: string): Promise<void> => {
      if (!canUpload) return;
      const item = items.find((current) => current.key === key);
      if (!item?.rawFile) return;
      attemptsRef.current.set(key, item.replaceFileId);
      await runUpload(item);
    },
    [canUpload, items, runUpload],
  );

  const removeItem = useCallback(
    async (key: string): Promise<void> => {
      const item = items.find((current) => current.key === key);
      if (!item) return;
      if (item.status !== 'done' || !item.record) {
        controllersRef.current.get(key)?.abort();
        controllersRef.current.delete(key);
        attemptsRef.current.delete(key);
        setItems((current) => current.filter((entry) => entry.key !== key));
        return;
      }

      setOperationError(null);
      try {
        await nocobaseClient.request(
          `${path}/${encodeURIComponent(item.record.id)}`,
          { method: 'DELETE', unwrap: 'none' },
        );
        const nextRecords = recordsRef.current.filter(
          (record) => record.id !== item.record?.id,
        );
        recordsRef.current = nextRecords;
        setItems((current) => current.filter((entry) => entry.key !== key));
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
    uploadActive: activeCount > 0,
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

function hasSameItems(
  current: readonly FileUploadItem[],
  next: readonly FileUploadItem[],
): boolean {
  return (
    current.length === next.length &&
    current.every((item, index) => {
      const candidate = next[index];
      return (
        candidate !== undefined &&
        item.key === candidate.key &&
        item.status === candidate.status &&
        item.record?.updatedAt === candidate.record?.updatedAt &&
        item.rawFile === candidate.rawFile &&
        item.error === candidate.error &&
        item.progress === candidate.progress
      );
    })
  );
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
