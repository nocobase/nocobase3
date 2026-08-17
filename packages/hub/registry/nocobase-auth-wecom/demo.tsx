import { AuthMethodDemo } from "@/components/auth/demo";
import WecomSignInButton from "./wecom-sign-in-button";

const authenticator = {
  name: "company-wecom",
  authType: "wecom",
  title: "Sign in via WeCom",
  options: {
    btnTooltip: "Use the account associated with your company directory.",
  },
};

export function WecomAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="wecom"
      methodName="WeCom"
      description="Provide a WeCom sign-in button and support automatic login when the application is opened inside WeCom."
    >
      <WecomSignInButton authenticator={authenticator} onSignIn={() => {}} />
    </AuthMethodDemo>
  );
}
