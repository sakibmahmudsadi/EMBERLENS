import type { CalendarResponse } from '../lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function quantile(sorted: number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return Math.round(sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * fraction);
}

/** Descriptive totals only: no-record months are unknown, not zeros or exposure-adjusted rates. */
export function SeasonalityProfile({ data }: { data: CalendarResponse }) {
  if (!data.series.length) return null;
  const summaries = data.series.map(series => {
    const months = MONTHS.map((_, index) => {
      const values = series.values.filter(v => Number(v.period_start.slice(5, 7)) === index + 1);
      const count = values.reduce((sum, value) => sum + value.observation_count, 0);
      const yearsWithRecords = values.filter(v => v.observation_count > 0).length;
      const sourceGapYears = values.filter(v => v.coverage_status === 'partial_source_data').length;
      // Treat only months with records and no known FIRMS source gap as
      // descriptive samples. Empty months are unknown, not zeroes.
      const samples = values
        .filter(v => v.observation_count > 0 && v.coverage_status === 'records_present')
        .map(v => v.observation_count)
        .sort((a, b) => a - b);
      return {
        count,
        yearsWithRecords,
        sourceGapYears,
        sampleCount: samples.length,
        median: samples.length ? quantile(samples, 0.5) : null,
        lowerQuartile: samples.length ? quantile(samples, 0.25) : null,
        upperQuartile: samples.length ? quantile(samples, 0.75) : null,
      };
    });
    return { series, months, max: Math.max(1, ...months.map(m => m.count)) };
  });

  return (
    <section className="panel seasonality-panel" aria-label="Descriptive seasonal profile">
      <div className="seasonality-heading"><h2>Seasonality</h2><span>returned detections by month</span></div>
      <div className="seasonality-series">
        {summaries.map(({ series, months, max }) => (
          <article className="seasonality-series-card" key={`${series.product_id}-${series.platform}`}>
            <h3><i />{series.sensor} · {series.platform}</h3>
            <div className="seasonality-bars" role="list" aria-label={`${series.sensor} detections by month`}>
              {months.map((month, index) => (
                <div className="seasonality-month" role="listitem" tabIndex={0} key={MONTHS[index]} title={`${MONTHS[index]}: ${month.count.toLocaleString()} returned rows · ${month.yearsWithRecords} years with records · ${month.sourceGapYears} source-gap years · ${month.sampleCount ? `n=${month.sampleCount}, median ${month.median}, IQR ${month.lowerQuartile}–${month.upperQuartile}` : 'no eligible historical sample'}`}>
                  <span className="seasonality-count">{month.count.toLocaleString()}</span>
                  <div className="seasonality-track" title={`${MONTHS[index]}: ${month.count} records`}>
                    <span style={{ height: `${month.count > 0 ? Math.max(2, month.count / max * 100) : 0}%` }} />
                  </div>
                  <strong>{MONTHS[index]}</strong>
                  <div className="seasonality-hover-detail" aria-hidden="true">
                    <span>{month.yearsWithRecords} years with records</span>
                    <span>{month.sourceGapYears} source-gap years</span>
                    <span>{month.sampleCount ? `n=${month.sampleCount} · median ${month.median}` : 'No eligible sample'}</span>
                    {month.sampleCount > 0 && <span>IQR {month.lowerQuartile}–{month.upperQuartile}</span>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
