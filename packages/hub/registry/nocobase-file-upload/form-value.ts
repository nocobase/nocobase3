import type {
  FileFieldDescriptor,
  FileRelationType,
  FileUploadFieldValue,
  NocoBaseFileRecord,
  SerializedFileFieldValue,
} from "./types";

export function isMultipleFileRelation(relation: FileRelationType) {
  return (
    relation === "belongsToMany" ||
    relation === "hasMany" ||
    relation === "belongsToArray"
  );
}

export function allowsMultipleFiles(
  descriptor: Pick<FileFieldDescriptor, "relation">
) {
  return isMultipleFileRelation(descriptor.relation);
}

export function normalizeFileFieldValue(value: FileUploadFieldValue) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function serializeFileFieldValue(
  descriptor: FileFieldDescriptor,
  value: FileUploadFieldValue
): SerializedFileFieldValue {
  const references = normalizeFileFieldValue(value).map((record) => ({
    id: record.id,
  }));

  if (
    descriptor.relation === "belongsTo" ||
    descriptor.relation === "hasOne"
  ) {
    return references[0] ?? null;
  }

  return references;
}

export function serializeFileFieldValues<
  TValues extends Record<string, unknown>
>(values: TValues, descriptors: FileFieldDescriptor[]) {
  const payload: Record<string, unknown> = { ...values };

  for (const descriptor of descriptors) {
    payload[descriptor.fieldName] = serializeFileFieldValue(
      descriptor,
      values[descriptor.fieldName] as FileUploadFieldValue
    );
  }

  return payload;
}

export function getFileFieldAppends(descriptors: FileFieldDescriptor[]) {
  return descriptors.map((descriptor) => descriptor.fieldName);
}

export function toFileFieldValue(
  descriptor: Pick<FileFieldDescriptor, "relation">,
  records: NocoBaseFileRecord[]
): FileUploadFieldValue {
  return allowsMultipleFiles(descriptor) ? records : records[0] ?? null;
}
