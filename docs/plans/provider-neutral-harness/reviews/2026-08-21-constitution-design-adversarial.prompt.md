CODEX_MODEL: gpt-5.6-sol-max
CODEX_EFFORT: xhigh

# Adversarial review: PNH constitution + invariant registry design

SCENE: PNH (a small embeddable agent harness / security kernel) is about to
build its canonical normative reference: a machine-readable invariant registry
that generates a "constitution" document, enforced by a conformance test. The
design for that system is the review target. It was written collaboratively and
is suspected of collaborative overconfidence.

ROLE: You are a hostile reviewer. Assume the document is wrong until proven
otherwise. Your job is to break it, not improve it. A finding without a
concrete failure or gaming scenario is noise — do not report it.

## Read first (absolute paths, in this order)

Primary target:
- historical-worktree/docs/plans/provider-neutral-harness/2026-08-21-pnh-constitution-design.md

Satellites the design claims to harvest from or supersede (check its claims
about them, do not review them):
- historical-worktree/docs/plans/provider-neutral-harness/2026-08-21-m3-plugin-isolation-architecture-options.md
- historical-worktree/docs/plans/provider-neutral-harness/2026-08-21-m3-plugin-fault-isolation-threat-model.md
- historical-worktree/docs/plans/provider-neutral-harness/2026-08-20-m2-hybrid-restart-plan.md
- historical-worktree/docs/plans/provider-neutral-harness/architecture.md

Ground truth code (the design makes claims about these):
- historical-worktree/pnh/sdk/protocol.ts
- historical-worktree/pnh/tests/m3-plugin-fault-isolation.test.ts
- historical-worktree/pnh/tests/plugin-sdk-types.test.ts
- historical-worktree/pnh/harness/plugin-container-supervisor.mjs

## Attack surfaces, in priority order

1. **Enforcement gaming.** The design's whole value claim is "conformance is
   computed, not asserted." For each of the six conformance-test checks,
   construct the cheapest artifact that SATISFIES the check while VIOLATING
   the property it exists to prove. Examples to beat or better: a test file
   that contains the invariant ID string but never exercises the invariant; a
   hand-written prose paragraph outside the generator markers that contradicts
   a registry statement (does the byte-for-byte drift rule even see it?); a
   quantitative bound in `bounds:` silently weakened from 50 to 5000 with no
   amendment record (is a bounds change an amendment or a tune?); a protocol
   spec file that "declares the pinned version" as a string while its content
   describes a different protocol.
2. **Internal contradictions.** Decisions section vs. chapter map vs. out of
   scope vs. success criteria vs. migration. Chapter numbering after the
   bridge-law insertion. The cell-port pin timing (success criterion says
   pinned at introduction; who or what enforces "at introduction"?). Registry
   field rules vs. the schema example.
3. **Bridge-law holes.** The MCP bridge chapter freezes the foreign tool
   surface at admission: is that freeze bytes (schema hashes) or names? What
   stops the bridged server, running inside the plugin container, from using
   whatever network egress the container has? MCP servers expose resources and
   prompts, not just tools — the chapter is silent. What is the exact runtime
   behavior on surface mismatch: fail the call, fail the plugin, or fail the
   task? Can the attribution claim ("names both bridge plugin and foreign
   tool") be falsified by the bridge itself, which is the only witness?
4. **Constitutional gaps.** One-task law says parallelism is N harness
   instances: which invariant governs host-level resource contention between
   instances, and if none, is the aggregate-resource law vacuous at the host
   level? Development-mode plugin loading exists per the satellites — can it
   bypass the hostile-plugin gate or bridge law? The extraction boundary bars
   consumer types from the core: what mechanism detects a violation
   (nothing in the six checks does)? "Exactly one lifecycle principal" —
   what conformance evidence could prove single-ness rather than assert it?
5. **Reality check.** Verify every file path, count, and claim the design
   makes about the repo. Flag anything it asserts about existing code or
   satellite docs that is false or unverifiable.

## Rules

- Read-only. Do not edit any file, do not create files, do not run the test
  suite, do not commit, do not push.
- Use absolute paths; do not `cd`.
- Do not rewrite the document or propose alternative architectures. Findings
  and fixes only.
- No style or wording findings. No findings about the satellites themselves —
  only about what the design doc claims regarding them.

## Report contract

Print exactly one report between sentinels, nothing after it:

===REPORT-START===
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
SUMMARY: <2-3 sentences: is this design sound enough to build, and what is
the single worst hole>
FINDINGS:
<numbered list, severity-ordered. Each finding exactly four lines:>
  N. [P0|P1|P2|P3] <one-sentence claim>
     EVIDENCE: <verbatim quote> (<file path>)
     ATTACK: <concrete scenario in which the yardstick fails or is gamed>
     FIX: <one sentence>
NON-FINDINGS: <attack surfaces probed that held up, one line each>
===REPORT-END===

P0 = the enforcement mechanism can be gamed or the design contradicts itself
on a load-bearing point. P1 = a real hole with a concrete scenario. P2 =
plausible weakness, scenario requires assumptions. P3 = worth recording.
