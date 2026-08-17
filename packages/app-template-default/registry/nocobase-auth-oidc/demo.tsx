import { AuthMethodDemo } from "@/components/auth/demo";
import OidcSignInButton from "./oidc-sign-in-button";

const authenticator = {
  name: "company-oidc",
  authType: "OIDC",
  title: "Company OIDC",
};

export function OidcAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="OIDC"
      methodName="OpenID Connect"
      description="Redirect users to an OpenID Connect provider while the Starter handles callback tokens and the active authenticator."
    >
      <OidcSignInButton authenticator={authenticator} onSignIn={() => {}} />
    </AuthMethodDemo>
  );
}
