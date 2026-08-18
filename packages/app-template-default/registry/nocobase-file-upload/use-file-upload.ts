import { useCallback, useEffect, useRef, useState } from "react";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { createFilesClient, type FilesClient } from "@nocobase/portal-sdk/files";
import type { FileObject, FileUploadItem, FileUploadProps } from "./types";

export const defaultFilesClient = createFilesClient({ client: nocobaseClient });
const key = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function useFileUpload({
  policy,
  context,
  value = [],
  onChange,
  multiple = true,
  maxFiles,
  disabled,
  accept,
  maxSize,
  deleteOnRemove = false,
  client = defaultFilesClient,
  onUploadStart,
  onUploadComplete,
  onUploadError,
}: FileUploadProps) {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; controllers.current.forEach((controller) => controller.abort()); }, []);
  const update = useCallback((next: FileObject[]) => onChange?.(next), [onChange]);
  const addFiles = useCallback(async (selected: FileList | File[], retryKey?: string) => {
    if (disabled) return;
    const available = maxFiles === undefined ? selected.length : Math.max(0, maxFiles - value.length);
    const files = Array.from(selected).slice(0, multiple ? available : Math.min(1, available));
    await Promise.all(files.map(async (file) => {
      const uploadKey = retryKey ?? key();
      const controller = new AbortController();
      controllers.current.set(uploadKey, controller);
      const item: FileUploadItem = { key: uploadKey, file, status: "preparing" };
      if (mounted.current) setItems((current) => [...current, item]);
      try {
        const config = await client.getConfig({ signal: controller.signal });
        const selectedPolicy = policy ?? config.defaultPolicy;
        const serverPolicy = config.policies[selectedPolicy];
        if (!serverPolicy) throw new Error(`Unknown files policy: ${selectedPolicy}`);
        if (maxSize !== undefined && file.size > maxSize) throw new Error("File exceeds the configured size limit");
        if (serverPolicy.maxSize !== undefined && file.size > serverPolicy.maxSize) throw new Error("File exceeds the policy size limit");
        if (accept?.length && file.type && !accept.some((pattern) => pattern === file.type || (pattern.endsWith("/*") && file.type.startsWith(pattern.slice(0, -1))))) throw new Error("File type is not allowed");
        onUploadStart?.(file);
        if (mounted.current) setItems((current) => current.map((entry) => entry.key === uploadKey ? { ...entry, status: "uploading" } : entry));
        const record = await client.upload(file, { policy: selectedPolicy, context, originalName: file.name, contentType: file.type || undefined, signal: controller.signal, idempotencyKey: uploadKey });
        if (!mounted.current) return;
        setItems((current) => current.map((entry) => entry.key === uploadKey ? { ...entry, status: "success", record } : entry));
        update(multiple ? [...value, record] : [record]);
        onUploadComplete?.(record);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (!mounted.current) return;
        setItems((current) => current.map((entry) => entry.key === uploadKey ? { ...entry, status: failure.name === "AbortError" ? "aborted" : "error", error: failure } : entry));
        onUploadError?.(failure, file);
      } finally { controllers.current.delete(uploadKey); }
    }));
  }, [accept, client, context, disabled, maxFiles, maxSize, multiple, onChange, onUploadComplete, onUploadError, onUploadStart, policy, update, value]);
  const retry = useCallback((uploadKey: string) => {
    const item = items.find((entry) => entry.key === uploadKey && entry.status === "error");
    return item ? addFiles([item.file], uploadKey) : Promise.resolve();
  }, [addFiles, items]);
  const remove = useCallback(async (id: string, shouldDelete = deleteOnRemove) => {
    const record = value.find((file) => String(file.id) === id);
    if (shouldDelete && record) await client.remove(String(record.id));
    update(value.filter((file) => String(file.id) !== id));
    setItems((current) => current.filter((item) => item.record && String(item.record.id) !== id));
  }, [client, deleteOnRemove, update, value]);
  const abort = useCallback((uploadKey: string) => controllers.current.get(uploadKey)?.abort(), []);
  return { items, addFiles, retry, remove, abort, multiple, reachedLimit: maxFiles !== undefined && value.length >= maxFiles };
}
