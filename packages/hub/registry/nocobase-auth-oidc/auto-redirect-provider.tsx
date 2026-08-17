import type { PropsWithChildren } from "react";

import { AuthAutoRedirectProvider } from "@/components/auth";

export default function OidcAutoRedirectProvider({
  children,
}: PropsWithChildren) {
  return (
    <AuthAutoRedirectProvider resource="oidc" action="checkRedirect">
      {children}
    </AuthAutoRedirectProvider>
  );
}
