export interface EmailRecipient {
  readonly address?: string;
  readonly userId?: string;
}

export interface EmailMessage {
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly from?: string;
}

export interface SmtpProviderConfig {
  readonly type: 'smtp';
  readonly name: string;
  readonly enabled?: boolean;
  readonly host: string;
  readonly port: number;
  readonly secure?: boolean;
  readonly auth?: { readonly user: string; readonly pass: string };
  readonly from?: string;
}

export interface EmailChannelConfig {
  readonly type: 'email';
  readonly enabled: boolean;
  readonly providers: readonly SmtpProviderConfig[];
}
