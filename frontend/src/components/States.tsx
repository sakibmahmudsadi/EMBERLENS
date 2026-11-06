export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="state" role="status" aria-live="polite">{label}</div>;
}
export function Empty({ msg = 'No data returned.' }: { msg?: string }) {
  return <div className="state" role="status">{msg}</div>;
}
export function ErrorState({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const isDown = /fetch|network|failed to fetch|localhost|refused/i.test(msg);
  return (
    <div className="state error" role="alert">
      <p><strong>{isDown ? 'Backend unreachable' : 'Something went wrong'}</strong></p>
      <p>{msg}</p>
      {isDown && <p>Is the backend running? Set <code className="mono">VITE_API_BASE_URL</code> (default <code className="mono">http://localhost:8000</code>) and retry. The UI will not show fake data.</p>}
      {onRetry && <button className="btn ghost" onClick={onRetry}>Retry</button>}
    </div>
  );
}
