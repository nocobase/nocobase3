"use client";

import { useState } from "react";
import { useLink, useLogin } from "@refinedev/core";

import { InputPassword } from "@/extensions/email-password/input-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginVariables = {
  email: string;
  password: string;
};

export function BasicSignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const Link = useLink();
  const { mutate: login, isPending } = useLogin<LoginVariables>();

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login({ email, password });
  };

  return (
    <form onSubmit={handleSignIn} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <InputPassword
          id="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <Link to="/forgot-password" className="hover:text-foreground hover:underline">
          Forgot password?
        </Link>
        <Link to="/register" className="font-semibold text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </div>
    </form>
  );
}

BasicSignInForm.displayName = "BasicSignInForm";
