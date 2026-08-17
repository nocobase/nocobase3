import { AuthMethodDemo } from "@/components/auth/demo";
import CasSignInButton from "./cas-sign-in-button";

const authenticator = {
  name: "company-cas",
  authType: "CAS",
  title: "Company CAS",
};

export function CasAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="CAS"
      methodName="Central Authentication Service"
      description="Redirect users to a CAS server and capture the returned NocoBase token without coupling the page UI to CAS."
    >
      <CasSignInButton authenticator={authenticator} onSignIn={() => {}} />
    </AuthMethodDemo>
  );
}
