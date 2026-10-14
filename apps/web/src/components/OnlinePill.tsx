export function OnlinePill({ count, connection }: { count: number; connection: string }) {
  const connected = connection === 'open';
  return (
    <span className="pill" aria-live="polite">
      <span
        className="live"
        aria-hidden="true"
        style={connected ? undefined : { background: 'var(--text-dim)', boxShadow: 'none' }}
      />
      {connected
        ? `${count.toLocaleString()} online`
        : connection === 'reconnecting'
          ? 'Reconnecting…'
          : 'Connecting…'}
    </span>
  );
}
