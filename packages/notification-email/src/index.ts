import nodemailer from "nodemailer";
import type {
  NotificationChannelDefinition,
  ProviderSendResult,
} from "@nocobase/notification";

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
  readonly type: "smtp";
  readonly name: string;
  readonly enabled?: boolean;
  readonly host: string;
  readonly port: number;
  readonly secure?: boolean;
  readonly auth?: { readonly user: string; readonly pass: string };
  readonly from?: string;
}
export interface EmailChannelConfig {
  readonly type: "email";
  readonly enabled: boolean;
  readonly providers: readonly SmtpProviderConfig[];
}
export interface EmailChannelDefinitionOptions {
  readonly resolveUserEmail?: (userId: string) => Promise<string | undefined>;
}

export function defineEmailChannelConfig(
  input: Omit<EmailChannelConfig, "type">,
): EmailChannelConfig {
  return { type: "email", ...input };
}
export function defineSmtpProviderConfig(
  input: Omit<SmtpProviderConfig, "type">,
): SmtpProviderConfig {
  return { type: "smtp", ...input };
}

export function createEmailChannelDefinition(
  options: EmailChannelDefinitionOptions = {},
): NotificationChannelDefinition<EmailChannelConfig> {
  return {
    type: "email",
    providerDefinitions: [
      {
        type: "smtp",
        async createProvider(_context, config) {
          const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.auth,
          });
          return {
            name: config.name,
            type: "smtp",
            async send(message: object): Promise<ProviderSendResult> {
              const value = message as {
                readonly to: string;
                readonly content: EmailMessage;
              };
              try {
                await transporter.sendMail({
                  from: value.content.from ?? config.from,
                  to: value.to,
                  subject: value.content.subject,
                  text: value.content.text,
                  html: value.content.html,
                });
                return {
                  status: "accepted",
                };
              } catch (error) {
                if (isUnknownSubmission(error)) {
                  return {
                    status: "submission_unknown",
                    error: {
                      category: "provider",
                      message: error.message,
                    },
                  };
                }
                return {
                  status: "failed",
                  error: {
                    category: "provider",
                    message:
                      error instanceof Error ? error.message : String(error),
                  },
                  allowNextProvider: true,
                };
              }
            },
            async close(): Promise<void> {
              transporter.close();
            },
          };
        },
      },
    ],
    async createChannel() {
      return {
        type: "email",
        async prepare(input: {
          readonly deliveryId: string;
          readonly notificationId: string;
          readonly recipient: object;
          readonly message: object;
        }): Promise<object> {
          const recipient = input.recipient as EmailRecipient;
          const message = input.message as EmailMessage;
          const address =
            recipient.address ??
            (recipient.userId
              ? await options.resolveUserEmail?.(recipient.userId)
              : undefined);
          if (!address)
            throw new Error("Email recipient address cannot be resolved.");
          if (!message.subject || !message.text)
            throw new Error("Email subject and text are required.");
          return { to: address, content: message };
        },
      };
    },
  };
}

function isUnknownSubmission(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EPIPE";
}
