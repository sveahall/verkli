# AI quality evaluation and launch evidence

**Goal:** Make the existing translation reviewers measurable against source-grounded, original Swedish/English cases before claiming launch readiness.
**Architecture:** A local-only review workbench displays source, candidate, expected issue and actual reviewer findings. A bounded CLI reuses production reviewer prompts and validation without translating/revising the candidates, sends no answer labels to the model and saves versioned JSON. Model failures remain errors, never clean passes. Cases are developer-authored provisional expectations, not bilingual human certification.
**Scope:** Continue the approved quality architecture. No new dependencies, schema, customer manuscript processing, production configuration changes or automated launch claims. Separate corpus authoring and review through subagent-driven-development; root owns integration.

## Work
- [x] Add ten short original sv↔en cases: paired clean/faulty variants for negation, omission, deliberate repetition, dialogue register and terminology consistency. Keep all target/source segments aligned. Document provenance and provisional human-review status.
- [x] Add a development-only workbench with accessible case selection, paired text and expected findings; later load actual run JSON. Empty/error states must distinguish unrun from passed. Production returns 404.
- [x] Add a review-only adapter sharing prompts and strict segment/quote validation with production. Preserve current translate/revise behavior. Test no translation/profile/revision call, invalid coverage/evidence, cancellation and unavailable provider.
- [x] Add evaluation runner and tests. Record per-case expected blocking decision versus observed decision, both reviewer findings, model/rubric/corpus identifiers, usage, latency and errors. Score decisions provisionally; do not label an anchored issue a proven correct diagnosis. Whole-corpus status cannot pass when any case is absent or failed.
- [x] CLI defaults to offline corpus validation; explicit --live runs at most the fixed corpus once with zero retries and a total call cap, writes report with no secrets. Run a bounded real review benchmark on only original fixtures.
- [x] Run unit suite, lint, build, desktop/mobile workbench QA and production-404 check. Review changes and document measured results plus remaining launch gates in a status/QA report.

## Verification cases
- A defective translation with no blocking findings is a miss; an acceptable candidate with a blocking finding is overflagged.
- Errors and unrun cases cannot increase pass count. Duplicate/unknown case IDs and mismatched corpus fingerprints are rejected by the viewer.
- The model receives source, candidate and source-grounded profile only; fixture labels and expected issues never enter prompts.
- Reports are local output, not production book approvals. Author/reader permissions and existing translation flow remain unchanged.

## QA script
1. Open http://127.0.0.1:3024/dev/translation-evaluation and select clean/faulty cases with keyboard.
2. Compare original, candidate and expected issue. Unrun cases must say Not run.
3. Load a generated report; inspect any miss, overflag or provider error and its actual evidence.
4. Load malformed/mismatched JSON; show a clear error and remove previous displayed results.
5. At 390px width verify readable text and no horizontal overflow.
6. Confirm /dev/translation-evaluation returns 404 from the production build.

## Result

See `docs/qa/ai-readiness-2026-09-14.md` and the two recorded JSON reports. Baseline findings motivated rubric v2: accept idiomatic equivalents, separate reviewer responsibilities and avoid optional polishing. Five seeded defects remained detected; four minor findings on references fell to zero in this small repeated corpus. This is not an independent holdout benchmark. Production integration and the remaining launch gates are explicitly pending.
