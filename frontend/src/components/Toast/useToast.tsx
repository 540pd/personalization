"use client";

import { useEffect, useState, type ReactNode } from "react";
import Toast from ".";

const TOAST_MS = 2500;
// Longer for a toast with an Undo, which needs time to be read
// and reached, and for a failure, which needs reading.
const LONG_TOAST_MS = 5000;

interface ToastState {
  message: string;
  error?: boolean;
  onUndo?: () => void;
  actionLabel?: string;
  /** So repeating the same action restarts the timer. */
  at: number;
}

export type ShowToast = (message: string, error?: boolean, onUndo?: () => void, actionLabel?: string) => void;

/**
 * One toast at a time, so a new one replaces -- and takes the Undo of -- the
 * last. Undo hides the toast, then calls `onUndo`.
 */
export function useToast(): [ReactNode, ShowToast] {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error || toast.onUndo ? LONG_TOAST_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <Toast
      message={toast.message}
      error={toast.error}
      onUndo={
        toast.onUndo
          ? () => {
              setToast(null);
              toast.onUndo?.();
            }
          : undefined
      }
      actionLabel={toast.actionLabel}
    />
  ) : null;
  return [node, (message, error = false, onUndo, actionLabel) => setToast({ message, error, onUndo, actionLabel, at: Date.now() })];
}
