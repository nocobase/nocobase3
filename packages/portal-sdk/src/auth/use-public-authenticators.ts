import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { nocobaseClient } from "../client/index.ts";
import type { Authenticator } from "./types.ts";

export const publicAuthenticatorsQueryKey = [
  "nocobase",
  "public-authenticators",
] as const;

export function usePublicAuthenticators(): UseQueryResult<Authenticator[], Error> {
  return useQuery({
    queryKey: publicAuthenticatorsQueryKey,
    queryFn: ({ signal }) =>
      nocobaseClient.action<Authenticator[]>("authenticators", "publicList", {
        method: "GET",
        signal,
        authenticator: null,
        includeRole: false,
        withAclMeta: false,
      }),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
}
