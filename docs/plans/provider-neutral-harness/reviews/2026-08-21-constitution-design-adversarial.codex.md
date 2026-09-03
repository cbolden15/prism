# Codex adversarial review — PNH constitution design

Reviewer: Codex GPT 5.6 SOL MAX, run by owner 2026-08-21 via
`2026-08-21-constitution-design-adversarial.prompt.md`.
Reconciliation: applied to the design doc the same day (see git log).

STATUS: DONE_WITH_CONCERNS
SUMMARY: The design is not sound enough to build: its six checks establish
self-consistency, not constitutional conformance. The worst hole is their
closed-world trust in the mutable registry, which permits deleting or
weakening law, regenerating the document, and keeping CI green.

FINDINGS:

1. [P0] The conformance test has no external inventory, so omitted or deleted
   invariants and protocols are indistinguishable from compliance.
   EVIDENCE: "No active invariant has zero conformance entries (orphan rule)."
   (2026-08-21-pnh-constitution-design.md)
   ATTACK: Replace a critical invariant with a harmless tagged entry, or
   introduce the cell port without registering it; all six checks still pass
   because they inspect only entries that remain in the registry.
   FIX: Pin a reviewed required-ID and protocol inventory, then require
   diff-aware amendments for every addition, retirement, deletion, or
   protocol introduction.

2. [P0] Binding registry changes self-ratify because no check requires
   amendment metadata when statements, statuses, bounds, or versions change.
   EVIDENCE: "Amended entries carry an amendments list (date plus decision
   link)." (2026-08-21-pnh-constitution-design.md)
   ATTACK: Change max_cross_plugin_stall_ms from 50 to 5000, omit an
   amendment, let tests import 5000, and regenerate the constitution; schema,
   tests, drift, and amendment-log generation all remain green.
   FIX: Compare against the last released registry and reject every
   binding-field change lacking a dated, existing amendment decision.

3. [P0] Literal ID search and path existence measure tags rather than
   executed conformance.
   EVIDENCE: "Every listed file contains the invariant's ID string."
   (2026-08-21-pnh-constitution-design.md)
   ATTACK: Point every active invariant at one test.skip file containing all
   IDs in comments; checks 2 through 4 pass and Node exits successfully
   without exercising any invariant.
   FIX: Require runner-reported execution of registered invariant assertions,
   reject skipped or TODO coverage, and mutation-test each mapped invariant.

4. [P0] Check 1 lacks required semantic integrity for unique IDs,
   cross-references, and real amendment decisions.
   EVIDENCE: "id is permanent. Retired invariants keep their ID with status:
   retired and a pointer to the amending decision; IDs are never reused."
   (2026-08-21-pnh-constitution-design.md)
   ATTACK: Supply two structurally valid entries sharing one ID or retire an
   entry using a syntactically valid nonexistent decision path; unknown-field
   rejection does not catch either case.
   FIX: Mandate a semantic validation pass for global uniqueness, valid
   status transitions against the baseline, resolvable references, and
   existing decision files.

5. [P0] Byte-for-byte regeneration cannot detect normative contradictions in
   handwritten narrative.
   EVIDENCE: "Invariant statements and the conformance chapter are generated,
   so prose and registry cannot disagree."
   (2026-08-21-pnh-constitution-design.md)
   ATTACK: Add "plugins may widen grants" outside generator markers;
   regeneration preserves that paragraph byte-for-byte while every generated
   invariant remains unchanged.
   FIX: Generate every normative clause from the registry and restrict
   handwritten sections to explicitly nonnormative explanation.

6. [P0] Protocol pinning neither compares protocol semantics nor covers the
   actual container-broker command schema.
   EVIDENCE: "The container broker protocol is pinned with its existing
   schema source (pnh/sdk/protocol.ts) and at least one proving test."
   (2026-08-21-pnh-constitution-design.md)
   ATTACK: Change supervisor COMMAND_KEYS or broker framing while leaving the
   plugin-application PLUGIN_PROTOCOL_VERSION and a spec declaration at 1;
   the six checks see no mismatch.
   FIX: Give each wire boundary its own canonical schema source, version, and
   schema hash, then compare generated specifications and executable
   encode/decode fixtures.

7. [P0] The declared success gate conflicts with both the declared scope and
   the current mandatory suite.
   EVIDENCE: "The current M3 isolation suite is intentionally red at 0/8
   because one global supervisor queue blocks unrelated plugins during
   failing cleanup." (2026-08-21-m3-plugin-isolation-architecture-options.md)
   ATTACK: The current PNH runner auto-discovers that suite, while the design
   excludes implementing M3 and the package has no npm test script, so the
   stated green full-suite criterion cannot be reached in scope.
   FIX: Sequence constitution completion after M3 is green, and explicitly
   wire the conformance test into the real test:pnh command.

8. [P0] Bridge surface enforcement and foreign-tool attribution rely on the
   ordinary untrusted bridge being a truthful witness.
   EVIDENCE: "evidence attribution names both the bridge plugin and the
   foreign tool invoked." (2026-08-21-pnh-constitution-design.md)
   ATTACK: A malicious bridge registers read_file, invokes a hidden
   destructive MCP method inside its container, and reports read_file; the
   host observes only the bridge's claim.
   FIX: Mediate the MCP wire and produce foreign-method evidence in a trusted
   runner component outside bridge-controlled code.

9. [P0] Parallel harness instances make the "exactly one" lifecycle principal
   and aggregate arbiter laws undefined at host scope.
   EVIDENCE: "Exactly one lifecycle principal, stated substrate-neutrally." /
   "Concurrency belongs to the consumer control plane; parallelism means N
   harness instances." (2026-08-21-pnh-constitution-design.md)
   ATTACK: Two individually conforming harness instances start separate
   supervisors and each consume its full aggregate allowance, yielding
   multiple Docker writers and host exhaustion without violating either
   instance-local check.
   FIX: Make lifecycle authority and aggregate arbitration host-scoped shared
   services with per-instance identities and quotas.

10. [P1] The frozen MCP surface covers tools only and leaves resources and
    prompts ungoverned.
    EVIDENCE: "the exact tool names and schemas are captured in the admitted
    registration" (2026-08-21-pnh-constitution-design.md)
    ATTACK: An admitted server keeps its tool list stable but exposes a new
    resource reader or prompt that the bridge invokes to ingest undeclared
    data.
    FIX: Enumerate, freeze, grant, and evidence every allowed MCP method
    family, default-denying resources, prompts, subscriptions, and extensions
    not explicitly admitted.

11. [P1] "Fails closed" does not define when surface comparison occurs or
    whether mismatch fails the call, plugin, or task.
    EVIDENCE: "runtime surface drift fails closed (undeclared tools are
    unavailable; a mismatch is evidence-logged)."
    (2026-08-21-pnh-constitution-design.md)
    ATTACK: A server changes a declared schema after an earlier side effect;
    an implementation can log the mismatch, fail only the next call, and
    still settle the task successfully.
    FIX: Require canonical comparison before every dispatch, fail the plugin
    allocation and task on mismatch, and classify any post-dispatch discovery
    as ambiguous.

12. [P1] The constitution does not reconcile development plugin loading with
    the absolute hostile-plugin gate.
    EVIDENCE: "A separate development mode may load local plugins for
    authoring and tests. It must be visibly distinct and unable to produce
    production evidence." (architecture.md)
    ATTACK: A local unreviewed plugin runs in the ordinary container during
    development, either bypassing the microVM admission rule or making the
    documented development mode constitutionally illegal.
    FIX: Define development loads as non-admitted execution that cannot
    invoke bridges or privileged effects and cannot emit production evidence;
    otherwise apply the hostile-plugin gate.

13. [P1] The exemplar's concrete proving-test path does not exist in the
    repository.
    EVIDENCE: "- pnh/tests/plugin-sdk-types.test.ts"
    (2026-08-21-pnh-constitution-design.md)
    ATTACK: Implementing the shown registry immediately fails path check 2,
    while the actual repository test is named pnh/tests/plugin-protocol.test.ts.
    FIX: Reference the actual semantically relevant test or explicitly add
    the intended proving test as an artifact.

14. [P1] The exemplar isolation suite labels cleanup calls as protocol and
    malformed-output faults without injecting either fault.
    EVIDENCE: "return supervisor.cleanup({ ...FAULT, trigger: \"broker-stop\" });"
    (pnh/tests/m3-plugin-fault-isolation.test.ts)
    ATTACK: Fixing the global queue makes the "protocol failure" and
    "malformed output" cases pass even if parsing remains globally shared and
    malformed bytes still cause cross-plugin failure.
    FIX: Drive real malformed and protocol-invalid bytes through the
    production parser and assert unrelated allocation, accounting, channel,
    and evidence behavior.

NON-FINDINGS:
- Chapter numbering remains coherent at 1 through 14 after the bridge-law
  insertion.
- All four satellite paths and the other three mandated ground-truth code
  paths exist.
- The M3 suite contains exactly eight cases, and the supervisor's single
  global queue corroborates the stated failure mechanism without running
  tests.
- The current launch profile pins network to none and launch-spec validation
  enforces it, blocking direct bridge-server egress in the present
  implementation.
- Remote MCP admission is explicitly excluded rather than silently left
  undefined.
