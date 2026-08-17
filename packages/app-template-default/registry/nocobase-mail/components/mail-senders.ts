import type { MailAccount } from "./types";

export interface MailSenderCandidate {
  key: string;
  accountId: number;
  accountEmail: string;
  identityEmail: string;
  label: string;
}

export const DEFAULT_MAIL_SENDER_KEY = "nocobase-mail:default-sender";

export function getMailSenderCandidates(
  accounts: MailAccount[]
): MailSenderCandidate[] {
  return accounts.flatMap((account) => {
    const identities = [
      { email: account.email, name: undefined },
      ...(account.identities ?? []),
    ];
    const seen = new Set<string>();
    return identities.flatMap((identity) => {
      const email = identity.email?.trim();
      const normalized = email?.toLocaleLowerCase();
      if (!email || seen.has(normalized)) return [];
      seen.add(normalized);
      const isPrimary = normalized === account.email.toLocaleLowerCase();
      return [
        {
          key: `${account.id}:${email}`,
          accountId: account.id,
          accountEmail: account.email,
          identityEmail: email,
          label: identity.name
            ? `${identity.name} <${email}>`
            : isPrimary
              ? `${email} (primary)`
              : `${email} via ${account.email}`,
        },
      ];
    });
  });
}

export function resolveMailSender(
  candidates: MailSenderCandidate[],
  initial?: { from?: string; accountEmail?: string; identityEmail?: string }
) {
  const identityEmail = (initial?.identityEmail ?? initial?.from)?.toLocaleLowerCase();
  const accountEmail = initial?.accountEmail?.toLocaleLowerCase();
  return (
    candidates.find(
      (candidate) =>
        candidate.identityEmail.toLocaleLowerCase() === identityEmail &&
        (!accountEmail || candidate.accountEmail.toLocaleLowerCase() === accountEmail)
    ) ??
    candidates.find(
      (candidate) => candidate.identityEmail.toLocaleLowerCase() === identityEmail
    )
  );
}
