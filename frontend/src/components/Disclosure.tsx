// SCIENTIFIC_METHODOLOGY section 15 — required scientific disclosures
export function Disclosure() {
  return (
    <footer className="footer" aria-label="Scientific disclosures">
      <h2>Scientific disclosures — read before interpreting</h2>
      <ul>
        <li>The sensors do not have identical resolution or observation opportunities. MODIS (≈1 km) and VIIRS 375 m resolve thermal anomalies differently; more detections from one sensor do not necessarily mean more burning.</li>
        <li>Hotspot detections are not confirmed wildfire incidents, fire perimeters, burned area, or proof of a fire event. FRP/confidence semantics differ by product and must not be equated.</li>
        <li>Cloud, smoke, canopy, overpass timing, fire size/temperature, and product algorithms affect what is detected. Detections may be missed or include agricultural burning, prescribed burns, gas flares, and industrial heat.</li>
        <li>Missing records are not necessarily zero activity. “No source records returned; observation coverage unknown” means absence was not verified as a true zero.</li>
        <li>Historical patterns from this bounded national history do not guarantee future activity and do not establish a climatology or forecast.</li>
        <li>Any harmonized or fused indicator is an analytical construct, not a NASA-provided measurement, and requires separate validation.</li>
      </ul>
      <p>Sources: NASA FIRMS active-fire notes and attribute descriptions; VIIRS product documentation. Data lineage, snapshot IDs, and method versions are shown per view; numbers always carry a count unit.</p>
    </footer>
  );
}
