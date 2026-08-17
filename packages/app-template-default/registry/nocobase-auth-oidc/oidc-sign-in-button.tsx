import { LogIn } from "lucide-react";

import type { AuthenticatorComponentProps } from "@nocobase/portal-sdk/auth";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

import { useOidcSignIn } from "./use-oidc-sign-in";

export default function OidcSignInButton({
  authenticator,
  onSignIn,
}: AuthenticatorComponentProps & { onSignIn?: () => void }) {
  const { signIn, isPending, error } = useOidcSignIn(authenticator);

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>OIDC sign-in failed</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={!onSignIn && isPending}
        onClick={onSignIn ?? signIn}
      >
        <LogIn />
        {!onSignIn && isPending
          ? "Redirecting…"
          : resolveTranslatableText(
              authenticator.title || authenticator.authTypeTitle || "OIDC"
            )}
      </Button>
    </div>
  );
}
