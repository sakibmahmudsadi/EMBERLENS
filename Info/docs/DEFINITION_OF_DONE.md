# Definition of Done

A task is complete only when the applicable criteria below have evidence.

## 1. Code completion

- [ ] Code follows existing repository conventions or a documented new convention.
- [ ] Inputs are validated and errors are handled explicitly.
- [ ] No secrets, credentials, real API keys, or private paths are committed.
- [ ] No irrelevant generated files or temporary debug code remain.
- [ ] Types/contracts are updated where behavior changed.
- [ ] Dependencies are justified and lockfiles updated when required.

## 2. Data/scientific completion

- [ ] Source product/version and field semantics are identified.
- [ ] Native source attributes are preserved where relevant.
- [ ] Units and timestamp rules are documented.
- [ ] Missing data, nulls, and true zeros are distinguished.
- [ ] Sensor/platform differences are not silently erased.
- [ ] Every derived output has input provenance and a method version.
- [ ] Assumptions, uncertainty, and limitations are documented.
- [ ] Method has an appropriate test or validation artifact.

## 3. Testing completion

- [ ] Focused unit tests pass.
- [ ] Relevant integration tests pass.
- [ ] Edge cases are tested (empty data, partial data, invalid time/AOI, duplicate rows).
- [ ] Regression tests cover corrected defects.
- [ ] Manual verification steps are recorded where automation is not practical.
- [ ] Exact commands and observed outcomes are reported.

## 4. API/export completion

- [ ] Request/response schemas and error behavior are documented.
- [ ] Pagination, filtering, and boundary conditions are tested.
- [ ] Export data matches the UI/API selection.
- [ ] Metadata and source provenance accompany the output.
- [ ] GeoJSON coordinate order and CRS are verified where applicable.

## 5. UI completion

- [ ] Loading, empty, error, and partial-coverage states are designed.
- [ ] Scientific labels and units are accurate.
- [ ] No illustrative placeholder is presented as real data.
- [ ] Keyboard/focus/contrast basics are checked.
- [ ] Responsive layout is checked at supported viewport sizes.
- [ ] Interactions work against real APIs or are explicitly labeled as prototypes.

## 6. Documentation and handoff

- [ ] `docs/STATUS.md` is updated.
- [ ] Significant design/method choices are recorded in `docs/DECISIONS.md`.
- [ ] Run/setup instructions reflect tested reality.
- [ ] Remaining issues and known limitations are listed.
- [ ] Git diff is reviewed and commit is coherent.

## 7. Completion report format

Every implementation task should finish with:

1. **Implemented:** exact behavior and files changed.
2. **Evidence:** tests/commands and results.
3. **Data/method:** source, version, method, and scientific implications if relevant.
4. **Not implemented:** anything deferred or incomplete.
5. **Risks:** known limitations or follow-up needed.
6. **Run it:** exact command(s) to reproduce the behavior.
