import { AuthMethodDemo } from "@/components/auth/demo";
import SamlSignInButton from "./saml-sign-in-button";

const authenticator = {
  name: "company-saml",
  authType: "SAML",
  title: "Company SAML",
};

export function SamlAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="SAML"
      methodName="SAML"
      description="Start an identity-provider redirect and return through the Starter's shared authentication callback."
    >
      <SamlSignInButton authenticator={authenticator} onSignIn={() => {}} />
    </AuthMethodDemo>
  );
}
