import type { PropsWithChildren } from "react";

import { AuthAutoRedirectProvider } from "@/components/auth";

export default function SamlAutoRedirectProvider({
  children,
}: PropsWithChildren) {
  return (
    <AuthAutoRedirectProvider resource="saml" action="checkRedirect">
      {children}
    </AuthAutoRedirectProvider>
  );
}
