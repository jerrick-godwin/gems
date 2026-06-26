import { useCallback, useRef, useState } from "react";

export function useSingleFlightAction() {
  const activeRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T>(action: () => Promise<T>, options: { keepLocked?: boolean } = {}) => {
    if (activeRef.current) return undefined;
    activeRef.current = true;
    setBusy(true);

    try {
      return await action();
    } finally {
      if (!options.keepLocked) {
        activeRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const release = useCallback(() => {
    activeRef.current = false;
    setBusy(false);
  }, []);

  return { busy, run, release };
}

export function createIdempotencyKey(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  if (cryptoId) return `${prefix}-${cryptoId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
