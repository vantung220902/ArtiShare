import { useEffect, useRef } from 'react';
import type { ConfirmOptions } from './useConfirm';

/** The modal itself; `useConfirm` owns when it is open and what the answer was. */
export function ConfirmDialog({
  title,
  detail,
  confirmLabel,
  danger,
  onSettle,
}: ConfirmOptions & { onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // showModal makes the rest of the popup inert, traps Tab, and turns Escape into a cancel.
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={detail ? 'confirm-detail' : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onSettle(false);
      }}
    >
      <div className="stack">
        <p id="confirm-title" className="confirm-title">
          {title}
        </p>
        {detail && (
          <p id="confirm-detail" className="hint">
            {detail}
          </p>
        )}
        <div className="row confirm-actions">
          <button
            // Cancel is the safe default: Enter on a stray open dialog must not delete or send.
            autoFocus
            onClick={() => onSettle(false)}
          >
            Cancel
          </button>
          <button className={danger ? 'danger' : 'primary'} onClick={() => onSettle(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
