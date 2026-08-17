import { useState } from "react";

import { InputPassword } from "@/components/auth/input-password";
import type { AuthenticatorComponentProps } from "@nocobase/portal-sdk/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useLdapSignIn } from "./use-ldap-sign-in";

export default function LdapSignInForm({
  authenticator,
  onSignIn,
}: AuthenticatorComponentProps & {
  onSignIn?: (values: { account: string; password: string }) => void;
}) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, isPending } = useLdapSignIn(authenticator.name);
  const autoSignup = authenticator.options?.autoSignup === true;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (onSignIn) {
          onSignIn({ account, password });
          return;
        }
        void signIn({ account, password });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-ldap-account`}>Account</Label>
        <Input
          id={`${authenticator.name}-ldap-account`}
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-ldap-password`}>Password</Label>
        <InputPassword
          id={`${authenticator.name}-ldap-password`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={!onSignIn && isPending}
      >
        {!onSignIn && isPending ? "Signing in…" : "Sign in"}
      </Button>
      {autoSignup && (
        <p className="text-xs leading-5 text-muted-foreground">
          An account will be created automatically after the first successful
          LDAP sign-in.
        </p>
      )}
    </form>
  );
}
