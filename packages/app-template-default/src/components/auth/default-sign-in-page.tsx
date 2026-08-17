import type { RenderAuthenticator } from "@nocobase/portal-sdk/auth";

import { AuthLayout } from "@/components/auth/auth-layout";
import { DynamicSignIn } from "@/components/auth/dynamic-sign-in";

type DefaultSignInPageProps = {
  renderAuthenticator?: RenderAuthenticator;
};

export function DefaultSignInPage({
  renderAuthenticator,
}: DefaultSignInPageProps) {
  return (
    <AuthLayout
      title="Welcome back"
      description="Choose a sign-in method configured in NocoBase."
    >
      <DynamicSignIn renderAuthenticator={renderAuthenticator} />
    </AuthLayout>
  );
}
