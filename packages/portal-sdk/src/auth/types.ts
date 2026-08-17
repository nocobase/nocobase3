import type {
  ComponentType,
  LazyExoticComponent,
  ReactNode,
} from "react";

export type AuthenticatorSignUpFieldOption = {
  label?: unknown;
  value: string | number | boolean;
};

export type AuthenticatorSignUpField = {
  field: string;
  required?: boolean;
  show?: boolean;
  uiSchema?: {
    enum?: AuthenticatorSignUpFieldOption[];
    title?: unknown;
    "x-component"?: string;
  };
};

export type AuthenticatorPublicOptions = Record<string, unknown> & {
  allowSignUp?: boolean;
  enableResetPassword?: boolean;
  signupForm?: AuthenticatorSignUpField[];
};

export type Authenticator = {
  name: string;
  authType: string;
  authTypeTitle?: string;
  title?: string;
  options?: AuthenticatorPublicOptions;
  sort?: number;
};

export type AuthenticatorComponentProps = {
  authenticator: Authenticator;
};

type AuthenticatorComponent = ComponentType<AuthenticatorComponentProps>;

export type AuthenticatorAdapter = {
  authType: string;
  placement: "form" | "button";
  Component:
    | AuthenticatorComponent
    | LazyExoticComponent<AuthenticatorComponent>;
};

export type RenderAuthenticatorContext = {
  authenticator: Authenticator;
  adapter: AuthenticatorAdapter;
  defaultElement: ReactNode;
};

export type RenderAuthenticator = (
  context: RenderAuthenticatorContext
) => ReactNode;
