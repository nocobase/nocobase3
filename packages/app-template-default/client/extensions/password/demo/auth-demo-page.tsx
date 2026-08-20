import { useState } from "react";
import { Building2, MessageSquare, ShieldCheck } from "lucide-react";

import { BrandLogo } from "@/components/app-shell/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AuthDemoPromptGenerator,
  type AuthIntegrationPattern,
} from "./auth-demo-prompt-generator";

const scenarioCopy: Record<
  AuthIntegrationPattern,
  { title: string; description: string }
> = {
  dynamic: {
    title: "Default dynamic login",
    description:
      "Enabled authenticators are discovered from NocoBase and arranged exactly as forms and buttons on the login page.",
  },
  method: {
    title: "Replace one method",
    description:
      "The dynamic page remains intact while one authenticator receives application-owned branding and interaction.",
  },
  page: {
    title: "Replace the complete page",
    description:
      "The application owns the whole visual composition while the Starter retains the authentication runtime.",
  },
};

export function AuthDemoPage() {
  const [pattern, setPattern] =
    useState<AuthIntegrationPattern>("dynamic");

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <Badge variant="secondary">Authentication</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Login composition
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Compare the backend-driven default with the two application-owned
          customization boundaries.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{scenarioCopy[pattern].title}</CardTitle>
          <CardDescription>{scenarioCopy[pattern].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={pattern}
            onValueChange={(next) =>
              setPattern(next as AuthIntegrationPattern)
            }
          >
            <TabsList className="w-full">
              <TabsTrigger value="dynamic">Dynamic</TabsTrigger>
              <TabsTrigger value="method">Replace method</TabsTrigger>
              <TabsTrigger value="page">Replace page</TabsTrigger>
            </TabsList>
            <TabsContent value="dynamic">
              <DynamicLoginPreview />
            </TabsContent>
            <TabsContent value="method">
              <DynamicLoginPreview replaceOidc />
            </TabsContent>
            <TabsContent value="page">
              <CustomLoginPagePreview />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {pattern !== "dynamic" ? (
        <AuthDemoPromptGenerator
          value={pattern}
          onValueChange={setPattern}
          patterns={["method", "page"]}
        />
      ) : null}
    </div>
  );
}

function DynamicLoginPreview({ replaceOidc = false }: { replaceOidc?: boolean }) {
  return (
    <div className="mx-auto max-w-sm space-y-5 pt-5">
      <div className="space-y-1 text-center">
        <h2 className="font-heading text-xl font-semibold">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Choose a sign-in method configured in NocoBase.
        </p>
      </div>

      <Tabs defaultValue="password">
        <TabsList className="w-full">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="sms">SMS</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <PasswordFields />
        </TabsContent>
        <TabsContent value="sms">
          <SmsFields />
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-4 py-1">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">Or continue with</span>
        <Separator className="flex-1" />
      </div>

      <div className="grid gap-3">
        {replaceOidc ? (
          <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <Button className="w-full">
              <ShieldCheck />
              Continue with NocoBase SSO
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Custom UI for the company-oidc authenticator only
            </p>
          </div>
        ) : (
          <Button variant="outline" className="w-full">
            <Building2 />
            Company OIDC
          </Button>
        )}
        <Button variant="outline" className="w-full">
          <MessageSquare />
          DingTalk
        </Button>
      </div>
    </div>
  );
}

function CustomLoginPagePreview() {
  return (
    <div className="mx-auto mt-5 grid max-w-4xl overflow-hidden rounded-xl border md:grid-cols-[1.1fr_1fr]">
      <div className="hidden min-h-[460px] flex-col justify-between bg-foreground p-8 text-background md:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-background text-foreground">
            <BrandLogo className="size-7" />
          </div>
          <span className="font-heading text-lg font-semibold">
            NocoBase
          </span>
        </div>
        <div className="space-y-3">
          <Badge variant="secondary">Application-owned page</Badge>
          <p className="font-heading text-3xl font-semibold leading-tight">
            Build freely. Keep the foundation reliable.
          </p>
          <p className="text-sm text-background/65">
            This entire composition can change without replacing the Starter's
            authentication runtime.
          </p>
        </div>
      </div>

      <div className="space-y-6 bg-card p-6 sm:p-8">
        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-semibold">Sign in</h2>
          <p className="text-sm text-muted-foreground">
            Continue to your NocoBase application.
          </p>
        </div>
        <PasswordFields />
        <div className="flex items-center gap-4">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <Button variant="outline" className="w-full">
          <ShieldCheck />
          NocoBase SSO
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to your organization's access policy.
        </p>
      </div>
    </div>
  );
}

function PasswordFields() {
  return (
    <div className="space-y-4 pt-3">
      <div className="space-y-2">
        <Label>Username or email</Label>
        <Input placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" value="password" readOnly />
      </div>
      <Button className="w-full">Sign in</Button>
    </div>
  );
}

function SmsFields() {
  return (
    <div className="space-y-4 pt-3">
      <div className="space-y-2">
        <Label>Phone</Label>
        <Input placeholder="Phone number" />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input placeholder="Verification code" />
        <Button variant="outline">Send code</Button>
      </div>
      <Button className="w-full">Sign in</Button>
    </div>
  );
}
