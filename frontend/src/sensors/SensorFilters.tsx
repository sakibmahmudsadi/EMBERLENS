import { useEffect } from 'react';
export type SensorFilter = { sensors: string[]; platforms: string[]; products: string[] };
export function useSensorFilters() {
  return null;
}
export function SensorChips({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div className="chips" role="group" aria-label={label}>
        {options.length === 0 && <span style={{ fontSize: 13 }}>No options returned by API</span>}
        {options.map(o => (
          <button key={o} type="button" className="chip" aria-pressed={selected.includes(o)} onClick={() => toggle(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}
// Keep hook usage simple: parent fetches data-sources and passes options down.
export function SensorFilters({ options, value, onChange }: { options: { sensors: string[]; platforms: string[]; products: string[] }; value: SensorFilter; onChange: (v: SensorFilter) => void }) {
  useEffect(() => { /* no-op: reserved for future validation */ }, []);
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <SensorChips label="Sensor" options={options.sensors} selected={value.sensors} onChange={v => onChange({ ...value, sensors: v })} />
    <SensorChips label="Platform" options={options.platforms} selected={value.platforms} onChange={v => onChange({ ...value, platforms: v })} />
    <SensorChips label="Product" options={options.products} selected={value.products} onChange={v => onChange({ ...value, products: v })} />
  </div>;
}
export const SENSOR_EXPLAINER = 'MODIS and VIIRS differ in spatial resolution, overpass schedule, algorithm, and confidence semantics. Series are never summed into a single number. Aligned months do not make counts physically equivalent.';
