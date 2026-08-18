import type { ActorContext, FileAuthorizer, FileRequestContextResolver, FileAuthorizationInput } from "../module-types.ts";
import type { FileAccessContext } from "../contracts/common.ts";
import { FilesError } from "../errors/index.ts";
export type HonoContextLike = { req?: unknown; [key: string]: unknown };
export async function resolveFilesRequestContext<T>(context: T, resolver: FileRequestContextResolver) {
  const actor = await resolver.getActor(context); const workspaceId = await resolver.getWorkspaceId(context);
  if (!actor?.id?.trim() || !workspaceId?.trim()) throw new FilesError("FILES_FORBIDDEN", "Authentication required");
  return { actor, workspaceId };
}
export async function authorizeFileAction(authorizer: FileAuthorizer, input: Omit<FileAuthorizationInput, "actor" | "workspaceId"> & { context?: FileAccessContext }, request: { actor: ActorContext; workspaceId: string }) {
  try { await authorizer.authorize({ ...input, ...request }); } catch (error) { if (error instanceof FilesError && error.code === "FILES_FORBIDDEN") throw error; throw new FilesError("FILES_FORBIDDEN", "Forbidden", { cause: error }); }
}
