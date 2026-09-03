# Hardening report: D8 revision 8 frozen pair

Verdict: **rethink**. The frozen pair has 9 Critical and 6 Important findings after independent verification and cross-review deduplication. It does not satisfy the zero-Critical, zero-Important ratification gate.

Review mode: five blind read-only gpt-5.6-sol lenses, followed by two independent read-only gpt-5.6-sol verifier lenses. This was a seven-seat SOL review, not a cross-model-family review. All seven seats completed against the same hashes.

Target pair:

- D8 goal-execution design: d7e65343f1d893688ae5740b9c2ffde5430708ac
- D8 governed-adaptation boundary: 3b47bc97af3e35b7e4b9076c4be59c64918500fd

Review accounting:

- Raw candidates: 20
- Refuted by the adversarial verifier: 2
- Surviving candidates before deduplication: 18
- Independently duplicated root causes merged: 3
- Final findings: 15
- Verification status: complete

## Critical

- [ ] Cross-kind, cross-owner store disjointness is not authority-proven.
  - Evidence: ArtifactStoreIsolationEvidenceV1 compares other artifact stores, while LoopContentStoreIsolationEvidenceV1 compares the current artifact store and other loop stores. Neither schema proves an owner A artifact store is disjoint from an owner B loop store, despite the broader normative claim. See the D8 specification at lines 1259-1267, 1328-1337, and 1623-1625, plus the boundary at lines 143-152.
  - Failure scenario: two different catalog families resolve an owner A artifact store and owner B loop store to the same backing identity. Both isolation records can say pass, exposing one owner's content through the other store.
  - Correct architecture fix: define one topology-versioned storage-root catalog covering all artifact stores, loop stores, task capabilities, protected roots, credential roots, and consumer-writer roots across owners. Bind its digest into both isolation-evidence records and enforce transactional uniqueness whenever topology changes.
  - Verification: provision cross-kind aliases in both directions, including shared volumes, bind mounts, hard links, and stale-catalog cases. Admission and writes must reject every alias, and topology changes must re-prove or close affected bindings.

- [ ] Encapsulated artifact-only profiles retain ambient authority.
  - Evidence: D8 requires only failed network-egress and outside-directory-write tests at lines 1714-1729 and 2980-2983, while opaque interior effects remain invisible at lines 2112-2118. Higher-precedence architecture requires restricted principal, home, environment, descriptor, IPC, broker, and operator separation at architecture lines 59-64 and 449-457. The existing Codex adapter runs under the admitting owner's login at architecture lines 972-988.
  - Failure scenario: the runtime passes the two D8 tests but reads a credential or private file through ambient owner authority, then discloses it through the already-authorized opaque provider session. D4 cannot observe or govern the hidden read.
  - Correct architecture fix: define a complete encapsulated-effect-envelope profile using a dedicated restricted principal or stronger VM/container boundary. Import admitted inputs by value and deny every other filesystem read/write, environment secret, inherited descriptor, local IPC/control socket, host namespace, process signal, and direct network path. If the runtime cannot satisfy the profile, keep encapsulated execution out of production.
  - Verification: attack every ambient channel from the production launch path, including home and credential reads, environment and descriptor extraction, Unix sockets, daemon/operator endpoints, process/namespace escape, DNS and IP egress, and planted-secret disclosure through later provider turns.

- [ ] Verification authority does not select one executable operation and destination.
  - Evidence: VerificationBindingV1 contains verifier identity/version, subject, predicate, and observation shape at D8 lines 758-759 and 1451-1459. It omits the granted-tool binding, operation, descriptor, effect classification, scope, principal, mutation authority, resolver, destination, and receipt shape required by ToolEffectPermitV1 at lines 779-788. The verification approval arm at lines 2347-2352 omits the same authority.
  - Failure scenario: a verifier plugin exposes both probe and repair, or an external probe can target more than one admitted destination. Two implementations select different operations or destinations from the same task digest, or neither can construct a conforming permit.
  - Correct architecture fix: replace the current binding with a complete GrantedVerificationOperationBindingV1 that selects one exact tool capability, operation, descriptor, class/family/taxonomy, principal, scope, deterministic parameter construction, receipt shape, and local capability or outward resolver/destination set. Carry it through task identity, reservation, approval, permit, receipt, and completion.
  - Verification: reject multi-operation verifier plugins unless one complete operation is selected. Mutating any operation, descriptor, principal, scope, resolver, destination, parameter-construction version, or receipt field must change authority or reject before reservation.

- [ ] Operator confirmation can hide the semantic effect payload behind digests.
  - Evidence: approval subjects contain request digests, parameter references/digests, and verification digests at D8 lines 2329-2352. Only the loop-runtime principal may read referenced bytes at lines 1633-1636. FetchCanonical displays a trusted decoding of the approval structure at lines 2387-2391, but no operator-side reader or schema-bound lossless payload view is defined.
  - Failure scenario: a renderer shows benign text for an outward send-message operation whose referenced body contains harmful content. The trusted channel displays the operation, destination, reference, and digest, but not the body. The operator approves and the harmful parameters execute with every authority check passing.
  - Correct architecture fix: add a versioned canonical approval-view schema. Before challenge issuance, a dedicated read-only operator-channel principal must retrieve and verify the referenced bytes, decode them with the exact admitted schema, and display every authority-bearing value losslessly. Bind the source digest and approval-view digest into the challenge and decision.
  - Verification: vary one semantic payload value while holding operation and destination fixed. The trusted display and bound approval-view digest must change. Missing content, wrong owner/store/kind/schema, digest drift, hidden fields, lossy rendering, and oversized or ambiguous values must receive no challenge.

- [ ] D8 ratification is sequenced before its required successor constitutional baseline.
  - Evidence: higher-precedence Plan A requires a new owner-ratified successor baseline and schema decision before later D8 ratification at Plan A lines 76-81. D8 makes that baseline only a Plan I implementation prerequisite at D8 lines 203-210 and permits D8 ratification to authorize Plan I authoring at lines 3297-3313. The implemented Plan A schema closes dispositions and gates at lines 212-220 and rejects D8 rows or gates outside A-H at lines 501-509.
  - Failure scenario: the pair receives a clean report and the owner ratifies D8. Plan I authoring begins, but no valid successor schema can encode the D8 rows and I/J/K gates. A later baseline can remain merely proposed, leaving implementation without a closed law transition.
  - Correct architecture fix: make D8 ratification atomic with an exact immutable successor-baseline artifact, schema decision, supersession record, complete row mappings, and intended law statuses. If design acceptance must happen first, define a distinct staged state that is not D8 ratification and does not authorize Plan I.
  - Verification: a ratification validator must reject D8 unless the exact pair and successor baseline/schema are reviewed and hash-bound to one owner decision, preserve all Plan A rows byte-identically, encode every D8 row uniquely, and carry consistent law statuses.

- [ ] Approval suspension can stop accounting while another effect remains active.
  - Evidence: journaled effects may settle out of order at D8 lines 1862-1874. A gated reservation can move the whole run to approval-suspended at lines 1980-1991, and the accounting transition closes the sole active interval at lines 2053-2059. No active-effect count, dispatch freeze, cancellation, or quiescence precondition is defined.
  - Failure scenario: action 1 consumes a permit and runs while action 2 enters approval wait. The run closes its accounting interval, action 1 continues uncharged, and a later lease opens with the old accumulator, exceeding maxActiveSeconds.
  - Correct architecture fix: track pending approval gates and active executions in one run-level accounting coordinator. Gate creation must freeze new dispatch authority. Already-consumed effects continue accruing until settlement or cancellation. Zero-accrual suspension begins only when at least one gate is pending and no active execution remains.
  - Verification: race two actions around reservation, consumption, gate creation, receipt, decision, expiry, and crash recovery. Every active interval must charge exactly once, and no lease may reopen while active work or an unresolved suspension reason remains.

- [ ] Cross-epoch accounting debit is implementation-selected.
  - Evidence: accounting records and transition digests carry activeDebitNanoseconds at D8 lines 795-805 and 839-840, but carry no policy identity, checkpoint bound, or recovery formula. Epoch recovery says only to apply a conservative debit bounded by the update interval at lines 2053-2068. The admitted snapshot at lines 2522-2539 does not pin that policy.
  - Failure scenario: identical durable state near budget exhaustion reaches two adapters. One charges the full bound and terminates; another charges less and reopens execution. Both satisfy the prose but produce different authority and transition digests.
  - Correct architecture fix: add an owner-pinned AccountingPolicyBindingV1 to the snapshot and every open interval. Bind the checkpoint-gap bound, units, arithmetic, overflow and saturation behavior, and exact recovery formula.
  - Verification: feed identical lost intervals, registry drift, and boundary budgets through both adapters. Debit records, accumulator values, transition digests, and terminal decisions must be byte-identical across every recovery crash point.

- [ ] Permit consumption has no exact deadline linearization boundary.
  - Evidence: ToolEffectConsumptionV1 records consumptionTime at D8 lines 791-794. The consume CAS at lines 1899-1914 compares expiry but defines neither the trusted sample nor a strict inequality against permitDeadline. Executors stop only after the deadline passes at lines 2069-2084. Approval decisions define equality as expired, but provider and tool permits do not.
  - Failure scenario: consumption linearizes exactly at deadline T. One adapter consumes because time has not passed T; another rejects because T is expired. The same permit bytes grant or deny outward authority.
  - Correct architecture fix: sample consumptionLinearizationTime inside the consume CAS and require it to be strictly less than permitDeadline; equality is expired. Persist the sample for provider and tool permits. Executors refuse new effects and positive evidence at now greater than or equal to the deadline.
  - Verification: race consumption and expiry at T-1, T, and T+1 for provider permits and both tool scopes, including concurrent consumers, response loss, and crashes. Only T-1 may authorize execution.

- [ ] Verification attempts have no durable replay identity.
  - Evidence: OperationIdentityOriginV1 has only model-turn and journaled-action arms at D8 lines 641-644, with derivation defined only for those arms at lines 890-899. Verification can cycle repeatedly at lines 1935-1938, and approval content requires verificationOperationId at lines 2347-2352. No attempt checkpoint, ordinal, or deterministic origin exists.
  - Failure scenario: a verification reservation commits but its response is lost before the generated id is durable. Restart sees verifying, generates another id, and creates a second reservation, effect-slot charge, and possible external probe.
  - Correct architecture fix: add a verification-attempt origin to pnh-operation-id-v1 and a one-writer VerificationAttemptCheckpointV1 committed before reservation. Bind the triggering completion checkpoint, exact verification-binding digest, attempt ordinal, subject, predicate, and observation shape.
  - Verification: kill before and after attempt checkpoint, reservation, permit issue/consumption, receipt, and outcome commitment. One attempt must always replay the same id and charge; a later verification cycle must derive a distinct id.

## Important

- [ ] Content-store references can commit before their bytes are power-loss durable.
  - Evidence: loop and artifact stores specify atomic no-replace installation and readback at D8 lines 1628-1654, but no data flush, directory flush, durable index, or cross-store ordering. Receipts can commit references at lines 1804-1809, and restart relies on those bytes at lines 1876-1881. Higher-precedence architecture requires all-or-none durability at architecture lines 853-866.
  - Failure scenario: rename and readback succeed from cache, settlement commits the reference, then power fails before object and directory durability. Restart has durable authority pointing to missing bytes.
  - Correct architecture fix: define one durable publish protocol: flush object data, atomically install, flush the containing directory or durable index, reopen and verify, then permit settlement to reference it. Add idempotent startup reconciliation for unreferenced objects and referenced-object integrity.
  - Verification: inject power loss and write reordering after every write, flush, install, directory/index update, readback, settlement commit, and acknowledgement. Durable authority must never reference absent bytes.

- [ ] Epoch-loss rejection has no canonical approval-gate state.
  - Evidence: ApprovalGateStatusV1 has only pending, approved-awaiting-permit, rejected-denied, and rejected-expired at D8 lines 589-591, with decision-digest rules at lines 2010-2014. The epoch-loss matrix requires pending and approved/no-permit gates to become rejected at lines 2021-2033 but selects no valid gate variant or payload.
  - Failure scenario: epoch replacement must reject a pending gate. Rejected-denied falsely requires a human decision, rejected-expired denotes a same-epoch deadline transition, and leaving it pending contradicts recovery. Adapters encode different terminal authority.
  - Correct architecture fix: add closed epoch-loss terminal gate variants for pending-without-decision and approved-with-prior-decision. Bind the exact recovery-record digest and define decision-digest nullability, permit treatment, renderer behavior, migration, and evidence for each arm.
  - Verification: recover pending and approved/no-permit gates at every crash point against both adapters. Require one canonical terminal gate, one recovery record, no challenge or permit issuance, and exact replay.

- [ ] Tool receipts do not require replayable observation content.
  - Evidence: D8 requires a readable content reference before broker-receipt commitment at lines 1804-1809. Tool action checkpoints allow nullable observation and feedback references at lines 919-925. Epoch recovery treats a trustworthy tool receipt as enough at lines 2021-2028, and D8-INV-15 repeats the mandatory-reference rule only for broker receipts at line 2819.
  - Failure scenario: an output-bearing tool commits a receipt without content, then the daemon crashes before the action checkpoint. Restart cannot redispatch and cannot reconstruct the exact conversation observation.
  - Correct architecture fix: define a canonical tool-receipt result union with either an immutable tool-observation reference or an explicit descriptor-authorized no-content arm. Output bytes must be durably written and read back before receipt commitment.
  - Verification: kill after tool response, content put, receipt commit, and action checkpoint for local and outward tools. Restart must recover the same content reference and conversation state; missing content settles ambiguous without redispatch.

- [ ] verificationBindingDigest has no canonical digest schema.
  - Evidence: D8 requires generated closed schemas for every authority digest at lines 519-524. VerificationOperationApprovalSubjectV1 carries verificationBindingDigest at lines 777-779, but the declared complete digest list at lines 811-880 defines no VerificationBindingDigestV1 prefix or preimage.
  - Failure scenario: two codecs hash the same verification binding under different domain prefixes or roots. They produce different approval, challenge, decision, and acknowledgement authority for the same task.
  - Correct architecture fix: define VerificationBindingDigestV1 with an exact domain prefix and one VerificationBindingV1 root. Add schema-generation validation requiring every authority Digest field to resolve to a named local or explicitly imported digest contract.
  - Verification: two independent codecs must reproduce the binding and downstream decision digests. Every one-field binding mutation changes the digest; alternate prefixes and root schemas reject.

- [ ] Approval-subject registry mapping is absent from task identity.
  - Evidence: the owner-pinned approval-subject registry determines effect-class-to-subject-arm mapping at D8 lines 2198-2204. TaskDefinitionDigestV1 at lines 817-827 and the admitted snapshot at lines 2522-2539 bind approval classes but not the registry id, schema digest, content digest, or mapping version.
  - Failure scenario: registry R1 maps an effect class to tool-operation while R2 maps it to verification-operation. Both admissions keep the same task digest but require different owner-confirmation semantics.
  - Correct architecture fix: define ApprovalSubjectRegistryBindingV1 with registry id, schema digest, content digest, and canonical keyed mappings. Bind its digest into task identity, admitted snapshot, approval provenance, and decision validation.
  - Verification: mutate one mapping, registry schema, order, or duplicate key. The mutation must change task identity or reject admission, and restart must reconstruct the original mapping exactly.

- [ ] Artifact emission kind and patch schema form invalid canonical combinations.
  - Evidence: ArtifactEmissionKindV1 defines immutable-bytes and typed-patch at D8 lines 584-585. ArtifactEmissionRecordV1 encodes that kind beside an independently nullable typedPatchSchemaDigest at lines 704-707 and 1278-1288. D8 closes analogous permit nullability at lines 882-887 but has no emission rule.
  - Failure scenario: typed-patch carries null, or immutable-bytes carries a patch schema. Both values decode canonically, but consumers assign contradictory evidence roles.
  - Correct architecture fix: replace the enum-plus-nullable product with a closed ArtifactEmissionPayloadV1 union: immutable bytes with an empty payload, or typed patch with one mandatory schema digest.
  - Verification: both codecs must accept the two legal arms and reject null, mismatched, or unknown arms before store write or evidence commitment.

## Minor

None.

## Refuted during verification

- Pinned D9 still blocks L1 on Plan K. Refuted because the target pair is higher precedence, explicitly places Plan K outside D8, and allows L1 after Plan J; the pinned D9 draft itself says conflicts resolve in favor of D8 and the boundary.
- D8 and D9 both own the authoritative quarantine transition. Refuted because the target pair limits D8 to untrusted candidate artifacts and assigns packaging and quarantine to D9, whose one-writer transition remains the only authoritative quarantine state.

## Ratification assessment

This exact pair fails its ratification gate. All 15 findings above block ratification under the pair's own zero-Critical, zero-Important requirement. The target bytes remained unchanged throughout review.

## Review coverage

- Full D8 Sections 1 through 19.6 and boundary Sections 1 through 5
- Higher-precedence architecture, architecture hardening, invariant-law amendment, and Plan A constitutional correction
- Authority and destination confinement
- Canonical codec, digest identity, role and registry binding
- Approval display, challenge, decision, and replay
- Provider, local, outward, and verification effect identity
- Accounting, permit deadlines, epoch recovery, crash and power-loss behavior
- Artifact and loop-store isolation and durability
- D8-to-D9 handoff, Plan ownership, and ratification sequencing
