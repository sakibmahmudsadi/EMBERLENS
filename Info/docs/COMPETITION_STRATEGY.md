# NASA Space Apps 2026 — Competition Strategy

## 1. Challenge alignment

The selected challenge is **Harmonization of MODIS and VIIRS Hot Spots**. The official brief describes a split historical record across sensors and asks for a web application that harmonizes active-fire hotspot records into a burning-activity calendar, helping users explore historical patterns, unusual conditions, and critical periods for an AOI.

The team's strongest submission is not the one with the most features. It is the one that demonstrates a credible scientific solution to that exact problem and communicates why the result is more useful than an unqualified hotspot map.

## 2. Prototype pitch and boundary

**EMBERLENS turns NASA's sensor-specific active-fire observations into a traceable, sensor-aware monthly calendar for a selected place.**

The competition prototype uses one AOI and a fixed source window of at most 24 months. It demonstrates the workflow and data provenance; it is not a complete multi-decade history, robust climatology, emergency alert, or validated forecast.

Do not call the product an official NASA tool, NASA-endorsed platform, wildfire prediction system, or emergency alert service.

## 3. What judges should see

A short demonstration should show a complete evidence chain:

1. Select an AOI.
2. See source/product availability and data coverage.
3. Switch between MODIS and VIIRS while retaining their identity.
4. Inspect the monthly burning-activity calendar across the fixed demo window, up to 24 months.
5. Compare MODIS and VIIRS series in aligned AOI/month bins while explaining that their counts remain sensor-specific. Do not claim a robust anomaly from this short window.
6. Open a source observation to show its satellite, time, native attributes, and provenance.
7. Export the bounded observations/calendar with metadata and limitations.

The most important moment is the calendar cell/period drilling down to actual source observations—not a large headline statistic.

## 4. Differentiation

A defensible differentiator is **transparent harmonization**:
- source records are preserved;
- sensor differences are visible;
- missing coverage is not disguised as zero activity;
- any derived comparison has a named method and validation evidence;
- a user can trace summary values to the detections that contributed to them;
- output is reusable by researchers.

Do not claim uniqueness against every existing platform unless a competitor review supports it. Explain the specific design choices and evidence instead.

## 5. Evidence package

Prepare the following artifacts for judging:
- a source/product register with official NASA references;
- a pipeline diagram and explanation of sensor-aware harmonization;
- a fixed demo data snapshot covering no more than 24 months, with provenance;
- validation results for the monthly calendar and sensor-specific comparison;
- one short sensitivity analysis or overlap-period comparison;
- a live or recorded end-to-end demo;
- example export plus metadata sidecar;
- limitations and known risks.

Screenshots and mockups are supporting communication, not proof that a data pipeline works.

## 6. Suggested four-minute presentation flow

1. **Problem (0:00–0:35):** the historical record is split across sensors; different products cannot be compared by naïvely adding their detections.
2. **Challenge and insight (0:35–1:05):** explain MODIS/VIIRS differences and why a common schema alone is not full harmonization.
3. **Solution (1:05–1:35):** show the pipeline from source observations to sensor-aware calendar.
4. **Product walkthrough (1:35–2:50):** demo AOI → source availability → monthly calendar → sensor comparison → month drill-down → source observation. Describe a high-count month descriptively; do not call it anomalous based on the two-year demo alone.
5. **Research reuse and impact (2:50–3:30):** export, provenance, metadata, and who can use the output.
6. **Validation and limitations (3:30–3:50):** demonstrate one test/evidence point and state what the app does not claim.
7. **Close (3:50–4:00):** repeat the product value proposition.

Adjust timings to the actual submission format and judging instructions.

## 7. Judging alignment checklist

The official challenge evaluation material describes five broad criteria: Impact, Creativity, Validity, Relevance, and Presentation. Confirm the exact current instructions from the official challenge portal and local event lead.

| Criterion | EMBERLENS evidence |
|---|---|
| Impact | Makes a bounded, multi-sensor observation window interpretable and reusable for research/monitoring context |
| Creativity | Sensor-aware calendar and explicit provenance/coverage model, not just plotting points |
| Validity | NASA sources, source-preserving transformations, overlap analysis, unit tests, and limitations |
| Relevance | Directly addresses the requested harmonization and burning-activity calendar |
| Presentation | A clear AOI-to-calendar-to-source-to-export demonstration |

## 8. What to avoid in the demo

- Fake numbers, invented percentage changes, fabricated accuracy, or placeholder charts presented as live.
- A claim that every hotspot is a wildfire.
- A combined MODIS/VIIRS count with no validation.
- Anomaly badges that imply danger without context.
- An unvalidated forecast or model confidence percentage.
- Showing a mockup instead of the functioning application when claiming implementation.
- Spending most of the time on architecture buzzwords rather than the user problem and result.

## 9. Impact language

Use grounded statements such as: “The prototype helps users inspect up to two years of satellite detections for a selected region, compare sensor-specific patterns, and trace calendar values to source records.” Do not describe this bounded sample as a long-term seasonal normal.

Do not say it prevents fires, saves lives, predicts wildfire outbreaks, or guides emergency response unless the team has evidence, operational partnerships, and validated functionality to support that claim.

## 10. Official source

Challenge brief: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
