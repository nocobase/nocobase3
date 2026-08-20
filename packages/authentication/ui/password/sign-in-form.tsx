"use client";

import { useState } from "react";
import { useLink, useLogin } from "@refinedev/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordSignInForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const Link = useLink();
  const { mutate: login, isPending } = useLogin();

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        login({ identifier, password });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="identifier">Username or email</Label>
        <Input
          id="identifier"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/register">Sign up</Link>
      </div>
    </form>
  );
}
