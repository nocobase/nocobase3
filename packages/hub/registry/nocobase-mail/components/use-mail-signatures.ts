import { useCallback, useEffect, useState } from "react";
import type { MailAccount, MailAccountSignature, MailSignature } from "./types";
import { mailApi } from "./mail-api";
import { createSignatureId } from "./mail-signatures";

export interface MailSignatureValues {
  name: string;
  content: string;
  isDefault?: boolean;
}

function fromAccount(account?: MailAccount): MailSignature[] {
  const signatures = account?.config?.signatures;
  if (!Array.isArray(signatures)) return [];
  return signatures.map((signature) => ({
    id: String(signature.id),
    name: signature.name,
    content: signature.content,
    isDefault: Boolean(signature.default),
  }));
}

function toAccount(signatures: MailSignature[]): MailAccountSignature[] {
  return signatures.map((signature) => ({
    id: signature.id,
    name: signature.name,
    content: signature.content,
    default: Boolean(signature.isDefault),
  }));
}

function normalizeDefault(list: MailSignature[], defaultId?: string) {
  return list.map((signature) => ({
    ...signature,
    isDefault: signature.id === defaultId,
  }));
}

export function useMailSignatures(
  account?: MailAccount,
  onAccountChange?: (account: MailAccount) => void
) {
  const [state, setState] = useState<{
    accountId?: number;
    signatures: MailSignature[];
  }>(() => ({ accountId: account?.id, signatures: fromAccount(account) }));
  const [saving, setSaving] = useState(false);
  const signatures =
    state.accountId === account?.id ? state.signatures : fromAccount(account);

  useEffect(() => {
    setState({ accountId: account?.id, signatures: fromAccount(account) });
  }, [account]);

  const persist = useCallback(
    async (next: MailSignature[]) => {
      if (!account) throw new Error("Select a sender account before managing signatures");
      setSaving(true);
      try {
        const config = {
          ...(account.config ?? {}),
          signatures: toAccount(next),
        };
        const response = await mailApi.updateAccount(account.id, {
          config,
        });
        setState({ accountId: account.id, signatures: next });
        onAccountChange?.({
          ...account,
          ...response,
          config: response?.config ?? config,
        });
      } finally {
        setSaving(false);
      }
    },
    [account, onAccountChange]
  );

  const create = useCallback(
    async (values: MailSignatureValues) => {
      const signature: MailSignature = {
        id: createSignatureId(),
        name: values.name,
        content: values.content,
        isDefault: Boolean(values.isDefault),
      };
      const next = values.isDefault
        ? normalizeDefault([...signatures, signature], signature.id)
        : [...signatures, signature];
      await persist(next);
      return signature;
    },
    [persist, signatures]
  );

  const update = useCallback(
    async (id: string, values: MailSignatureValues) => {
      let next = signatures.map((signature) =>
        signature.id === id ? { ...signature, ...values } : signature
      );
      if (values.isDefault) next = normalizeDefault(next, id);
      await persist(next);
    },
    [persist, signatures]
  );

  const remove = useCallback(
    async (id: string) => persist(signatures.filter((signature) => signature.id !== id)),
    [persist, signatures]
  );

  const setDefault = useCallback(
    async (id: string) => {
      const target = signatures.find((signature) => signature.id === id);
      await persist(normalizeDefault(signatures, target?.isDefault ? undefined : id));
    },
    [persist, signatures]
  );

  return { signatures, saving, create, update, remove, setDefault };
}
