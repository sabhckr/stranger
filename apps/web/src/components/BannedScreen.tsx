import { Logo } from './Logo.js';

export function BannedScreen({ reason, expiresAt }: { reason: string; expiresAt: number | null }) {
  return (
    <div className="center-page">
      <div className="card" style={{ maxWidth: 520 }} role="alert">
        <Logo />
        <h1 style={{ fontSize: 26, margin: '18px 0 8px' }}>Access suspended</h1>
        <p style={{ color: 'var(--text-muted)' }}>{reason}</p>
        <p style={{ color: 'var(--text-muted)' }}>
          {expiresAt
            ? `The suspension ends ${new Date(expiresAt).toLocaleString()}.`
            : 'This suspension does not expire.'}
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          If you believe this is a mistake, contact the operator listed on the Terms page.
        </p>
      </div>
    </div>
  );
}
