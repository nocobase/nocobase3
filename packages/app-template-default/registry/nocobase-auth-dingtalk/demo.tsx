import { AuthMethodDemo } from "@/components/auth/demo";
import DingtalkSignInButton from "./dingtalk-sign-in-button";

const authenticator = {
  name: "company-dingtalk",
  authType: "dingtalk",
  title: "Sign in via DingTalk",
};

export function DingtalkAuthDemoPage() {
  return (
    <AuthMethodDemo
      authType="dingtalk"
      methodName="DingTalk"
      description="Provide DingTalk OAuth login and support internal micro-app automatic login through DingTalk JSAPI."
    >
      <DingtalkSignInButton
        authenticator={authenticator}
        onSignIn={() => {}}
      />
    </AuthMethodDemo>
  );
}
