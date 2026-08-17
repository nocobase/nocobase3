"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useForgotPassword, useLink } from "@refinedev/core";
import { useSearchParams } from "react-router";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState("");
  const Link = useLink();
  const [searchParams] = useSearchParams();
  const { mutate: forgotPassword, isPending } = useForgotPassword();

  const handleForgotPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    forgotPassword({
      email,
      authenticator: searchParams.get("name") ?? undefined,
    });
  };

  return (
    <AuthLayout
      title="Forgot password"
      description="Enter your email to reset your password."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleForgotPassword} className="space-y-5">
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
        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
};

ForgotPasswordForm.displayName = "ForgotPasswordForm";
