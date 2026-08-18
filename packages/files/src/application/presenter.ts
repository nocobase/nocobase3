import type { FileObject } from "../contracts/index.ts";
import type { FileRecord } from "../persistence/index.ts";

export function presentFile(file: FileRecord): FileObject {
  return {
    id: file.id,
    policy: file.policy,
    originalName: file.originalName,
    contentType: file.contentType,
    size: file.size,
    ...(file.checksumSha256 ? { checksum: { algorithm: "sha256" as const, value: file.checksumSha256 } } : {}),
    status: file.status,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}
