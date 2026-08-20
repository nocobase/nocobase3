import { AuthLayout } from "@/extensions/email-password/auth-layout";
import { BasicSignInForm } from "@/extensions/email-password/basic-sign-in-form";

export function DefaultSignInPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in with your email and password."
    >
      <BasicSignInForm />
    </AuthLayout>
  );
}
