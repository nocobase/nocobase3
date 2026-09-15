import { useEffect, useState } from 'react';

export interface Resource<TValue> {
  readonly value?: TValue;
  readonly error?: unknown;
  readonly loading: boolean;
}

/**
 * Loads one value for the currently selected key.
 *
 * The key is what makes this worth a hook. A pane whose selection changed is
 * showing the previous selection's data until the next response arrives, so the
 * result is stored together with the key it belongs to and read back only when
 * the two still agree. Clearing the old value in an effect instead would render
 * one frame of the wrong data and then set state during an effect to correct
 * it; comparing keys is the same intent without either.
 *
 * A key of `undefined` means nothing is selected, and nothing is fetched.
 */
export function useResource<TValue>(
  key: string | undefined,
  load: (key: string) => Promise<TValue>,
): Resource<TValue> {
  const [state, setState] = useState<{
    key: string;
    value?: TValue;
    error?: unknown;
  }>();

  useEffect(() => {
    if (key === undefined) return;
    let active = true;
    load(key)
      .then((value) => {
        if (active) setState({ key, value });
      })
      .catch((error: unknown) => {
        if (active) setState({ key, error });
      });
    return () => {
      // A response for an abandoned selection must not replace the current one.
      active = false;
    };
  }, [key, load]);

  if (key === undefined) return { loading: false };
  if (state?.key !== key) return { loading: true };
  return {
    ...(state.value === undefined ? {} : { value: state.value }),
    ...(state.error === undefined ? {} : { error: state.error }),
    loading: false,
  };
}
