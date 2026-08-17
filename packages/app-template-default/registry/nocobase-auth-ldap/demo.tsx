import { AuthMethodDemo } from "@/components/auth/demo";
import LdapSignInForm from "./ldap-sign-in-form";

const authenticator = {
  name: "company-ldap",
  authType: "LDAP",
  title: "Company directory",
  options: { autoSignup: true },
};

export function LdapAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="LDAP"
      methodName="LDAP directory"
      description="Use the familiar account and password form while sending credentials through the selected LDAP authenticator."
    >
      <LdapSignInForm authenticator={authenticator} onSignIn={() => {}} />
    </AuthMethodDemo>
  );
}
