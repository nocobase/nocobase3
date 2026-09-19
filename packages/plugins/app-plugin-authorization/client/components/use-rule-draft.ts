import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router';

/** The editor selection lives in the URL so refresh and history retain it. */
export function useRuleDraft<T extends { key: string }>(
  rules: readonly T[],
  fresh: () => T,
): {
  draft: T | undefined;
  setDraft: Dispatch<SetStateAction<T | undefined>>;
  originalKey: string | undefined;
  edit: (rule?: T) => void;
  close: () => void;
  dirty: boolean;
} {
  const [params, setParams] = useSearchParams();
  const selection = params.get('rule');
  const creating = params.get('new') === '1';
  const [draft, setDraft] = useState<T>();
  const [originalKey, setOriginalKey] = useState<string>();
  const [baseline, setBaseline] = useState('');
  const [source, setSource] = useState('');
  const identity = creating
    ? 'new'
    : selection === null
      ? ''
      : `edit:${selection}`;
  const selected = rules.find((rule) => rule.key === selection);
  if (source !== identity && (!identity || creating || selected)) {
    const next = creating ? fresh() : selected;
    setSource(identity);
    setDraft(next);
    setOriginalKey(creating ? undefined : selected?.key);
    setBaseline(JSON.stringify(next));
  }
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function edit(rule?: T) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      next.delete('rule');
      if (rule) next.set('rule', rule.key);
      else next.set('new', '1');
      return next;
    });
  }
  function close() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('new');
      next.delete('rule');
      return next;
    });
    setDraft(undefined);
    setOriginalKey(undefined);
  }
  return { draft, setDraft, originalKey, edit, close, dirty };
}
