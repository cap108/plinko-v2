import { useEffect, useRef, useState } from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'destructive' | 'warning';
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel, variant, onConfirm, onCancel }: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape
  useEffect(() => {
    cancelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const btnClass = variant === 'destructive'
    ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-600/40'
    : 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        ref={containerRef}
        className="relative bg-surface-alt border border-border-subtle rounded-lg max-w-sm w-full mx-4 p-5 shadow-2xl"
      >
        <h3 className="text-text-primary text-sm font-semibold mb-2">{title}</h3>
        <p className="text-text-secondary text-xs mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-text-secondary hover:text-text-primary text-xs font-medium rounded
                       border border-border-subtle hover:border-text-secondary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 text-white text-xs font-semibold rounded transition-colors flex items-center gap-2 ${btnClass}`}
          >
            {loading && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
