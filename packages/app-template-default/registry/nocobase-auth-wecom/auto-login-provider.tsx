import type { PropsWithChildren } from "react";

import { AuthAutoRedirectProvider } from "@/components/auth";

import { isWecomBrowser } from "./use-wecom-sign-in";

export default function WecomAutoLoginProvider({
  children,
}: PropsWithChildren) {
  const insideWecom = isWecomBrowser();
  return (
    <AuthAutoRedirectProvider
      resource="wecom"
      action="checkLogin"
      enabled={insideWecom}
      query={{ isWeComBrowser: insideWecom }}
    >
      {children}
    </AuthAutoRedirectProvider>
  );
}
