import type { JsonObject } from "./contracts/index.ts";
import type { Kysely } from "kysely";
import type { FilesDatabase } from "./persistence/database-types.ts";

export interface ActorContext { id: string; [key: string]: unknown }
export type FileAction = "files.upload" | "files.read" | "files.delete";
export interface FileRecordForAuthorization { id: string; policy: string; [key: string]: unknown }
export interface FileAuthorizationInput { action: FileAction; actor: ActorContext; workspaceId: string; policy: string; context?: JsonObject; file?: FileRecordForAuthorization }
export interface FileRequestContextResolver { getActor(context: unknown): Promise<ActorContext> | ActorContext; getWorkspaceId(context: unknown): Promise<string> | string }
export interface FileAuthorizer { authorize(input: FileAuthorizationInput): Promise<void> }
export interface FilesModuleOptions { db: Kysely<FilesDatabase>; config: unknown; requestContext: FileRequestContextResolver; authorizer: FileAuthorizer; drivers: Record<string, unknown>; now?: () => Date; generateId?: () => string }
