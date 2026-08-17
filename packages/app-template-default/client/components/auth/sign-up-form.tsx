"use client";

import { AlertCircle, KeyRound } from "lucide-react";
import { useState } from "react";
import { useLink, useNotification, useRegister } from "@refinedev/core";
import {
  usePublicAuthenticators,
  type Authenticator,
  type AuthenticatorSignUpField,
} from "@nocobase/portal-sdk/auth";
import { useSearchParams } from "react-router";

import { AuthLayout } from "@/components/auth/auth-layout";
import { InputPassword } from "@/components/auth/input-password";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";

type SignUpFieldValue = string | number | boolean;
type SignUpValues = Record<string, SignUpFieldValue>;

type SignUpVariables = SignUpValues & {
  authenticator: string;
  password: string;
  confirm_password: string;
};

function getFieldLabel(field: AuthenticatorSignUpField) {
  return (
    resolveTranslatableText(field.uiSchema?.title, {
      ns: "lm-collections",
    }) || field.field
  );
}

function getFieldId(authenticatorName: string, fieldName: string) {
  return `${authenticatorName}-${fieldName}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function DynamicSignUpField({
  authenticatorName,
  field,
  value,
  onChange,
}: {
  authenticatorName: string;
  field: AuthenticatorSignUpField;
  value: SignUpFieldValue | undefined;
  onChange: (value: SignUpFieldValue) => void;
}) {
  const id = getFieldId(authenticatorName, field.field);
  const label = getFieldLabel(field);
  const component = field.uiSchema?.["x-component"];
  const options = field.uiSchema?.enum;

  if (options?.length) {
    const selectedValue =
      typeof value === "undefined" ? undefined : String(value);

    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={selectedValue}
          onValueChange={(nextValue) => {
            if (nextValue === null) return;
            const option = options.find(
              (item) => String(item.value) === nextValue
            );
            onChange(option?.value ?? nextValue);
          }}
        >
          <SelectTrigger id={id} className="w-full" aria-required={field.required}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={`${typeof option.value}:${String(option.value)}`}
                value={String(option.value)}
              >
                {resolveTranslatableText(option.label) || String(option.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (component === "Checkbox") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          name={field.field}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-required={field.required}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
    );
  }

  if (component === "Input.TextArea" || component === "TextArea") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          name={field.field}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={field.field}
        type={field.field === "email" ? "email" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={
          field.field === "email"
            ? "email"
            : field.field === "username"
              ? "username"
              : undefined
        }
        required={field.required}
      />
    </div>
  );
}

function BasicSignUpForm({ authenticator }: { authenticator: Authenticator }) {
  const [values, setValues] = useState<SignUpValues>({});
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { open } = useNotification();
  const Link = useLink();
  const { mutate: register, isPending } = useRegister<SignUpVariables>();
  const fields = (authenticator.options?.signupForm ?? []).filter(
    (field) =>
      field?.show &&
      field.field !== "password" &&
      field.field !== "confirm_password"
  );

  const updateValue = (field: string, value: SignUpFieldValue) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSignUp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const missingField = fields.find(
      (field) => field.required && !values[field.field]
    );
    if (missingField) {
      open?.({
        type: "error",
        message: `Please enter ${getFieldLabel(missingField)}`,
      });
      return;
    }

    if (password !== confirmPassword) {
      open?.({
        type: "error",
        message: "Passwords don't match",
        description: "Please make sure both password fields match.",
      });
      return;
    }

    register({
      ...values,
      password,
      confirm_password: confirmPassword,
      authenticator: authenticator.name,
    });
  };

  return (
    <form onSubmit={handleSignUp} className="space-y-5">
      {fields.map((field) => (
        <DynamicSignUpField
          key={field.field}
          authenticatorName={authenticator.name}
          field={field}
          value={values[field.field]}
          onChange={(value) => updateValue(field.field, value)}
        />
      ))}

      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-password`}>Password</Label>
        <InputPassword
          id={`${authenticator.name}-password`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${authenticator.name}-confirm-password`}>
          Confirm password
        </Label>
        <InputPassword
          id={`${authenticator.name}-confirm-password`}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account…" : "Sign up"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link
          to="/login"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

export const SignUpForm = () => {
  const [searchParams] = useSearchParams();
  const { data: authenticators = [], error, isPending } =
    usePublicAuthenticators();
  const authenticatorName = searchParams.get("name");
  const authenticator = authenticators.find(
    (item) => item.name === authenticatorName
  );

  return (
    <AuthLayout
      title="Create your account"
      description="Create your NocoBase account."
    >
      {isPending ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to load the sign-up method</AlertTitle>
          <AlertDescription>
            {import.meta.env.DEV && error instanceof Error
              ? error.message
              : "Please try again or contact your administrator."}
          </AlertDescription>
        </Alert>
      ) : !authenticator || authenticator.authType !== "Email/Password" ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>No sign-up method available</EmptyTitle>
            <EmptyDescription>
              This sign-up link is invalid or the authentication method does
              not support account registration.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : authenticator.options?.allowSignUp !== true ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyTitle>Account registration is disabled</EmptyTitle>
            <EmptyDescription>
              Contact your administrator if you need an account.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <BasicSignUpForm
          key={authenticator.name}
          authenticator={authenticator}
        />
      )}
    </AuthLayout>
  );
};

SignUpForm.displayName = "SignUpForm";
