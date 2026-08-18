import { useQuery } from "@tanstack/react-query";
import { defaultFilesClient } from "./use-file-upload";
import type { FilesClient } from "@nocobase/portal-sdk/files";

export function useFileConfig(client: FilesClient = defaultFilesClient) {
  return useQuery({ queryKey: ["files", "config"], queryFn: ({ signal }) => client.getConfig({ signal }), staleTime: 5 * 60 * 1000 });
}
