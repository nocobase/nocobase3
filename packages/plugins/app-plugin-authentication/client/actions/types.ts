export interface AuthenticationActionError {
  readonly message: string;
}

export interface AuthenticationActionState<Input> {
  readonly error?: AuthenticationActionError;
  readonly isPending: boolean;
  readonly submit: (input: Input) => Promise<void>;
}

export interface PasswordLoginInput {
  readonly identifier: string;
  readonly password: string;
  readonly redirectTo?: string;
}

export interface PasswordRegistrationInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  readonly redirectTo?: string;
  readonly username: string;
}

export interface PasswordResetRequestInput {
  readonly email: string;
}

export interface PasswordResetInput {
  readonly password: string;
  readonly token: string;
}

export interface PasswordResetRequestActionState extends AuthenticationActionState<PasswordResetRequestInput> {
  readonly isSuccess: boolean;
}
