import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  /** Extra sentence under the title. */
  detail?: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * A confirmation drawn inside the popup. `window.confirm` opens a browser dialog, and focus
 * moving to it can close an extension popup mid-action, so it must not be used here.
 *
 * `ask` resolves to true when confirmed and false for Cancel or Escape. Render the returned
 * `dialog` once anywhere in the view.
 */
export function useConfirm(): { ask: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);
  // A second ask while one is open would orphan the first promise; answer it as cancelled.
  const current = useRef<Pending | null>(null);

  const settle = useCallback((ok: boolean) => {
    const open = current.current;
    current.current = null;
    setPending(null);
    open?.resolve(ok);
  }, []);

  const ask = useCallback((options: ConfirmOptions) => {
    current.current?.resolve(false);

    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      current.current = next;
      setPending(next);
    });
  }, []);

  // Leaving the view while a question is open must not leave its caller waiting forever.
  useEffect(
    () => () => {
      current.current?.resolve(false);
      current.current = null;
    },
    [],
  );

  return { ask, dialog: pending && <ConfirmDialog {...pending} onSettle={settle} /> };
}
