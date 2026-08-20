"use client";

import { useState } from "react";
import { useLink, useNotification, useRegister } from "@refinedev/core";

import { AuthLayout } from "@/extensions/email-password/auth-layout";
import { InputPassword } from "@/extensions/email-password/input-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignUpVariables = {
  name: string;
  username: string;
  email: string;
  password: string;
};

export function SignUpForm() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const Link = useLink();
  const { open } = useNotification();
  const { mutate: register, isPending } = useRegister<SignUpVariables>();

  const handleSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) {
      open?.({ type: "error", message: "Passwords don't match" });
      return;
    }
    register({ name, username, email, password });
  };

  return (
    <AuthLayout
      title="Create an account"
      description="Register with your email and password."
      footer={<Link to="/login" className="hover:underline">Already have an account? Sign in</Link>}
    >
      <form onSubmit={handleSignUp} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <Input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="register-password">Password</Label>
          <InputPassword id="register-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <InputPassword id="confirm-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
