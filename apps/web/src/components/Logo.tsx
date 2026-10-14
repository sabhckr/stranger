import { href } from '../lib/base.js';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className="wordmark"
      href={href('/')}
      data-link
      aria-label="STRANGER home"
      data-compact={compact || undefined}
    >
      <span className="dot" aria-hidden="true" />
      STRANGER
    </a>
  );
}
