"use client";

import { useState } from "react";
import { useLink, useLogin } from "@refinedev/core";
import type { AuthenticatorComponentProps } from "@nocobase/portal-sdk/auth";

import { InputPassword } from "@/components/auth/input-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginVariables = {
  account: string;
  password: string;
  authenticator: string;
};

export function BasicSignInForm({
  authenticator,
}: AuthenticatorComponentProps) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const Link = useLink();
  const { mutate: login, isPending } = useLogin<LoginVariables>();
  const allowSignUp = authenticator.options?.allowSignUp === true;
  const enableResetPassword =
    authenticator.options?.enableResetPassword === true;

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login({ account, password, authenticator: authenticator.name });
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-account`}>
          Username or email
        </Label>
        <Input
          id={`${authenticator.name}-account`}
          type="text"
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-password`}>Password</Label>
        <InputPassword
          id={`${authenticator.name}-password`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isPending}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </Button>

      {(allowSignUp || enableResetPassword) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {enableResetPassword ? (
            <Link
              to={`/forgot-password?name=${encodeURIComponent(
                authenticator.name
              )}`}
              className="transition-colors hover:text-foreground hover:underline hover:underline-offset-4"
            >
              Forgot password?
            </Link>
          ) : (
            <span />
          )}
          {allowSignUp && (
            <span>
              No account?{" "}
              <Link
                to={`/register?name=${encodeURIComponent(authenticator.name)}`}
                className="font-semibold text-foreground underline underline-offset-4"
              >
                Sign up
              </Link>
            </span>
          )}
        </div>
      )}
    </form>
  );
}

BasicSignInForm.displayName = "BasicSignInForm";
