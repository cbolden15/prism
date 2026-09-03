# Prism Harness architecture design hardening review

Date: 2026-08-26

Review target: `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md`

## 1. Overall verdict

**Verdict: rethink. Do not ratify the current draft or authorize Plan A authoring from it.**

The design has a strong module decomposition, but three authority and effect-safety gaps break claims at the center of the architecture:

1. Policy code must execute before it has a ticket-bound execution class or a defined custody state.
2. `trusted-subprocess-v1` may produce production evidence while retaining ambient access to authority that the binding registry says plugins and workers must never receive.
3. A serialized dispatch permit can be consumed concurrently because issuance is durable but consumption is not an atomic durable transition.

These are not implementation details. They affect the single authority root, production execution classes, and exactly-once external effects. Ten additional gaps affect recovery, machine-service authority, proof closure, and release readiness.

| Result | Count |
|---|---:|
| Critical survivors | 3 |
| Important survivors | 10 |
| Minor survivors | 0 |
| Unique surviving root causes | 13 |
| Raw findings killed | 1 |
| Raw findings merged | 2 |

## 2. Ranked surviving findings

### Critical 1: Policy execution has no admitted execution or custody state

Merged findings: `SEC-AUTH-01`, `MIC-01`.

Evidence:

- `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:337`, Section 13.1 executes Policy plugins at step 7.
- The same file at `:339` binds execution classes at step 9 and at `:340-343` creates custody and the durable admitted run at steps 10 and 11.
- The same file at `:433-437`, Section 13.6 requires executor selection to come from the admitted plugin binding.
- `historical-worktree/pnh/contracts/invariants.yaml:58-78` makes the single ticket the authority root and requires Policy success before non-Policy grant derivation.

Failure scenario:

1. D1 validates a pinned Policy plugin through admission step 6.
2. D1 must execute that plugin at step 7.
3. No execution binding, host allocation, ownership lease, durable run state, or failure-recovery state exists yet.
4. An implementation must either use an ambient or caller-coordinated executor, or create partial production authority before Policy has approved grant derivation.
5. The first path bypasses the ticket-derived executor rule. The second path contradicts the claim that admission failure creates no partial production authority.

Affected: D1, D2, D4; Plans B, C, D; PNH-INV-04, 05, 10, 11, 29, 34.

Why the draft does not handle it: the design orders Policy correctly relative to grants, but does not solve the Policy bootstrap problem. Moving step 9 before step 7 fixes class selection but still leaves execution without custody and durable failure semantics.

Exact sections to amend: Sections 13.1, 13.3, 13.7, 14.2, 15.3, 15.10, 20.1, Plans B through D, and Section 25.

Smallest correction: define a restricted `policy-evaluation` phase. D1 must validate and bind Policy artifacts before execution, obtain a Policy-only custody allocation, and persist a non-runnable evaluation state. Policy success may atomically promote the same identity into admitted production state. Failure or lost acknowledgement must expire or reject that state without granting non-Policy authority. Plan B may pin these contracts first, but it cannot close its production-path gate until the C/D implementation exists.

### Critical 2: `trusted-subprocess-v1` contradicts binding ambient-authority and credential rules

Finding: `SEC-AUTH-02`.

Evidence:

- `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:406-410`, Section 13.4 permits `trusted-subprocess-v1` to produce production evidence while ambient host authority remains available.
- The same file at `:511-528` does not require a separate OS principal or credential namespace for plugin execution.
- The same file at `:832-846` uses the trusted Mac user's Codex login for the D3 broker.
- `historical-worktree/pnh/contracts/invariants.yaml:148-202` says worker code is untrusted, ambient state never confers authority, and provider sessions and endpoints are held only by trusted brokers.

Failure scenario:

1. An owner-pinned plugin is admitted as `trusted-subprocess-v1` under the logged-in Mac user.
2. The plugin receives no broker handle, but it can inspect or invoke host-local authority reachable by that user.
3. It invokes Codex directly, accesses a session surface, or reaches another local authority endpoint.
4. The effect bypasses D4 reservation, permit, receipt, and settlement while the run remains eligible for production evidence.

Affected: D1, D2, D3; Plans B, C, E; PNH-INV-10, 11, 13, 30, 31, 43.

Why the draft does not handle it: pinning proves artifact identity. Disclosure describes risk. Neither one removes ambient authority. The proposed amendments to PNH-INV-25 and 27 do not resolve conflicts with PNH-INV-10, 11, or 13.

Exact sections to amend: Sections 4, 10, 13.3 through 13.6, 14.3, 16.1 through 16.3, 18.5, Plans A, B, C, and E.

Smallest safe correction for the first release: remove `trusted-subprocess-v1` from production plugin execution and keep it development-only. A future production subprocess class must be an explicit trusted-computing-base boundary with a separate restricted OS principal that cannot access provider sessions, daemon operator channels, publisher credentials, or arbitrary user files.

Correct-architecture option: define dedicated service and execution principals, per-principal filesystem and IPC ACLs, user-to-broker delegation, and production proof that the subprocess principal cannot reach broker or publisher authority. This is larger, but it is the architecture required if production subprocess support is a product requirement.

### Critical 3: Dispatch permit consumption is not durably one-use

Finding: `DSP-01`.

Evidence:

- `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:640-661`, Section 15.4 atomically issues a permit but delegates reuse rejection to D3.
- The same file at `:801-807`, Section 16.2 treats fresh issuance as sufficient for repeated runtime calls.
- `historical-worktree/pnh/contracts/invariants.yaml:720-730` requires every authenticated command, response, and receipt to be replay-resistant.

Failure scenario:

1. D4 commits `dispatching` and returns a serialized permit.
2. Duplicate authenticated delivery, broker overlap during restart, or two workers with the same broker identity receive that permit.
3. D3 has no specified durable shared consume record or atomic compare-and-set.
4. Both workers pass a process-local reuse check and invoke the provider.
5. D4 can keep one terminal record, but cannot undo the duplicate external effect.

Affected: D3, D4; Plans D, E; PNH-INV-06, 07, 45.

Why the draft does not handle it: `claimDispatch` makes issuance one-use. It does not make a delivered capability one-use across concurrency and restart.

Exact sections to amend: Sections 15.2, 15.4, 15.9, 15.10, 16.2, 20.2, Plan D, and Plan E.

Smallest correction: add a D4-owned durable `consumeDispatchPermit` compare-and-set bound to permit, reservation, broker principal, request digest, and expiry. Only the first successful consume may authorize the provider call. A consumed permit without a trustworthy receipt recovers as `ambiguous`. Require concurrent-consumer, replay, and crash-before/after-consume tests.

### Important 1: Committed activation can be lost before authority issuance

Merged findings: `DSP-02`, `MIC-02`.

Evidence: `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:340-343`, `:499-506`, and `:766-778`.

Failure scenario: the daemon commits ownership, an admitted record, and a checkpoint, then the response is lost before D1 returns `AdmittedRun`. Retry has no stable activation request identity or lookup contract. It can mint a duplicate identity, be rejected forever by the orphan, or leave quiesce blocked by a run no caller can control.

Affected: D1, D2, D4; Plans B, C, D; PNH-INV-04, 06, 32.

Exact sections to amend: Sections 12, 13.1, 14.2, 15.3, 15.10, 20.1, Plans B through D.

Smallest correction: add a durable activation request ID and an `activation-pending-ack` state. Replaying the same request returns the original identities. Expiry, rejection, rehydration, quiesce, and recovery must explicitly handle unacknowledged activation without minting a second ticket.

### Important 2: Broker provenance is absent from admission and observation

Finding: `MIC-03`.

Evidence: the admitted-run and execution-binding fields at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:374-397`, permit rules at `:655-661`, broker request and observation fields at `:809-825`, and mock parity at `:848-850`.

Failure scenario: a production reservation is passed to a deterministic mock or another non-production broker implementation. The adapter returns a matching route, model, digest, telemetry, and receipt shape. D4 has no admitted broker principal or evidence-environment binding against which to reject it, so mocked work can become production evidence.

Affected: D1, D3, D4; Plans B, D, E; PNH-INV-08, 13, 14, 45.

Exact sections to amend: Sections 12, 13.2, 15.4, 16.2, 16.3, 20.2, Plans B, D, E.

Smallest correction: bind broker principal, adapter identity, protocol version, and evidence environment into admission, reservation, permit, and observation. Authenticate that principal at D4. Mock principals must be unable to claim production reservations.

### Important 3: Machine-scoped custody authenticates local peers but does not authorize them

Finding: `DX-REL-02`.

Evidence: `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:455-462` requires one machine daemon across local accounts; `:511-528` requires peer authentication but defines no user authorization; `:458-460` permits user-scoped Codex brokers.

Failure scenario: user B on the same Mac is a valid local peer. The draft does not say whether B may submit runs, see A's status or evidence, operate quiesce, or delegate to B's broker. Allowing access crosses owner domains. Denying it without a defined policy fails the supported machine-service contract. Starting a per-user daemon violates the singleton and host-budget claims.

Affected: D2, D3; Plans C, E; PNH-INV-13, 33, 35.

Exact sections to amend: Sections 4, 10, 14.1 through 14.3, 16.3, 19.3, Plans C, E, G.

Smallest correction: define a supported local authority domain: daemon service identity, authorized users or groups, peer-to-owner binding, socket and database ACLs, operator authorization, evidence visibility, and user-broker delegation. Add unauthorized-local-account tests.

### Important 4: Daemon singleton does not fence a paused predecessor

Finding: `DSP-04`.

Evidence: `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:450-471` and `:748-760`; `historical-worktree/pnh/contracts/invariants.yaml:502-518`.

Failure scenario: daemon A pauses while retaining container-runtime authority. The service manager starts daemon B. SQLite serializes ledger writes, but cannot fence A from external create, kill, or cleanup actions. The two processes can produce conflicting lifecycle effects and cleanup evidence.

Affected: D2, D4; Plans C, D; PNH-INV-33, 34, 35.

Exact sections to amend: Sections 14.1, 14.3, 14.6, 15.9, 15.10, Plan C, Plan D.

Smallest correction: combine an OS singleton guard with a durable daemon epoch. Every privileged lifecycle action and confirmation carries the current epoch. A replacement must fence the old epoch and reconcile externally tagged resources before admission reopens.

### Important 5: Lease expiry has no restart-safe clock model

Finding: `DSP-03`.

Evidence: ownership `expiresAt` at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:530-548`, capacity expiry at `:550-566`, and recovery at `:766-778`.

Failure scenario: a lease is persisted, the owner dies, and the host clock rolls back before daemon restart. Comparing persisted wall time against the rolled-back clock keeps dead ownership and capacity alive. New work is rejected and quiesce can remain blocked indefinitely.

Affected: D2, D4; Plans C, D; PNH-INV-35, 37.

Exact sections to amend: Sections 14.4, 14.5, 15.9, 15.10, Plan C, Plan D.

Smallest correction: use monotonic deadlines only within a daemon incarnation. Persist the daemon or boot epoch, conservatively expire prior-epoch leases on restart, and test clock rollback, reboot, delayed heartbeat, and recovery.

### Important 6: The installed daemon has no executable service lifecycle contract

Finding: `DX-REL-03`.

Evidence: installed mode at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:464-471`, database migration safety at `:748-764`, the clean-uninstall risk control at `:1408-1412`, and Plan G at `:1316-1331`.

Failure scenario: an engineer installs the daemon, later upgrades or uninstalls it, and encounters active or ambiguous effects. No contract specifies quiesce, migration rollback, launchd deregistration, data preservation, purge authorization, reinstall, or evidence retention. Cleanup may destroy unresolved evidence or leave privileged service artifacts behind.

Affected: D2, D4, D7; Plans C, D, G; PNH-INV-16, 33, 35.

Exact sections to amend: Sections 14.1, 15.9, 15.10, 19.3, 19.4, 23.5, Plan G.

Smallest correction: define explicit install, doctor, upgrade, rollback, uninstall-preserve, and uninstall-purge operations. Require blocker handling, data ownership and retention rules, and clean-Mac install/upgrade/uninstall/reinstall tests.

### Important 7: Ratification does not freeze the Plan A proof and amendment baseline

Finding: `CPP-01`.

Evidence: enforcement kinds at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:891-904`, amendment directions at `:959-968`, Plan A at `:1213-1227`, and the registry root at `historical-worktree/pnh/contracts/invariants.yaml:1`.

Failure scenario: after ratification, a Plan A author assigns enforcement kinds and writes replacement text for PNH-INV-25, 27, and 38. Materially different proof obligations and legal statements fit the current directional wording. The owner gate occurs after the plan's work, so the architecture baseline used to author that plan was not selected by this ratification.

Affected: D6; Plan A; all 46 invariants, especially PNH-INV-09, 25, 27, 38.

Exact sections to amend: Sections 4, 18.1, 18.5, 24 Plan A, and 30.

Smallest correction: attach or reference a ratified baseline that maps all 46 invariants to enforcement kind and first-release disposition, and gives exact replacement text for PNH-INV-25, 27, and 38. Plan A may implement and lock that baseline, but may not choose it.

### Important 8: Active PNH-INV-22 can outlive its execution-class proof

Finding: `CPP-02`.

Evidence: active PNH-INV-22 at `historical-worktree/pnh/contracts/invariants.yaml:331-345`; class-specific reproof at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-invariant-module-architecture-matrix.md:176` and `:654-659`; reopening list at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:941-957`.

Failure scenario: Plan A reopens PNH-INV-23 and 29 but leaves 22 active. Plan B adds a new production execution class. Plans B and C can meet their named exit gates without rerunning PNH-INV-22 against every class, leaving the registry's universal active claim backed by old evidence.

Affected: D1, D2, D6; Plans A, B, C, F; PNH-INV-22.

Exact sections to amend: Sections 18.4, Plan A, Plan B, Plan C, Plan F.

Smallest correction: reopen PNH-INV-22 in Plan A before new classes exist, then require class-specific production-path proof and explicit reactivation at the B/C integration gate.

### Important 9: Plans F and G can close around a self-selected first-release claim set

Finding: `CPP-03`.

Evidence: the matrix's resolution rule at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-invariant-module-architecture-matrix.md:14-19`; Plan F and G gates at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:1302-1331`; proposed-proof meaning at `historical-worktree/docs/plans/provider-neutral-harness/constitution.md:697-703`.

Failure scenario: a non-D5 safety invariant remains proposed after Plan E. Plan F excludes it from “intended first-release claims.” Plan G checks packaging but not the full registry disposition. The product becomes release-ready without proof, explicit deferral, or a reduced-support posture for that invariant.

Affected: D3, D4, D6, D7; Plans F, G; all 46 invariants, especially non-D5 BUILD entries such as PNH-INV-45.

Exact sections to amend: Sections 18.6, 19.4, Plan F, Plan G, Sections 26 and 27.

Smallest correction: ratify an all-46 first-release disposition manifest. Plan F must verify every entry as active, explicitly deferred, or disclosed unsupported. Plan G must reject release readiness when any entry is outside its allowed disposition.

### Important 10: Release scanning does not explicitly cover published Git history

Finding: `DX-REL-01`.

Evidence: the binding matrix requires history secret scanning at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-invariant-module-architecture-matrix.md:174`; Section 19.4 at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:1034-1045` names an unscoped secret scan.

Failure scenario: a credential or private artifact is deleted from the current tree but remains reachable from a ref that will become public. Checkout and package scans pass. Repository visibility changes, exposing the historical object and violating PNH-INV-20.

Affected: D7; Plan G; PNH-INV-20.

Exact sections to amend: Sections 19.4, 19.6, 23.5, Plan G.

Smallest correction: declare whether the standalone repository starts from a fresh root or retains sanitized history. Before publication, scan every object and ref reachable from the repository that will be exposed. Any finding blocks visibility change and package publication.

## 3. Findings killed or merged by verification

### Killed: `DX-REL-04`, Plan E observed-model exit gate

Both verifiers found a concrete guard at `historical-worktree/docs/plans/provider-neutral-harness/2026-08-26-prism-harness-architecture-design-spec.md:860-862`. Plan E must prove trustworthy observed-model identity. If it cannot, the adapter is restricted to a non-production acceptance example and cannot satisfy exact-route completion. The narrower wording in the Plan E exit paragraph does not override this explicit module requirement or the general milestone rule in Section 26.

### Merged: `MIC-01` into `SEC-AUTH-01`

Both describe the same pre-binding Policy execution root cause. The merged finding preserves the custody, evidence, and Plan B/C/D dependency consequences from `MIC-01`.

### Merged: `MIC-02` into `DSP-02`

Both describe the same committed-but-unacknowledged activation state. The merged finding preserves idempotent replay, orphan recovery, and rehydration requirements.

## 4. Cross-finding root causes

| Root cause | Findings | Decisions | Plans | Invariants |
|---|---|---|---|---|
| Authority is named but not bound before use | Policy bootstrap, trusted subprocess, broker provenance, local-user authorization | D1, D2, D3, D4 | B, C, D, E | 04, 05, 08, 10, 11, 13, 14, 29, 30, 31, 34, 45 |
| Database atomicity stops at RPC and process boundaries | Permit consumption, activation acknowledgement, daemon split brain, lease clock | D1, D2, D3, D4 | B, C, D, E | 04, 06, 07, 32, 33, 34, 35, 37, 45 |
| Program gates are not closed over the binding registry | Proof baseline, PNH-INV-22 reproof, first-release manifest, history scan | D1, D2, D6, D7 | A, B, C, F, G | all 46, especially 20, 22, 25, 27, 38, 45 |
| The machine service is specified as a topology, not a product lifecycle | User authorization, split-brain fencing, restart clocks, install and uninstall | D2, D3, D4, D7 | C, D, E, G | 13, 16, 33, 34, 35, 37 |

## 5. Ratification recommendation

**Recommendation: rethink, amend, and rerun hardening before ratification.** The current five choices are not sufficient.

A sixth owner decision is required at minimum: **select the supported local OS authority domain.** It must settle both production subprocess eligibility and machine-daemon tenancy.

Options:

1. **Smaller first release, recommended:** remove `trusted-subprocess-v1` from production, authorize one explicit local owner account to submit and operate runs, deny other local accounts, and keep the machine daemon as the sole host lifecycle principal. Public claims must state this support boundary.
2. **Correct multi-user architecture:** run the daemon under a dedicated service principal, define per-user owner domains and evidence partitions, delegate to user-scoped brokers through authenticated ACLs, and run any production subprocess under a separate principal that cannot access user sessions or operator and publisher authority.

The current option, production subprocesses under a user with disclosed ambient authority and an unspecified cross-user daemon policy, is not ratifiable.

## 6. Plan A through G dependency recommendation

Plans A through G remain the smallest useful ownership slices, but their closure order must change:

```text
Plan A: ratified proof/disposition baseline and honest reopenings
   |
   v
Plan B1: pin D1 identity, Policy-evaluation, activation, and broker-binding contracts
   |
   +-------------------+
   v                   v
Plan C: custody     Plan D: settlement
   +-------------------+
             |
             v
Plan B2/C/D integration: close the real Policy and activation production path
             |
             v
Plan E: trusted broker and durable permit consumption
   |
   v
Plan F: all-46 activation/disposition audit
   |
   v
Plan G: service lifecycle and release readiness
```

Plan B may begin before C and D to pin contracts. It must not close before the C/D integration gate proves Policy execution, activation acknowledgement, generation fencing, and recovery through production adapters. Plan E still follows D, but D and E share an explicit durable permit-consumption contract before either closes.

## 7. Exact next editing sequence

1. Amend Sections 4, 13.4, and 14.1 with the sixth owner choice for subprocess production eligibility and local-user authority.
2. Amend Sections 13.1, 14.2, 15.3, and 15.10 with the Policy-evaluation phase and idempotent activation acknowledgement.
3. Amend Sections 14.3 through 14.5, 15.4, and 16.2 with daemon epochs, restart-safe lease clocks, broker provenance, and atomic permit consumption.
4. Amend Sections 18, 19, and 24 through 27 with the all-46 baseline, PNH-INV-22 reopening, revised B/C/D closure order, service lifecycle gate, and history scan.
5. Run the same five-lens and two-verifier hardening pass on the amended draft before recording ratification.

## 8. Review integrity

The review used repository-local evidence only. No web research, live provider, external advisor, saved `harden` workflow, source edit, specification edit, installation, commit, push, or publication occurred.

All agents used `fork_context: false`, model `gpt-5.6-terra`, and reasoning effort `high`.

| Pass | Lens | Agent | Result |
|---|---|---|---|
| Review | Security and authority | Hooke, `01a04143-ff9b-7753-917d-0e87aae0ad49` | Completed |
| Review | Distributed systems and persistence | Volta, `01a04144-0047-7c52-955a-6e270db024e4` | Completed |
| Review | Module and interface correctness | Locke, `01a04144-00c5-7123-ad1c-cb2a5fba2eba` | Completed |
| Review | Developer experience and open-source release | Kant, `01a04144-0145-7fe2-80f9-f67ddcb8a9a8` | Completed |
| Review | Constitution, proof, and program plan | Curie, `01a04144-01c1-70b0-83e0-3073fc3262e9` | Completed |
| Verify | Evidence verifier | James, `01a04148-f48f-76b1-b42a-ffa6fd18dd9f` | Completed all 16 rows |
| Verify | Architecture verifier | Chandrasekhar, `01a04148-f53a-76a3-887f-76ed9086ffcf` | Completed all 16 rows |

Failed agents: none. Both verification passes completed. Both verifiers independently agreed on the killed finding and the two merges.
