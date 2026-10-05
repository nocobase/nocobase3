import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lifecycle-example:approval-center:persona';
const CHANGED = 'lifecycle-example:approval-center:persona';

function stored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? 'zhang';
  } catch {
    return 'zhang';
  }
}

/**
 * Who the demo acts as, shared by every page of the center so the to-do
 * center and a business page agree. A real application uses the signed-in
 * user instead.
 */
export function usePersona(): readonly [string, (id: string) => void] {
  const [persona, setPersona] = useState(stored);
  useEffect(() => {
    const sync = (): void => setPersona(stored());
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const change = (id: string): void => {
    setPersona(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Without storage the choice lasts for this page only.
    }
    window.dispatchEvent(new Event(CHANGED));
  };
  return [persona, change] as const;
}
