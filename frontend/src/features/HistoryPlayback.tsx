type HistoryPlaybackProps = {
  startYear: number;
  endYear: number;
  year: number | null;
  playing: boolean;
  loading: boolean;
  disabled: boolean;
  error: string;
  onYearChange: (year: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
};

export function HistoryPlayback({ startYear, endYear, year, playing, loading, disabled, error, onYearChange, onPlay, onPause, onReset }: HistoryPlaybackProps) {
  const displayedYear = year ?? startYear;
  return (
    <section className="history-playback" aria-label="Historical map playback">
      <div className="history-playback-heading">
        <div><div className="eyebrow">RECONSTRUCT</div><strong>Historical playback</strong></div>
        <span className="history-year">{year ?? 'All years'}</span>
      </div>
      <div className="history-playback-controls">
        <button type="button" className="outline-button" aria-label="Previous year" title="Previous year" disabled={disabled || loading || displayedYear <= startYear} onClick={() => onYearChange(displayedYear - 1)}>‹</button>
        <button type="button" className="btn" disabled={disabled || loading} onClick={playing ? onPause : onPlay}>{loading ? 'Loading year…' : playing ? 'Pause' : 'Play years'}</button>
        <button type="button" className="outline-button" aria-label="Next year" title="Next year" disabled={disabled || loading || displayedYear >= endYear} onClick={() => onYearChange(displayedYear + 1)}>›</button>
        <button type="button" className="outline-button history-reset" disabled={year === null || loading} onClick={onReset}>All dates</button>
      </div>
      <label className="history-slider">
        <span className="sr-only">Select map year</span>
        <input type="range" min={startYear} max={endYear} step="1" value={displayedYear} disabled={disabled || loading || startYear === endYear} onChange={event => onYearChange(Number(event.target.value))} />
        <span>{startYear}</span><span>{endYear}</span>
      </label>
      <p className="history-playback-note">Annual source-record map. Empty results do not establish zero fire activity.</p>
      {error && <p className="history-playback-error" role="status">{error}</p>}
    </section>
  );
}
