// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './index';

/**
 * One question before a step that cannot be taken back, or that other people
 * will see. It opens on the safe answer (the cancel button has the focus),
 * closes on Escape, keeps Tab inside itself while it is open, and gives the
 * focus back to the button that opened it.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const keep = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = Array.from(
      cardRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
    );
    if (buttons.length === 0) return;
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="confirm" onKeyDown={keep}>
      <div
        ref={cardRef}
        className="confirm__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className="confirm__title">
          {title}
        </h2>
        <div id={bodyId} className="confirm__body stack">
          {children}
        </div>
        <div className="confirm__actions">
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
