import { navigate } from '../router.js';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className="wordmark"
      href="/"
      aria-label="STRANGER home"
      onClick={(e) => {
        e.preventDefault();
        navigate('/');
      }}
    >
      <span className="dot" aria-hidden="true" />
      {compact ? 'STRANGER' : 'STRANGER'}
    </a>
  );
}
