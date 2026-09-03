# B4 implementation plan document review

- Date: 2026-08-29
- Target: `2026-08-29-prism-harness-x1-microvm-b4-implementation-plan.md`
- Workflow: saved `doc-review.js`
- Verdict: fix-first
- Lenses: coherence, feasibility, product, security, scope-guardian, adversarial
- Lenses failed: none
- Verification: complete
- Findings filed: 9
- Findings killed by audit: 1
- Actionable findings retained: 8

## Retained findings and disposition

| ID | Severity | Finding | Plan correction |
|---|---|---|---|
| DR-01 | P1 | B4-01 required two independent protocol implementations but planned only `prism-wire`. | Added a separately authored TypeScript wire oracle and cross-implementation corpus gate. |
| DR-02 | P1 | The dependency graph let B4-08 through B4-10 branch directly from B4-00. | Replaced it with explicit multi-parent prerequisites for integration, acceptance, and closure. |
| DR-03 | P1 | The planned `x1/tests/` tree omitted milestone test files. | Added host-qualification and acceptance contract tests to the planned layout. |
| DR-04 | P1 | Milestone 6 referred to retained executable v2 fixtures that do not exist. | Added a first-class corpus-construction task, independent expected-output oracle, traceability review, and no-legacy-implementation claim. |
| DR-05 | P1 | Proxy Firecracker tests did not match physical X1 host policy closely enough. | Added required fresh read-only X1 qualification and a proxy-parity packet before B4 closure; physical-only rows remain explicitly reserved for Q4. |
| DR-06 | P2 | Firecracker final-lock timing conflicted between Milestones 0 and 5. | Milestone 0 now locks a candidate set; Milestone 5 selects the final release after real jailer tests. |
| DR-07 | P2 | Secret/host-value scanning covered only `b4.lock.json`. | Added `b4:scan-public` over every committed B4 source, evidence, SBOM, provenance, acceptance, and gate artifact. |
| DR-08 | FYI | The plan left small clarity gaps around DSH, runner blast radius, traceability, and differential coverage. | Defined DSH, documented runner containment, tightened traceability, and replaced assumed parity with an executable contract corpus. |

## Killed finding

One feasibility finding about the dependency graph was killed because its
quoted evidence came from the runtime contract instead of the reviewed plan.
The underlying graph defect survived independently through the coherence lens
and is corrected as DR-02.

No file was changed by the review workflow. The coordinator applied the
dispositions above after reading the audited result.

## Focused closure audit

The first focused audit closed DR-01 and DR-03 through DR-07, but correctly
refused PASS because the graph still rendered B4-09 and B4-10 as parallel
successors. It also noted a minor mismatch between corpus creation and CPython
selection order. The plan now makes `B4-09 PASS` an explicit prerequisite of
B4-10 and creates the normative v2 corpus before selecting the guest runtime.

The final narrow read-only recheck returned PASS. Both corrections are closed,
no new Critical or Important dependency contradiction was found, and the
reviewer changed no files.
