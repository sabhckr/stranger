import { useEffect } from 'react';

export interface Notice {
  id: number;
  tone: 'info' | 'error' | 'success';
  text: string;
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notice.id), notice.tone === 'error' ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);
  return (
    <div
      className={`toast toast-${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onDismiss(notice.id)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function Toasts({
  notices,
  onDismiss,
}: {
  notices: Notice[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-region" aria-live="polite">
      {notices.map((n) => (
        <Toast key={n.id} notice={n} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
