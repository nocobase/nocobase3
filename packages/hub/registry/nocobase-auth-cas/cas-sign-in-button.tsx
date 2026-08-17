import { LogIn } from "lucide-react";

import type { AuthenticatorComponentProps } from "@nocobase/portal-sdk/auth";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

import { useCasSignIn } from "./use-cas-sign-in";

export default function CasSignInButton({
  authenticator,
  onSignIn,
}: AuthenticatorComponentProps & { onSignIn?: () => void }) {
  const { signIn, error } = useCasSignIn(authenticator);

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>CAS sign-in failed</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onSignIn ?? signIn}
      >
        <LogIn />
        {resolveTranslatableText(
          authenticator.title || authenticator.authTypeTitle || "CAS"
        )}
      </Button>
    </div>
  );
}
