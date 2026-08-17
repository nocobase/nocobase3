import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  allowsMultipleFiles,
  normalizeFileFieldValue,
  toFileFieldValue,
} from "./form-value";
import { uploadDirect } from "./upload-direct";
import { uploadMultipart } from "./upload-multipart";
import {
  getAvailableFileCount,
  resolveFileUploadMode,
} from "./upload-strategy";
import { checkFileStorage } from "./use-file-storage";
import {
  validateFileBeforeUpload,
  validateFileForField,
} from "./validation";
import type {
  FileFieldDescriptor,
  FileStorageInfo,
  FileUploadFieldValue,
  FileUploadHandler,
  FileUploadItem,
  FileUploadMessages,
  FileUploadMode,
  NocoBaseFileRecord,
} from "./types";

export type UseFileUploadOptions = {
  descriptor: FileFieldDescriptor;
  value: FileUploadFieldValue;
  onChange: (value: FileUploadFieldValue) => void;
  disabled?: boolean;
  readOnly?: boolean;
  maxFiles?: number;
  uploadMode?: FileUploadMode;
  uploadFile?: FileUploadHandler;
  messages: FileUploadMessages;
  onUploadStart?: (file: File) => void;
  onUploadComplete?: (record: NocoBaseFileRecord, file: File) => void;
  onUploadError?: (error: Error, file: File) => void;
};

let uploadKeySeed = 0;

const createUploadKey = () => {
  uploadKeySeed += 1;
  return `${Date.now()}-${uploadKeySeed}-${Math.random()
    .toString(36)
    .slice(2)}`;
};

const getFileKey = (file: File) =>
  `${file.name}-${file.size}-${file.lastModified}-${createUploadKey()}`;

const isInProgress = (item: FileUploadItem) =>
  item.status === "pending" ||
  item.status === "checking" ||
  item.status === "uploading";

function toError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

async function uploadOne(
  file: File,
  descriptor: FileFieldDescriptor,
  storage: FileStorageInfo,
  signal: AbortSignal,
  messages: FileUploadMessages,
  uploadMode: FileUploadMode
) {
  const options = { file, descriptor, storage, signal };

  return resolveFileUploadMode(storage, uploadMode) === "direct"
    ? uploadDirect(options, messages)
    : uploadMultipart(options);
}

export function useFileUpload({
  descriptor,
  value,
  onChange,
  disabled,
  readOnly,
  maxFiles,
  uploadMode = "auto",
  uploadFile,
  messages,
  onUploadStart,
  onUploadComplete,
  onUploadError,
}: UseFileUploadOptions) {
  const recordsRef = useRef(normalizeFileFieldValue(value));
  const controllersRef = useRef(new Map<string, AbortController>());
  const reservationsRef = useRef(new Set<string>());
  const [storageError, setStorageError] = useState<Error | null>(null);
  const [items, setItems] = useState<FileUploadItem[]>(() =>
    recordsRef.current.map((record) => ({
      key: String(record.id),
      displayName: record.title || record.filename,
      status: "done",
      record,
    }))
  );
  const canUpload = !disabled && !readOnly;
  const multiple = allowsMultipleFiles(descriptor);

  useEffect(() => {
    const records = normalizeFileFieldValue(value);
    recordsRef.current = records;
    setItems((current) => {
      const localItems = current.filter(
        (item) =>
          isInProgress(item) ||
          item.status === "error" ||
          item.status === "cancelled"
      );
      const localKeys = new Set(localItems.map((item) => item.key));
      return [
        ...records
          .filter((record) => !localKeys.has(String(record.id)))
          .map((record) => ({
            key: String(record.id),
            displayName: record.title || record.filename,
            status: "done" as const,
            record,
          })),
        ...localItems,
      ];
    });
  }, [value]);

  useEffect(
    () => () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
      reservationsRef.current.clear();
    },
    []
  );

  const limit = useMemo(() => (multiple ? maxFiles : 1), [maxFiles, multiple]);
  const reachedLimit =
    limit !== undefined &&
    recordsRef.current.length + reservationsRef.current.size >= limit;

  const removeItem = useCallback(
    (key: string) => {
      controllersRef.current.get(key)?.abort();
      controllersRef.current.delete(key);
      reservationsRef.current.delete(key);
      setItems((current) => current.filter((item) => item.key !== key));

      const nextRecords = recordsRef.current.filter(
        (record) => String(record.id) !== key
      );
      recordsRef.current = nextRecords;
      onChange(toFileFieldValue(descriptor, nextRecords));
    },
    [descriptor, onChange]
  );

  const cancelItem = useCallback((key: string) => {
    const controller = controllersRef.current.get(key);
    if (!controller) return;
    controller.abort();
    controllersRef.current.delete(key);
    reservationsRef.current.delete(key);
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, status: "cancelled" } : item
      )
    );
  }, []);

  const runUpload = useCallback(
    async (item: FileUploadItem) => {
      // A queued item may have been removed while an earlier file was uploading.
      if (!item.rawFile || !reservationsRef.current.has(item.key)) return;

      const file = item.rawFile;
      const controller = new AbortController();
      controllersRef.current.set(item.key, controller);
      setStorageError(null);

      try {
        let record: NocoBaseFileRecord;

        if (uploadFile) {
          const validation = validateFileForField(file, descriptor, messages);
          if (!validation.valid) throw new Error(validation.message);

          setItems((current) =>
            current.map((currentItem) =>
              currentItem.key === item.key
                ? { ...currentItem, status: "uploading", error: undefined }
                : currentItem
            )
          );
          onUploadStart?.(file);
          record = await uploadFile({
            file,
            descriptor,
            signal: controller.signal,
          });
        } else {
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.key === item.key
                ? { ...currentItem, status: "checking", error: undefined }
                : currentItem
            )
          );
          let storage: FileStorageInfo;
          try {
            const storageResult = await checkFileStorage(descriptor, {
              signal: controller.signal,
            });
            if (
              !storageResult?.isSupportToUploadFiles ||
              !storageResult.storage
            ) {
              throw new Error(messages.storageUnsupported);
            }
            storage = storageResult.storage;
          } catch (caught) {
            if (!controller.signal.aborted) setStorageError(toError(caught));
            throw caught;
          }

          const validation = validateFileBeforeUpload(
            file,
            descriptor,
            storage,
            messages
          );
          if (!validation.valid) throw new Error(validation.message);

          setItems((current) =>
            current.map((currentItem) =>
              currentItem.key === item.key
                ? { ...currentItem, status: "uploading", error: undefined }
                : currentItem
            )
          );
          onUploadStart?.(file);
          record = await uploadOne(
            file,
            descriptor,
            storage,
            controller.signal,
            messages,
            uploadMode
          );
        }

        if (controller.signal.aborted) return;

        controllersRef.current.delete(item.key);
        reservationsRef.current.delete(item.key);
        recordsRef.current = multiple
          ? [...recordsRef.current, record]
          : [record];
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.key === item.key
              ? {
                  ...currentItem,
                  key: String(record.id),
                  status: "done",
                  record,
                  displayName: record.title || record.filename,
                  rawFile: undefined,
                }
              : currentItem
          )
        );
        onChange(toFileFieldValue(descriptor, recordsRef.current));
        onUploadComplete?.(record, file);
      } catch (caught) {
        controllersRef.current.delete(item.key);
        reservationsRef.current.delete(item.key);
        const error = toError(caught);
        const cancelled = controller.signal.aborted;
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.key === item.key
              ? {
                  ...currentItem,
                  status: cancelled ? "cancelled" : "error",
                  error: cancelled ? undefined : error,
                }
              : currentItem
          )
        );
        if (!cancelled) onUploadError?.(error, file);
      }
    },
    [
      descriptor,
      messages,
      multiple,
      onChange,
      onUploadComplete,
      onUploadError,
      onUploadStart,
      uploadFile,
      uploadMode,
    ]
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!canUpload) return;

      const selected = Array.from(fileList);
      const available = getAvailableFileCount(
        limit,
        recordsRef.current.length,
        reservationsRef.current.size,
        selected.length
      );
      const additions = selected.slice(0, available).map((file) => ({
        key: getFileKey(file),
        rawFile: file,
        displayName: file.name,
        showStatus: true,
        status: "pending" as const,
      }));
      if (!additions.length) return;

      additions.forEach((item) => reservationsRef.current.add(item.key));
      setItems((current) =>
        multiple
          ? [...current, ...additions]
          : current.filter((entry) => entry.status !== "done").concat(additions)
      );

      for (const item of additions) await runUpload(item);
    },
    [canUpload, limit, multiple, runUpload]
  );

  const retryItem = useCallback(
    async (key: string) => {
      if (!canUpload) return;
      const item = items.find((current) => current.key === key);
      if (!item?.rawFile) return;

      const available = getAvailableFileCount(
        limit,
        recordsRef.current.length,
        reservationsRef.current.size,
        1
      );
      if (!available) return;
      reservationsRef.current.add(key);
      await runUpload(item);
    },
    [canUpload, items, limit, runUpload]
  );

  return {
    items,
    addFiles,
    removeItem,
    cancelItem,
    retryItem,
    storageError,
    canUpload,
    multiple,
    reachedLimit,
  };
}
