import { useState } from 'react';
import { ApiErrorType } from '@/api';

interface NetworkErrorOverlayProps {
  errorType: ApiErrorType;
  message: string;
  onRetry: () => void;
}

export function NetworkErrorOverlay({ errorType, message, onRetry }: NetworkErrorOverlayProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    onRetry();
    // Reset after a short delay in case retry fails synchronously
    setTimeout(() => setRetrying(false), 2000);
  };

  const icon = errorType === ApiErrorType.Timeout ? '\u23F1' : '\u26A0';
  const title = errorType === ApiErrorType.Timeout
    ? 'Connection Timed Out'
    : errorType === ApiErrorType.Network
      ? 'Network Error'
      : 'Server Error';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/90 backdrop-blur-sm"
      role="alert"
    >
      <div className="bg-surface-alt border border-border-subtle rounded-xl p-6 max-w-sm mx-4 text-center shadow-2xl">
        <p className="text-3xl mb-3">{icon}</p>
        <h2 className="text-text-primary font-heading text-lg font-bold mb-2">{title}</h2>
        <p className="text-text-secondary text-sm mb-4">{message}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={`px-6 py-2.5 bg-accent-cyan text-surface font-bold rounded min-h-[44px]
            transition-all
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
            ${retrying ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:scale-95'}`}
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
