# Prism Harness AGE-5 Human Decision and Completion contract specification

Date: 2026-08-27

Owner: Vora Technologies, LLC

Status: draft contract, not ratified and not implementation authority

Accepted architecture object:
`5fc1443f9d8e740d4811a02d9e3a5dd637a12184`

## 1. Purpose

AGE-5 defines the only path by which a human decision can authorize an
already admitted effect and the only policy path by which an admitted run can
become terminal.

It constructs complete approval subjects, produces lossless canonical
operator views, accepts authenticated decisions, interprets exact verification
receipts, evaluates completion, and supplies closed commands that D4 may use to
commit one immutable terminal result. It also defines cancellation and a
separate append-only path for trustworthy observations that arrive after the
terminal result.

AGE-5 does not execute effects, hold credentials, publish bytes directly, or
write D4 state. Verification uses AGE-2 coordination, AGE-3 effect authority,
and AGE-4 content custody. Only D4 performs approval, effect-state, evidence,
and terminal mutations.

## 2. Source of truth and precedence

This contract is subordinate to:

1. runtime authority and project instructions;
2. the accepted autonomous goal-execution architecture with Git object
   `5fc1443f9d8e740d4811a02d9e3a5dd637a12184`;
3. the architecture acceptance record with Git object
   `d47455756eac691c5cc8b3dc0aa774f6f04c2227`;
4. the AGE-1 contract draft with Git object
   `4c376d39a36e63699ea6bc43d09b89d9291fd4cf`;
5. the AGE-2 contract draft with Git object
   `9e27a9454db85bfea51b3679b863b1803778a613`;
6. the AGE-3 contract draft with Git object
   `d69a56b2a3acb9464c16668b56282cf2881bdac9`; and
7. the AGE-4 contract draft with Git object
   `adf893bf8f7e79a19d89dfc421af00d78100ae47`.

This document may define AGE-5 fields, pure policy evaluation, and closed D4
commands. It may not reassign ownership held by AGE-1 through AGE-4 or D1
through D7.

The frozen D8 revision 8 pair remains retired historical evidence. It is not
an active design source and remains byte-identical.

## 3. Scope

AGE-5 owns:

- reusable approval-policy and completion-policy bindings;
- complete approval subjects and canonical lossless approval views;
- approval gates, challenges, authenticated decisions, and gate evidence;
- strict decision deadline, first-winner, replay, and epoch-loss semantics;
- verification-subject contracts, predicates, result mappings, and finite
  attempt policy;
- verification parameter production and observation interpretation;
- completion requests, evaluations, terminal evidence, and result schemas;
- authenticated cancellation and its interaction with open effects;
- supplemental late-observation identity and append rules;
- restart behavior for every AGE-5 nonterminal state; and
- the AGE-5 adapter conformance suite.

## 4. Non-goals and ownership exclusions

AGE-5 does not own:

- task templates, goal admission, or admitted-run construction, which belong
  to AGE-1;
- model turns, proposal parsing, proposal order, conversation replay,
  coordinator modes, or run-operation construction, which belong to AGE-2;
- grants, effect classification, destination resolution, budgets, deadlines,
  reservations, permits, execution, receipts, or effect recovery, which belong
  to AGE-3;
- content bytes, publication durability, references, reads, retention, or
  deletion, which belong to AGE-4;
- D4 approval, effect-state, evidence, or terminal writes;
- credentials, provider routing, local capability handles, destination-writer
  handles, or verifier executor handles; or
- work-program selection, governed adaptation, external observability,
  artifact application, installation, deployment, release, publication, or
  AGE-6.

An approval view, operator decision, verification pass, completion proposal,
terminal artifact, late observation, or natural-language explanation grants no
authority outside the exact AGE contracts it references.

## 5. Contract vocabulary

| Term | Meaning |
|---|---|
| Approval policy | Template-bound mapping from a gateable AGE-3 effect class to one exact subject constructor, lossless view contract, eligible operator roles, and challenge policy |
| Approval subject | Complete by-value description of one reserved effect, including every authority-bearing semantic value the operator must decide on |
| Canonical approval view | Lossless structured representation of the subject, with complete value coverage and verified AGE-4 source reads |
| Approval gate | D4 record attaching one subject and view to one AGE-3 reservation under exact epoch-local deadlines |
| Approval challenge | Read-only operator-channel presentation identity for one gate; it is not a bearer capability |
| Approval decision | The first valid authenticated approve or deny command committed strictly before both deadlines |
| Verification binding | Exact observation-only AGE-3 operation plus subject construction, predicate, parameter construction, receipt interpretation, and finite attempt rules |
| Verification attempt | Durable run-local identity that claims one policy ordinal and fixes the exact subject and parameters before AGE-3 reservation |
| Completion evaluation | Pure closed-policy result over one committed handoff or cancellation request and all required evidence |
| Terminal result | One immutable D4 record whose outcome is completed, failed, rejected, ambiguous, or cancelled |
| Supplemental observation | Immutable evidence appended after terminal commitment without changing any prior effect, budget, evidence, or terminal digest |

## 6. Imported and exported contracts

### 6.1 Imports

AGE-5 imports these types without redefining their internals:

| Owner | Imported type | AGE-5 use |
|---|---|---|
| D1 | `OwnerDomainId`, `SchemaDigestV1`, `ExecutionBindingDigest`, `DependencyClosureDigest`, `AuthorizationPolicyDigest` | Owner partition, closed schemas, exact pure executable identity, and current authorization policy |
| D2 | `RunId`, `DaemonEpoch`, `OwnershipLeaseIdentity`, `PrincipalId`, `RoleId`, `EpochMonotonicInstantV1`, `EpochMonotonicDeadlineV1`, `HostTransactionContext` | Run custody, trusted time, peer-derived identity and role, fencing, and D4 host transaction context |
| D4 | `SettlementStateVersion`, `EvidenceCheckpointDigest`, `ReferenceCommitTransactionId` | Compare-and-set state, terminal evidence checkpoint, and atomic AGE-4 attachment |
| AGE-1 | `AdmittedGoalRunDigestV1` | Sole admitted approval and completion authority root |
| AGE-2 | `CompletionHandoffV1`, `CompletionHandoffDigestV1`, `RunCheckpointDigestV1`, `ConversationStateDigestV1`, `ProposalStateDigestV1`, `EffectOutcomeBindingDigestV1` | Settling handoff, exact run evidence, and verification outcome handback |
| AGE-3 | `EffectClassIdV1`, `OperationKeyV1`, `GrantedOperationCatalogDigestV1`, `GrantedOperationBindingV1`, `GrantedVerificationOperationBindingV1`, `EffectClassificationV1`, `EffectTargetBindingV1`, `LocalCapabilityBindingV1`, `EffectReservationV1`, `EffectReservationDigestV1`, `EffectStateDigestV1`, `EffectReceiptDigestV1`, `EffectReceiptContractV1`, `EffectReceiptContractDigestV1`, `EffectBudgetLedgerDigestV1`, `EffectRecoveryRecordDigestV1`, `EffectAmbiguityRecordDigestV1`, `ResolvedOutwardDestinationV1`, `PreDispatchRejectReasonV1`, `ExpiredBoundaryV1`, `AttachApprovalGateCommandV1`, `ApplyApprovalDecisionCommandV1`, `CancelUnconsumedEffectCommandV1` | Complete approval subjects, gate transition, verification selection, receipts, ambiguity, and exact cancellation compare-and-set |
| AGE-4 | `ContentCustodyAllowanceDigestV1`, `ContentCustodyBindingDigestV1`, `ContentObjectDescriptorDigestV1`, `PreparedContentCandidateDigestV1`, `ContentDurabilityReceiptDigestV1`, `ContentReferenceDigestV1`, `ContentByteDigestV1`, `ContentReadReceiptDigestV1` | Lossless source reads, verification parameters, durable observations, and terminal evidence references |
| D6 contract package | `CanonicalCodecBindingDigestV1`, `SchemaBundleDigestV1`, `BoundedByteString` | Exact encoding, generated closed schemas, and bounded canonical values |

### 6.2 Exports

AGE-5 exports:

- `ApprovalPolicyBindingV1` and `ApprovalPolicyBindingDigestV1`;
- `ApprovalSubjectV1` and `ApprovalSubjectDigestV1`;
- `ApprovalViewV1` and `ApprovalViewDigestV1`;
- `ApprovalGateV1` and `ApprovalGateDigestV1`;
- `ApprovalDecisionV1`, `ApprovalDecisionDigestV1`, and
  `ApprovalDecisionOutcomeV1`;
- `VerificationSubjectContractV1` and
  `VerificationSubjectContractDigestV1`;
- `CompletionVerificationBindingV1` and its digest;
- `CompletionPolicyBindingV1` and `CompletionPolicyBindingDigestV1`;
- `VerificationAttemptV1` and `VerificationAttemptDigestV1`;
- `CompletionRequestV1` and `CompletionRequestDigestV1`;
- `CompletionEvaluationV1` and `CompletionEvaluationDigestV1`;
- `RunTerminalResultV1` and `RunTerminalResultDigestV1`;
- supplemental observation, evidence, command, and recovery records; and
- `AuthenticatedAge5CommandV1<TCommand>`, the post-D2-authentication command
  envelope used by AGE-5 channels; and
- the AGE-5 operator-channel, completion, and D4 transaction interfaces plus
  one shared conformance suite.

The exact exports imported by AGE-1 are:

- `ApprovalPolicyBindingDigestV1`; and
- `CompletionPolicyBindingDigestV1`.

The exact exports imported by AGE-2 are:

- `CompletionPolicyBindingDigestV1`;
- `CompletionRequestDigestV1`;
- `CompletionEvaluationDigestV1`;
- `VerificationAttemptDigestV1`; and
- `RunTerminalResultDigestV1`.

The exact exports imported by AGE-3 are:

- `ApprovalPolicyBindingDigestV1`;
- `ApprovalSubjectDigestV1`;
- `ApprovalGateDigestV1`;
- `ApprovalDecisionDigestV1`;
- `ApprovalDecisionOutcomeV1`; and
- `VerificationSubjectContractDigestV1`.

The exact exports imported by AGE-4 are:

- `ApprovalSubjectDigestV1`;
- `VerificationAttemptDigestV1`;
- `VerificationParameterProducerBindingDigestV1`; and
- `SupplementalObservationDigestV1`.

## 7. Trust and principal model

### 7.1 Principal separation

| Action | Only authorized principal |
|---|---|
| Construct approval subject | Exact admitted credential-free subject constructor |
| Read approval source bytes | Dedicated AGE-4 operator-view reader |
| Construct canonical view | Exact admitted credential-free view constructor |
| Present challenge and authenticate response | Dedicated operator-channel principal |
| Submit approval outcome | Authenticated operator principal in an eligible role |
| Construct verification subject and parameters | Exact admitted credential-free verification constructor |
| Execute verification | Exact AGE-3 read-only verifier principal |
| Interpret verification receipt | Exact admitted credential-free predicate executable |
| Evaluate completion | Exact admitted credential-free completion evaluator |
| Mutate approval, effect, evidence, or terminal state | D4 transaction writer only |

The operator channel has no effect permit, executor credential, content-writer
handle, or D4 writer handle. The verifier receives only AGE-4 reads authorized
for its exact attempt and the AGE-3 permit for that attempt.

### 7.2 No ambient authority

Subject constructors, view constructors, verification constructors,
predicates, result mappers, and completion evaluators are pure exact
executables. Their production profiles have no network, filesystem mutation,
clock, randomness, environment lookup, registry lookup, content listing, or
credential access.

D4 supplies trusted time, authenticated principal fields, epoch, lease,
settlement version, transaction identity, and existing state. Caller bytes
cannot replace those fields.

```ts
type Age5AuthenticatedChannelV1 =
  | "operator-decision"
  | "owner-completion";

interface AuthenticatedAge5CommandV1<TCommand> {
  schema: "prism-age5-authenticated-command-v1";
  channel: Age5AuthenticatedChannelV1;
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  principalId: PrincipalId;
  roleId: RoleId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  command: TCommand;
}
```

This envelope is not decoded from caller bytes and is not a new authentication
authority. D2 first authenticates operating-system peer credentials, derives
the principal, owner domain, and role from daemon policy, resolves the run's
current epoch and ownership lease, and then constructs the envelope inside the
host daemon. A caller can supply only the closed inner command accepted by its
channel. D4 revalidates every envelope field, the channel-to-command pairing,
the current authorization policy, and the inner command's run-bound state in
the same transaction that mutates authority. Caller-selected authority fields
reject before AGE-5 evaluation.

## 8. Canonical data and digest law

### 8.1 Closed values

Every AGE-5 record is a generated closed schema. Unknown fields, missing
required fields, duplicate keys, alternate tags, invalid numeric forms, and
trailing bytes reject before hashing or transition.

All strings are valid UTF-8 scalar sequences and receive no Unicode, newline,
or whitespace normalization. Counts, ordinals, versions, and lengths are exact
bounded unsigned integers. Floating-point values are forbidden.

### 8.2 Collections

Keyed catalogs declare one semantic key, sort by canonical key bytes, and
reject duplicate keys before lookup. Semantic sets sort by complete canonical
element bytes and reject duplicates. Ordered approval sections, semantic
values, verification attempts, and supplemental observations preserve their
declared order and require contiguous non-zero ordinals.

No decoder repairs ordering, drops duplicates, or applies first-wins or
last-wins behavior.

### 8.3 Digest construction

Metadata digests use:

```text
UTF8(domain) || 0x00 || canonical(root-record)
```

| Digest | Domain |
|---|---|
| `ApprovalPolicyBindingDigestV1` | `prism-age5-approval-policy-binding-v1` |
| `ApprovalSubjectDigestV1` | `prism-age5-approval-subject-v1` |
| `ApprovalViewDigestV1` | `prism-age5-approval-view-v1` |
| `ApprovalGateDigestV1` | `prism-age5-approval-gate-v1` |
| `ApprovalChallengeDigestV1` | `prism-age5-approval-challenge-v1` |
| `ApprovalGateStateDigestV1` | `prism-age5-approval-gate-state-v1` |
| `ApprovalDecisionDigestV1` | `prism-age5-approval-decision-v1` |
| `VerificationSubjectContractDigestV1` | `prism-age5-verification-subject-contract-v1` |
| `VerificationSubjectDigestV1` | `prism-age5-verification-subject-v1` |
| `VerificationPredicateBindingDigestV1` | `prism-age5-verification-predicate-binding-v1` |
| `CompletionVerificationBindingDigestV1` | `prism-age5-completion-verification-binding-v1` |
| `VerificationParameterProducerBindingDigestV1` | `prism-age5-verification-parameter-producer-v1` |
| `VerificationContentBudgetCoverageProofDigestV1` | `prism-age5-verification-content-budget-coverage-v1` |
| `VerificationAttemptDigestV1` | `prism-age5-verification-attempt-v1` |
| `VerificationObservationEvaluationDigestV1` | `prism-age5-verification-observation-evaluation-v1` |
| `CompletionPolicyBindingDigestV1` | `prism-age5-completion-policy-binding-v1` |
| `CompletionRequestDigestV1` | `prism-age5-completion-request-v1` |
| `CancellationBarrierDigestV1` | `prism-age5-cancellation-barrier-v1` |
| `CompletionEvaluationDigestV1` | `prism-age5-completion-evaluation-v1` |
| `TerminalEvidenceDigestV1` | `prism-age5-terminal-evidence-v1` |
| `RunTerminalResultDigestV1` | `prism-age5-run-terminal-result-v1` |
| `SupplementalReceiptEvidenceDigestV1` | `prism-age5-supplemental-receipt-evidence-v1` |
| `SupplementalObservationDigestV1` | `prism-age5-supplemental-observation-v1` |

```ts
type ApprovalPolicyBindingDigestV1 = Digest<"prism-age5-approval-policy-binding-v1">;
type ApprovalSubjectDigestV1 = Digest<"prism-age5-approval-subject-v1">;
type ApprovalViewDigestV1 = Digest<"prism-age5-approval-view-v1">;
type ApprovalGateDigestV1 = Digest<"prism-age5-approval-gate-v1">;
type ApprovalChallengeDigestV1 = Digest<"prism-age5-approval-challenge-v1">;
type ApprovalGateStateDigestV1 = Digest<"prism-age5-approval-gate-state-v1">;
type ApprovalDecisionDigestV1 = Digest<"prism-age5-approval-decision-v1">;
type VerificationSubjectContractDigestV1 = Digest<"prism-age5-verification-subject-contract-v1">;
type VerificationSubjectDigestV1 = Digest<"prism-age5-verification-subject-v1">;
type VerificationPredicateBindingDigestV1 = Digest<"prism-age5-verification-predicate-binding-v1">;
type CompletionVerificationBindingDigestV1 = Digest<"prism-age5-completion-verification-binding-v1">;
type VerificationParameterProducerBindingDigestV1 = Digest<"prism-age5-verification-parameter-producer-v1">;
type VerificationContentBudgetCoverageProofDigestV1 = Digest<"prism-age5-verification-content-budget-coverage-v1">;
type VerificationAttemptDigestV1 = Digest<"prism-age5-verification-attempt-v1">;
type VerificationObservationEvaluationDigestV1 = Digest<"prism-age5-verification-observation-evaluation-v1">;
type CompletionPolicyBindingDigestV1 = Digest<"prism-age5-completion-policy-binding-v1">;
type CompletionRequestDigestV1 = Digest<"prism-age5-completion-request-v1">;
type CancellationBarrierDigestV1 = Digest<"prism-age5-cancellation-barrier-v1">;
type CompletionEvaluationDigestV1 = Digest<"prism-age5-completion-evaluation-v1">;
type TerminalEvidenceDigestV1 = Digest<"prism-age5-terminal-evidence-v1">;
type RunTerminalResultDigestV1 = Digest<"prism-age5-run-terminal-result-v1">;
type SupplementalReceiptEvidenceDigestV1 = Digest<"prism-age5-supplemental-receipt-evidence-v1">;
type SupplementalObservationDigestV1 = Digest<"prism-age5-supplemental-observation-v1">;
```

### 8.4 Local scalar contracts

```ts
type ApprovalPolicyVersionV1 = BrandedU64<"ApprovalPolicyVersionV1">;
type CompletionPolicyVersionV1 = BrandedU64<"CompletionPolicyVersionV1">;
type ApprovalSectionOrdinalV1 = NonZeroBoundedU32<"ApprovalSectionOrdinalV1">;
type ApprovalValueOrdinalV1 = NonZeroBoundedU32<"ApprovalValueOrdinalV1">;
type VerificationAttemptOrdinalV1 = NonZeroBoundedU32<"VerificationAttemptOrdinalV1">;
type SupplementalObservationOrdinalV1 = NonZeroBoundedU32<"SupplementalObservationOrdinalV1">;
type MaximumVerificationAttemptsV1 = NonZeroBoundedU32<"MaximumVerificationAttemptsV1">;
type NonZeroBoundedCountV1 = NonZeroBoundedU32<"NonZeroBoundedCountV1">;
type BoundedSemanticPathV1 = BoundedString<"BoundedSemanticPathV1">;
type BoundedImpactCodeV1 = BoundedString<"BoundedImpactCodeV1">;
type BoundedDecisionReasonCodeV1 = BoundedString<"BoundedDecisionReasonCodeV1">;
type BoundedCompletionReasonCodeV1 = BoundedString<"BoundedCompletionReasonCodeV1">;
type BoundedTerminalReasonCodeV1 = BoundedString<"BoundedTerminalReasonCodeV1">;
type BoundedByteCountV1 = BrandedU64<"BoundedByteCountV1">;
type BoundedDurationTicksV1 = BrandedU64<"BoundedDurationTicksV1">;
type ApprovalGateRequestIdV1 = DigestBytes<"ApprovalGateRequestIdV1">;
type ApprovalDecisionRequestIdV1 = DigestBytes<"ApprovalDecisionRequestIdV1">;
type CompletionRequestIdV1 = DigestBytes<"CompletionRequestIdV1">;
type TerminalCommitRequestIdV1 = DigestBytes<"TerminalCommitRequestIdV1">;
type SupplementalObservationRequestIdV1 = DigestBytes<"SupplementalObservationRequestIdV1">;
```

### 8.5 Identity exclusions and temporal edges

Stable gate, decision, completion, terminal, and supplemental request
identities exclude process identity, response channel, wall-clock time,
randomness, and mutable registry aliases. Gate and decision roots include the
required current epoch because that epoch is part of decision authority.
Completion and terminal identities instead derive from admitted run and
committed evidence, so response loss and coordinator custody transfer return
the same record.

Predecessor links in gate state, verification attempts, and supplemental
observations point only to earlier immutable roots. A later state may reference
an earlier state; the earlier root never references its successor.

The only multi-root recursive type component is verification attempt plus
verification observation evaluation. Evaluation `N` references attempt `N`.
Attempt `N + 1` may reference evaluation `N`. No evaluation references a later
attempt, so concrete records form a predecessor-ordered chain rather than a
digest cycle.

## 9. Admitted approval policy

### 9.1 Class mapping

```ts
interface ApprovalClassPolicyV1 {
  schema: "prism-age5-approval-class-policy-v1";
  approvalClassId: EffectClassIdV1;
  subjectSchemaDigest: SchemaDigestV1;
  subjectConstructorExecutionBindingDigest: ExecutionBindingDigest;
  subjectConstructorDependencyClosureDigest: DependencyClosureDigest;
  viewSchemaDigest: SchemaDigestV1;
  viewConstructorExecutionBindingDigest: ExecutionBindingDigest;
  viewConstructorDependencyClosureDigest: DependencyClosureDigest;
  eligibleOperatorRoleIds: CanonicalSortedUniqueSetV1<RoleId>;
  maximumChallengeDurationTicks: BoundedDurationTicksV1;
  maximumSubjectBytes: BoundedByteCountV1;
  maximumViewBytes: BoundedByteCountV1;
}

interface ApprovalPolicyBindingV1 {
  schema: "prism-age5-approval-policy-binding-v1";
  ownerDomainId: OwnerDomainId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  policyVersion: ApprovalPolicyVersionV1;
  classPolicies: ReadonlyArray<ApprovalClassPolicyV1>;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  schemaBundleDigest: SchemaBundleDigestV1;
  noDefaultClass: true;
}
```

`approvalClassId` is the semantic key. Entries sort by canonical class bytes
and reject duplicates. Every AGE-3 operation whose approval requirement is
`required` resolves exactly one class entry under the same
`ApprovalPolicyBindingDigestV1`. An unreferenced class entry rejects so a
policy cannot carry dormant approval semantics.

Verification operations never require approval. A policy entry cannot turn an
AGE-3 no-approval operation into a gate or waive a required gate.

### 9.2 Admission closure

D1 admits the approval policy only when every constructor and schema resolves
through AGE-1's exact import set, every eligible role exists under the bound
authorization policy, all maxima are finite, and the class mapping agrees with
the complete AGE-3 granted catalog.

No latest policy, fallback role, wildcard class, default renderer, mutable
copy, or runtime policy narrowing is allowed. A policy or role change requires
a new AGE-1 task identity.

## 10. Complete approval subject

### 10.1 Semantic values and impact

```ts
interface ApprovalSemanticValueV1 {
  schema: "prism-age5-approval-semantic-value-v1";
  ordinal: ApprovalValueOrdinalV1;
  semanticPath: BoundedSemanticPathV1;
  valueSchemaDigest: SchemaDigestV1;
  canonicalValue: BoundedByteString;
  sourceContentReferenceDigest: ContentReferenceDigestV1;
  sourceContentByteDigest: ContentByteDigestV1;
}

interface ApprovalAdmittedSemanticValueV1 {
  schema: "prism-age5-approval-admitted-semantic-value-v1";
  semanticPath: BoundedSemanticPathV1;
  valueSchemaDigest: SchemaDigestV1;
  canonicalValue: BoundedByteString;
  sourceBindingDigest: ExecutionBindingDigest;
}

interface ApprovalImpactValueV1 {
  schema: "prism-age5-approval-impact-value-v1";
  ordinal: ApprovalValueOrdinalV1;
  impactCode: BoundedImpactCodeV1;
  semanticPath: BoundedSemanticPathV1;
  impactSchemaDigest: SchemaDigestV1;
  canonicalImpactValue: BoundedByteString;
}

type ApprovalSubjectTargetV1 =
  | {
      kind: "model-dispatch";
      target: Extract<EffectTargetBindingV1, { kind: "model-dispatch" }>;
      providerRouteSemanticValue: ApprovalAdmittedSemanticValueV1;
    }
  | {
      kind: "local-tool";
      target: Extract<EffectTargetBindingV1, { kind: "local-tool" }>;
      localCapability: LocalCapabilityBindingV1;
    }
  | {
      kind: "outward-tool";
      target: Extract<EffectTargetBindingV1, { kind: "outward-tool" }>;
      resolvedDestination: ResolvedOutwardDestinationV1;
    };
```

The semantic values reproduce the complete decoded parameter value under the
exact admitted schema. They are not labels, summaries, previews, hashes, or
pointers. Every referenced source is read by value through AGE-4, verified,
decoded once with the admitted codec, and represented without omission.

The impact list is an exact schema-defined projection of those values. It must
identify every read, mutation, transmission, external invocation, and local
resource selector relevant to the operation. The canonical semantic values
remain authoritative if presentation labels differ.

### 10.2 Subject root

```ts
interface ApprovalSubjectV1 {
  schema: "prism-age5-approval-subject-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  approvalClassId: EffectClassIdV1;
  reservationDigest: EffectReservationDigestV1;
  operationKey: OperationKeyV1;
  operationBinding: GrantedOperationBindingV1;
  effectClassification: EffectClassificationV1;
  claimantPrincipalId: PrincipalId;
  target: ApprovalSubjectTargetV1;
  semanticValues: ReadonlyArray<ApprovalSemanticValueV1>;
  impactValues: ReadonlyArray<ApprovalImpactValueV1>;
  gateDeadline: EpochMonotonicDeadlineV1;
  expectedReceiptContract: EffectReceiptContractV1;
  sourceContentReferences: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  constructorExecutionBindingDigest: ExecutionBindingDigest;
}
```

D4 constructs the root from one exact `EffectReservationV1`, its complete
granted binding, effect classification, AGE-4 parameter reads, target, and
receipt contract. Every repeated value must equal the admitted or reserved
source field exactly.

The subject rejects when values are unreadable, oversized, ambiguous,
unsupported, lossy, inconsistently ordered, or incomplete. A reservation
digest, operation name, destination digest, payload hash, tool label, or
natural-language description cannot substitute for the complete subject.
Model targets include the exact canonical provider-route semantic value. Local
targets include the complete admitted local capability binding. Outward targets
include the complete resolved destination by value.

## 11. Canonical lossless approval view

### 11.1 Structured view

```ts
interface ApprovalViewValueV1 {
  schema: "prism-age5-approval-view-value-v1";
  ordinal: ApprovalValueOrdinalV1;
  semanticPath: BoundedSemanticPathV1;
  valueSchemaDigest: SchemaDigestV1;
  canonicalValue: BoundedByteString;
  displayEncoding: "canonical-json-v1" | "canonical-text-v1" | "lowercase-hex-v1";
}

interface ApprovalViewSectionV1 {
  schema: "prism-age5-approval-view-section-v1";
  sectionOrdinal: ApprovalSectionOrdinalV1;
  sectionCode: BoundedImpactCodeV1;
  values: ReadonlyArray<ApprovalViewValueV1>;
}

interface ApprovalViewV1 {
  schema: "prism-age5-approval-view-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  approvalSubjectDigest: ApprovalSubjectDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  approvalClassId: EffectClassIdV1;
  target: ApprovalSubjectTargetV1;
  effectClassification: EffectClassificationV1;
  claimantPrincipalId: PrincipalId;
  gateDeadline: EpochMonotonicDeadlineV1;
  expectedReceiptContract: EffectReceiptContractV1;
  sections: ReadonlyArray<ApprovalViewSectionV1>;
  sourceReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>;
  viewConstructorExecutionBindingDigest: ExecutionBindingDigest;
}
```

The ordered multiset of `(semanticPath, valueSchemaDigest, canonicalValue)` in
the view must equal the subject's semantic and impact value coverage exactly.
The view may group values, but it cannot omit, add, summarize, rename,
reinterpret, round, truncate, or replace a value with a digest.

### 11.2 Presentation boundary

The operator channel may render spacing, typography, pagination, or locale-
neutral labels from `ApprovalViewV1`. Those presentation choices are not
authority and do not enter the decision preimage. The complete canonical view
is always available to the operator before a decision command is accepted.

A screenshot, generated prose summary, diff without unchanged authority-
bearing values, hidden expandable section, client-side fetch, or UI
acknowledgement is not a valid approval view.

## 12. Approval gate and challenge

### 12.1 Gate root

```ts
interface ApprovalGateV1 {
  schema: "prism-age5-approval-gate-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  gateRequestId: ApprovalGateRequestIdV1;
  reservationDigest: EffectReservationDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  approvalSubjectDigest: ApprovalSubjectDigestV1;
  approvalViewDigest: ApprovalViewDigestV1;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  eligibleOperatorRoleIds: CanonicalSortedUniqueSetV1<RoleId>;
  gateDeadline: EpochMonotonicDeadlineV1;
  challengeDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  stateVersionAfterAttach: SettlementStateVersion;
}
```

The challenge deadline is constructed by D4 from the admitted maximum and a
trusted monotonic sample. It must be in the reservation epoch and less than or
equal to the AGE-3 gate deadline. Equality at decision time is expired.

Gate request identity derives from owner, run, reservation, subject, view,
policy, authorization policy, and epoch. Identical replay returns the same
gate. A changed subject, view, policy, role set, deadline, reservation, or epoch
conflicts.

### 12.2 Challenge root

```ts
interface ApprovalChallengeV1 {
  schema: "prism-age5-approval-challenge-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  decisionRequestId: ApprovalDecisionRequestIdV1;
  approvalGateDigest: ApprovalGateDigestV1;
  approvalSubjectDigest: ApprovalSubjectDigestV1;
  approvalViewDigest: ApprovalViewDigestV1;
  sourceContentReferenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  sourceReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  eligibleOperatorRoleIds: CanonicalSortedUniqueSetV1<RoleId>;
  gateDeadline: EpochMonotonicDeadlineV1;
  challengeDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  issuedAt: EpochMonotonicInstantV1;
}
```

The challenge is public read-only metadata within the authenticated operator
channel. It is not a token, permit, signature substitute, reusable capability,
or authority to decide another gate.

D4 derives `decisionRequestId` from owner, run, reservation, gate, subject,
view, authorization policy, and epoch before issuing the challenge. It excludes
operator identity and outcome so every eligible operator addresses the same
first-winner decision slot.

### 12.3 Gate lifecycle

```ts
type ApprovalGateLifecycleV1 =
  | { kind: "challenge-issued"; challengeDigest: ApprovalChallengeDigestV1 }
  | { kind: "decided"; decisionDigest: ApprovalDecisionDigestV1 }
  | { kind: "expired"; expiredAt: EpochMonotonicInstantV1 }
  | { kind: "cancelled"; completionRequestDigest: CompletionRequestDigestV1 }
  | { kind: "epoch-lost"; priorDaemonEpoch: DaemonEpoch };

type ApprovalGateStatePredecessorV1 =
  | { kind: "initial" }
  | { kind: "prior"; priorStateDigest: ApprovalGateStateDigestV1 };

interface ApprovalGateStateV1 {
  schema: "prism-age5-approval-gate-state-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  approvalGateDigest: ApprovalGateDigestV1;
  state: ApprovalGateLifecycleV1;
  stateVersion: SettlementStateVersion;
  predecessor: ApprovalGateStatePredecessorV1;
}
```

The initial state uses the `initial` arm. Every successor points to the exact
prior immutable state. `decided`, `expired`, `cancelled`, and `epoch-lost` are
terminal. No state returns to `challenge-issued`.

## 13. Authenticated operator decision

### 13.1 Decision root

```ts
type ApprovalDecisionOutcomeV1 = "approve" | "deny";

interface SubmitApprovalDecisionCommandV1 {
  schema: "prism-age5-submit-approval-decision-v1";
  approvalGateDigest: ApprovalGateDigestV1;
  approvalChallengeDigest: ApprovalChallengeDigestV1;
  outcome: ApprovalDecisionOutcomeV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface ApprovalDecisionV1 {
  schema: "prism-age5-approval-decision-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  decisionRequestId: ApprovalDecisionRequestIdV1;
  reservationDigest: EffectReservationDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  approvalSubjectDigest: ApprovalSubjectDigestV1;
  approvalViewDigest: ApprovalViewDigestV1;
  approvalGateDigest: ApprovalGateDigestV1;
  approvalChallengeDigest: ApprovalChallengeDigestV1;
  operatorPrincipalId: PrincipalId;
  operatorRoleId: RoleId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  outcome: ApprovalDecisionOutcomeV1;
  gateDeadline: EpochMonotonicDeadlineV1;
  challengeDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  decidedAt: EpochMonotonicInstantV1;
  stateVersionAfterDecision: SettlementStateVersion;
}
```

The authenticated channel supplies owner, principal, role, epoch, and lease.
The command cannot carry substitutes. D4 requires the exact current
authorization policy and an operator role in the gate's eligible role set.
The decision request identity comes from the D4-issued challenge. The operator
cannot mint or replace it.

### 13.2 Strict decision law

D4 samples the trusted monotonic clock inside the winning transaction. A
decision commits only when:

- the gate and challenge are current and belong to the same owner, run,
  reservation, subject, view, policy, and epoch;
- gate state is exactly `challenge-issued`;
- the operator principal and role authenticate under the bound current policy;
- the trusted sample is strictly less than the gate deadline; and
- the same sample is strictly less than the challenge deadline.

Equality or later commits expiry, never a decision. The first valid decision
wins. Identical replay returns the same decision. A different outcome,
operator, role, challenge, subject, view, policy, or request body under the same
request identity conflicts.

## 14. Atomic approval interaction with AGE-3

### 14.1 Gate attachment

D4 attaches a gate only while the exact AGE-3 effect state is `reserved` and
the complete operation binding requires that policy and class. In one host
transaction it:

1. authenticates current owner custody, epoch, lease, and state version;
2. verifies reservation, grant, target, classification, approval requirement,
   semantic parameter reads, receipt contract, subject, and view;
3. constructs the gate and initial gate state;
4. invokes AGE-3's `AttachApprovalGateCommandV1` with the exact subject and
   gate digests;
5. adds AGE-4 `approval-source` retention pins for every referenced source;
6. changes the AGE-3 state to `awaiting-approval` and inserts AGE-5 gate roots;
   and
7. commits all records or none.

A challenge is emitted only after that transaction acknowledges. Missing or
lossy content leaves the AGE-3 state `reserved` until the admitted pre-dispatch
failure policy closes it. No partial gate can wait for an operator.

### 14.2 Decision transaction

In one host transaction D4 validates the authenticated decision, creates its
root, invokes AGE-3's `ApplyApprovalDecisionCommandV1`, advances the gate
state, and advances the AGE-3 effect state:

| Decision condition | AGE-5 gate state | AGE-3 effect state |
|---|---|---|
| Valid `approve` before both deadlines | `decided` | `approved-awaiting-permit` |
| Valid `deny` before both deadlines | `decided` | `rejected-denied` |
| Sample equals or exceeds either deadline | `expired` | `rejected-expired` |
| Daemon epoch changed | `epoch-lost` | `rejected-epoch-loss` |

The decision record and AGE-3 state transition commit together or neither
does. An approval row, challenge delivery acknowledgement, UI state, operator
message, or gate state alone is never permit authority.

## 15. Approval restart and recovery

On restart, the operator channel and D4 read the reservation, exact AGE-3
effect state, gate, challenge, gate state, authorization policy, epoch, and
settlement version before acting.

| Durable state | Required recovery |
|---|---|
| Reservation requires approval, no gate committed | Rebuild only from exact admitted bytes and retry the stable gate request |
| Gate committed, challenge response lost | Return the identical challenge; do not issue a second gate |
| Challenge issued, no decision | Wait for the same gate until decision, expiry, or epoch loss |
| Decision transaction response lost | Query both gate state and AGE-3 effect state, then return the identical decision or replay the same request |
| Gate deadline or challenge deadline reached | Commit expiry once; reject every later decision |
| Epoch changed before decision or permit | Commit epoch loss once; old gate and decision remain evidence only |
| AGE-3 effect already terminal | Return immutable state; never reopen or replace the gate |

Restart never reconstructs a subject or view from logs, client state, rendered
HTML, screenshots, cached content, current registry aliases, or a different
constructor. If exact source content is unavailable before gate attachment,
the effect fails closed. A committed subject and view are never rerendered into
new decision authority.

## 16. Verification subject contract

### 16.1 Reusable contract

```ts
interface VerificationSubjectContractV1 {
  schema: "prism-age5-verification-subject-contract-v1";
  ownerDomainId: OwnerDomainId;
  subjectSchemaDigest: SchemaDigestV1;
  subjectConstructorExecutionBindingDigest: ExecutionBindingDigest;
  subjectConstructorDependencyClosureDigest: DependencyClosureDigest;
  parameterSchemaDigest: SchemaDigestV1;
  observationSchemaDigest: SchemaDigestV1;
  maximumSubjectBytes: BoundedByteCountV1;
  maximumParameterBytes: BoundedByteCountV1;
  maximumObservationBytes: BoundedByteCountV1;
  observationOnly: true;
}
```

This is the exact digest AGE-3 binds into its verification operation arm. The
constructor receives only committed run evidence and verified AGE-4 bytes. It
cannot inspect mutable workspace state through an ambient path or choose its
own verifier, predicate, target, operation, or retry count.

### 16.2 Attempt-specific subject

```ts
interface VerificationSubjectV1 {
  schema: "prism-age5-verification-subject-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  completionHandoffDigest: CompletionHandoffDigestV1;
  terminalCandidateCheckpointDigest: RunCheckpointDigestV1;
  conversationStateDigest: ConversationStateDigestV1;
  subjectContractDigest: VerificationSubjectContractDigestV1;
  canonicalSubjectValue: BoundedByteString;
  subjectSchemaDigest: SchemaDigestV1;
  sourceCheckpointDigests: CanonicalSortedUniqueSetV1<RunCheckpointDigestV1>;
  sourceProposalStateDigests: CanonicalSortedUniqueSetV1<ProposalStateDigestV1>;
  sourceEffectOutcomeDigests: CanonicalSortedUniqueSetV1<EffectOutcomeBindingDigestV1>;
  sourceContentReferenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  sourceReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>;
  constructorExecutionBindingDigest: ExecutionBindingDigest;
}
```

The subject is an immutable canonical value derived from the exact completion
handoff and terminal-candidate checkpoint. Missing or unreadable evidence
prevents an attempt. A verifier plugin name, natural-language claim, current
workspace, latest artifact, mutable branch, or model assertion cannot be a
verification subject.

## 17. Completion verification binding

### 17.1 Predicate and result mapping

```ts
type VerificationPredicateResultV1 = "pass" | "fail" | "uncertain";

interface VerificationPredicateBindingV1 {
  schema: "prism-age5-verification-predicate-binding-v1";
  predicateExecutionBindingDigest: ExecutionBindingDigest;
  predicateDependencyClosureDigest: DependencyClosureDigest;
  subjectSchemaDigest: SchemaDigestV1;
  observationSchemaDigest: SchemaDigestV1;
  resultSchemaDigest: SchemaDigestV1;
  acceptedReceiptContractDigest: EffectReceiptContractDigestV1;
  deterministic: true;
  observationOnly: true;
}

interface VerificationRetryPolicyV1 {
  maximumAttempts: MaximumVerificationAttemptsV1;
  retryablePreDispatchReasons: CanonicalSortedUniqueSetV1<PreDispatchRejectReasonV1>;
  onTrustworthyFail: "terminal-failed" | "retry-if-slot-remains";
  onPostConsumptionUncertainty: "terminal-ambiguous-no-retry";
  prechargeNeverRefunded: true;
}

interface CompletionVerificationBindingV1 {
  schema: "prism-age5-completion-verification-binding-v1";
  ownerDomainId: OwnerDomainId;
  verificationOperationKey: OperationKeyV1;
  grantedVerificationBinding: GrantedVerificationOperationBindingV1;
  subjectContractDigest: VerificationSubjectContractDigestV1;
  predicateBindingDigest: VerificationPredicateBindingDigestV1;
  parameterConstructorExecutionBindingDigest: ExecutionBindingDigest;
  parameterConstructorDependencyClosureDigest: DependencyClosureDigest;
  parameterSchemaDigest: SchemaDigestV1;
  acceptedObservationSchemaDigest: SchemaDigestV1;
  acceptedReceiptContractDigest: EffectReceiptContractDigestV1;
  retryPolicy: VerificationRetryPolicyV1;
}
```

The AGE-3 operation must be the `verification` arm and its exact classification
must prohibit local mutation, outward writes, messaging, publication, repair,
installation, and promotion. Its target principal must equal the admitted
read-only verifier principal. The receipt contract and observation schema must
match the predicate binding exactly.

The admitted receipt contract must use the content-required arm with the exact
AGE-4 `verification-observation` descriptor. Completion verification cannot use
a no-content receipt, empty body, executor status, log pointer, or provider
assertion as an observation.

A natural-language predicate, verifier alias, operation label, executable
without dependency closure, or mutable result mapping rejects admission.

### 17.2 Verification parameter producer

```ts
interface VerificationParameterProducerBindingV1 {
  schema: "prism-age5-verification-parameter-producer-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  completionVerificationBindingDigest: CompletionVerificationBindingDigestV1;
  subjectContractDigest: VerificationSubjectContractDigestV1;
  constructorExecutionBindingDigest: ExecutionBindingDigest;
  constructorDependencyClosureDigest: DependencyClosureDigest;
  producerPrincipalId: PrincipalId;
  contentCustodyBindingDigest: ContentCustodyBindingDigestV1;
  contentCustodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  contentDescriptorDigest: ContentObjectDescriptorDigestV1;
  parameterSchemaDigest: SchemaDigestV1;
  maximumContentBytes: BoundedByteCountV1;
}

interface VerificationContentBudgetCoverageProofV1 {
  schema: "prism-age5-verification-content-budget-coverage-v1";
  ownerDomainId: OwnerDomainId;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  completionVerificationBindingDigest: CompletionVerificationBindingDigestV1;
  grantedOperationCatalogDigest: GrantedOperationCatalogDigestV1;
  parameterMaximumBytes: BoundedByteCountV1;
  observationMaximumBytes: BoundedByteCountV1;
  result: "verification-parameter-and-result-maxima-precharged";
}
```

Before D1 admission, the proof requires the AGE-3 verification operation's
content precharge to cover the checked sum of maximum verification parameter
bytes and maximum verification result bytes. Both maxima must also fit the
AGE-4 object and run-retention allowances. Overflow, missing bounds, or an
insufficient charge rejects admission. Actual lower usage never refunds a
claim.

### 17.3 Integrated AGE-4 producer lineage

AGE-5 prepares verification parameters as AGE-4 `action-parameters` content.
For each publication, D4 constructs AGE-4's exact
`completion-verification` arm by value with the admitted
`VerificationParameterProducerBindingDigestV1`. AGE-5 cannot select the outer
owner domain or another producer arm.

AGE-4 uses the resulting `RuntimeContentProducerBindingDigestV1` in every
publication, durability, candidate, reference, and verification lineage
field. D4 and AGE-4 require exact owner, run, custody, descriptor, schema,
principal, constructor, dependency, subject-contract, policy, and maximum-byte
parity before preparation. The closed union has no generic extension arm.

## 18. Durable verification attempt

### 18.1 Attempt identity

```ts
type VerificationAttemptPredecessorV1 =
  | { kind: "first" }
  | {
      kind: "successor";
      priorAttemptDigest: VerificationAttemptDigestV1;
      priorEvaluationDigest: VerificationObservationEvaluationDigestV1;
    };

interface VerificationAttemptV1 {
  schema: "prism-age5-verification-attempt-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  completionHandoffDigest: CompletionHandoffDigestV1;
  terminalCandidateCheckpointDigest: RunCheckpointDigestV1;
  verificationBindingDigest: CompletionVerificationBindingDigestV1;
  verificationSubjectDigest: VerificationSubjectDigestV1;
  attemptOrdinal: VerificationAttemptOrdinalV1;
  predecessor: VerificationAttemptPredecessorV1;
  parameterContentReferenceDigest: ContentReferenceDigestV1;
  parameterContentByteDigest: ContentByteDigestV1;
  parameterSchemaDigest: SchemaDigestV1;
  parameterProducerBindingDigest: VerificationParameterProducerBindingDigestV1;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

`VerificationAttemptDigestV1` is the stable attempt identity imported by
AGE-2 and AGE-4. It excludes daemon epoch, lease, coordinator generation,
process identity, and randomness. The first ordinal is one. A successor is the
prior ordinal plus one and binds the exact prior attempt and evaluation.

D4 enforces one attempt per `(ownerDomainId, runId, completionRequestDigest,
attemptOrdinal)`. Identical replay returns the same root. Changed subject,
binding, parameter bytes, predecessor, or checkpoint conflicts.

### 18.2 Atomic parameter and attempt commitment

The pure constructor first prepares canonical parameter bytes through AGE-4
under a stable publication request. The prepared candidate is durable but has
no run authority.

The publication request identity derives from owner, run, completion request,
terminal-candidate checkpoint, verification binding, subject digest, and
attempt ordinal. It excludes the not-yet-committed attempt digest, daemon
epoch, lease, process identity, and randomness.

Inside one D4 host transaction, D4:

1. verifies the current settling checkpoint, completion request, policy,
   prior attempt chain, ordinal, and available attempt slot;
2. verifies subject, constructor binding, prepared candidate, descriptor,
   schema, byte digest, custody, producer, and budget coverage;
3. constructs the AGE-4 content reference and `VerificationAttemptV1`;
4. calls AGE-4's transaction port with a `verification-attempt` attachment
   carrying the attempt digest;
5. inserts the reference, retention pin, and attempt record; and
6. commits all records or none.

The AGE-4 reference root does not include its attachment, so D4 computes the
reference before the attempt and then attaches the attempt digest without a
cycle. No parameter reference becomes authoritative without claiming the AGE-5
attempt slot. The AGE-3 effect precharge is claimed later in the atomic AGE-2
reservation transaction and is never double-counted.

### 18.3 Finite retry law

A later attempt is legal only when:

- its ordinal does not exceed the admitted maximum;
- the prior attempt has one committed evaluation;
- a trustworthy `fail` is retryable under `onTrustworthyFail`, or a proven
  pre-dispatch reason appears in the exact retryable set;
- the same terminal-candidate checkpoint and verification binding remain
  fixed; and
- no terminal result exists.

An attempt whose permit was consumed and whose trustworthy receipt is missing
or uncertain cannot retry automatically. Denial, crash, expiry, or unused
precharge never restores an AGE-5 attempt slot or an AGE-3 budget claim.

## 19. Verification effect handoff

After the attempt commits, AGE-2 alone derives the stable verification run
operation identity, operation proposal, parameter set, intent checkpoint, and
AGE-3 reservation. AGE-5 supplies only:

- the exact `VerificationAttemptDigestV1`;
- the admitted verification operation key and binding digest;
- the AGE-4 parameter reference and byte digest;
- the terminal-candidate checkpoint; and
- the expected settling state and version.

AGE-2 and D4 route the operation through the same one-open-effect, precharge,
deadline, permit, execution, receipt, and ambiguity path as every other AGE-3
effect. AGE-5 cannot call a verifier, reserve an effect, issue or consume a
permit, choose a target principal, or submit a receipt.

Verification never requires operator approval. A verification operation whose
AGE-3 binding says otherwise is invalid and cannot be selected by a completion
policy.

## 20. Verification observation interpretation

### 20.1 Evaluation root

```ts
type VerificationObservationSourceV1 =
  | {
      kind: "trustworthy-receipt";
      effectOutcomeBindingDigest: EffectOutcomeBindingDigestV1;
      effectReceiptDigest: EffectReceiptDigestV1;
      observationContentReferenceDigest: ContentReferenceDigestV1;
      observationContentByteDigest: ContentByteDigestV1;
      observationReadReceiptDigest: ContentReadReceiptDigestV1;
    }
  | {
      kind: "pre-dispatch-terminal";
      effectStateDigest: EffectStateDigestV1;
      reason: PreDispatchRejectReasonV1;
    }
  | {
      kind: "pre-consumption-expired";
      effectStateDigest: EffectStateDigestV1;
      expiredBoundary: ExpiredBoundaryV1;
    }
  | {
      kind: "pre-consumption-epoch-loss";
      effectStateDigest: EffectStateDigestV1;
      priorDaemonEpoch: DaemonEpoch;
    }
  | {
      kind: "post-consumption-ambiguous";
      effectRecoveryRecordDigest: EffectRecoveryRecordDigestV1;
      ambiguityRecordDigest: EffectAmbiguityRecordDigestV1;
    };

interface VerificationObservationEvaluationV1 {
  schema: "prism-age5-verification-observation-evaluation-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  completionRequestDigest: CompletionRequestDigestV1;
  verificationAttemptDigest: VerificationAttemptDigestV1;
  verificationBindingDigest: CompletionVerificationBindingDigestV1;
  predicateBindingDigest: VerificationPredicateBindingDigestV1;
  source: VerificationObservationSourceV1;
  result: VerificationPredicateResultV1;
  resultReasonCode: BoundedDecisionReasonCodeV1;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

Only the trustworthy-receipt arm may produce `pass` or `fail`. The predicate
reads the exact observation by value through AGE-4, verifies descriptor,
schema, length, byte digest, receipt, reservation, attempt, and read receipt,
then returns one closed canonical result.

Pre-consumption terminal state maps only to `uncertain`. Only a reason in the
admitted retryable pre-dispatch set may create another attempt. Expiry and epoch
loss do not silently enter that set. Post-consumption ambiguity maps to
`uncertain` and permanently forbids automatic retry.

### 20.2 Commitment and replay

D4 commits one evaluation for each attempt. The semantic key is
`(ownerDomainId, runId, verificationAttemptDigest)`. Identical replay returns
the same result. A different predicate output, source receipt, observation,
read receipt, reason code, or binding conflicts and closes completion before a
new effect.

Restart never reruns a predicate after its evaluation commits. A predicate
crash before commitment may rerun only the same executable against the exact
same verified subject and observation bytes.

## 21. Admitted completion policy

### 21.1 Evidence rules

```ts
type CompletionEvidenceRuleV1 =
  | { kind: "checkpoint-chain-valid" }
  | { kind: "all-selected-proposals-terminal" }
  | { kind: "no-open-effect" }
  | { kind: "no-effect-ambiguity-for-completed" }
  | {
      kind: "required-operation-receipt";
      operationKey: OperationKeyV1;
      minimumCount: NonZeroBoundedCountV1;
    }
  | {
      kind: "required-content-readable";
      descriptorDigest: ContentObjectDescriptorDigestV1;
      minimumCount: NonZeroBoundedCountV1;
    }
  | { kind: "verification-pass-required" };

type CompletionVerificationRequirementV1 =
  | { kind: "none" }
  | {
      kind: "required";
      binding: CompletionVerificationBindingV1;
    };

interface CompletionFailureMappingV1 {
  admittedBindingMismatch: "rejected";
  provenInternalFailure: "failed";
  unresolvedPostConsumptionEffect: "ambiguous";
  verificationPostConsumptionUncertainty: "ambiguous";
  authenticatedCancellationWithoutAmbiguity: "cancelled";
}

interface CompletionPolicyBindingV1 {
  schema: "prism-age5-completion-policy-binding-v1";
  ownerDomainId: OwnerDomainId;
  policyVersion: CompletionPolicyVersionV1;
  evaluatorExecutionBindingDigest: ExecutionBindingDigest;
  evaluatorDependencyClosureDigest: DependencyClosureDigest;
  evidenceRules: ReadonlyArray<CompletionEvidenceRuleV1>;
  verificationRequirement: CompletionVerificationRequirementV1;
  failureMapping: CompletionFailureMappingV1;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  schemaBundleDigest: SchemaBundleDigestV1;
}
```

Evidence rules are ordered and duplicate rules reject. The policy contains no
free-form success predicate, latest verifier, default operation, mutable retry
rule, or model-selected completion condition.

If verification is required, its complete binding is part of the completion
policy root. If it is not required, no verification attempt may be created for
that request. `completed` is unavailable whenever any required rule lacks
positive evidence.

### 21.2 Admission closure

D1 admits the completion policy only when its evaluator and all nested
verification executables, dependencies, schemas, operations, receipt
contracts, content maxima, retry bounds, and evidence rules resolve exactly
through AGE-1's import set.

The AGE-1 task template and admitted run bind the policy digest exactly. A
runtime caller cannot select a narrower policy, skip verification, change a
failure class, increase retries, or treat a model completion proposal as
positive evidence.

## 22. Completion request

### 22.1 Closed source union

```ts
type CompletionRequestSourceV1 =
  | {
      kind: "coordination-handoff";
      completionHandoff: CompletionHandoffV1;
      completionHandoffDigest: CompletionHandoffDigestV1;
    }
  | {
      kind: "authenticated-cancellation";
      requestedByPrincipalId: PrincipalId;
      requestedByRoleId: RoleId;
      authorizationPolicyDigest: AuthorizationPolicyDigest;
      reasonCode: BoundedCompletionReasonCodeV1;
    };

interface CompletionRequestV1 {
  schema: "prism-age5-completion-request-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  completionRequestId: CompletionRequestIdV1;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  conversationStateDigest: ConversationStateDigestV1;
  source: CompletionRequestSourceV1;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

For a coordination handoff, every repeated owner, run, policy, checkpoint, and
conversation field must equal `CompletionHandoffV1`. For cancellation, the
authenticated command channel supplies principal, role, owner, epoch, lease,
and policy. A caller cannot place those fields in an unsigned payload.

The coordination-handoff arm rejects a handoff whose reason is
`authenticated-cancellation`. Cancellation commits the request first, then
AGE-2 may bind that request digest in its cancellation handoff. This direction
keeps both roots computable and prevents a cross-contract digest cycle.

The coordination request identity derives from the handoff digest. The
cancellation request identity derives from owner, run, current checkpoint,
authenticated principal, authorization policy, and the caller's stable
idempotency request. Identical replay returns the same request. A changed
source, reason, principal, checkpoint, or policy conflicts.

### 22.2 Request is not terminal authority

Committing a request only enters or confirms AGE-2 `settling`. It does not
assert success, cancel a consumed effect, interpret a verification result,
release retention, or write a terminal result.

No model output can create the authenticated-cancellation arm. A model
completion proposal reaches AGE-5 only inside the exact AGE-2 coordination
handoff.

## 23. Authenticated cancellation

### 23.1 Barrier root

```ts
type CancellationEffectSnapshotV1 =
  | { kind: "none" }
  | {
      kind: "open-before-consumption";
      reservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    }
  | {
      kind: "consumed-awaiting-resolution";
      reservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    }
  | {
      kind: "terminal-effect";
      reservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    };

interface CancellationBarrierV1 {
  schema: "prism-age5-cancellation-barrier-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  completionRequestDigest: CompletionRequestDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  effectSnapshot: CancellationEffectSnapshotV1;
  newReservationsClosed: true;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

The barrier commits before terminal evaluation and permanently closes new
model, action, and verification reservations for that run.

### 23.2 Open-effect race

D4 resolves cancellation against the one open AGE-3 effect in one
compare-and-set transaction:

- with no open effect, it commits the barrier and proceeds to evaluation;
- before permit consumption, cancellation may win by committing AGE-3
  `cancelled-before-consumption` and closing any approval gate without an
  operator decision;
- if permit consumption wins first, cancellation records
  `consumed-awaiting-resolution` and waits for a trustworthy receipt or AGE-3
  ambiguity recovery; and
- a terminal AGE-3 effect is preserved exactly and included in completion
  evidence.

Cancellation cannot revoke or rewrite a consumed permit, receipt, destination,
budget claim, effect state, or operator decision. If the consumed effect ends
ambiguous, the run outcome is `ambiguous`, not `cancelled`.

### 23.3 Integrated AGE-3 cancellation binding

AGE-3 exports `CancelUnconsumedEffectCommandV1` through its D4-only transaction
port. During cancellation, D4 constructs that command from the committed
`CompletionRequestDigestV1`, exact reservation and state digests, full expected
state payload, and current settlement version. It invokes the command in the
same host transaction that commits the cancellation barrier and, when present,
closes the AGE-5 gate as `cancelled`.

The command accepts exactly `reserved`, `awaiting-approval`,
`approved-awaiting-permit`, or `permit-issued`. Success terminates the effect
as `rejected-pre-dispatch` with `cancelled-before-consumption`. The compare-and-
set loses atomically if permit consumption committed first. No general
executor, coordinator, operator, or completion-channel cancellation authority
is created.

## 24. Completion evaluation

### 24.1 Evidence set

```ts
type CompletionOpenEffectEvidenceV1 =
  | { kind: "none" }
  | {
      kind: "nonterminal";
      reservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    };

type CompletionCancellationEvidenceV1 =
  | { kind: "none" }
  | { kind: "barrier"; cancellationBarrierDigest: CancellationBarrierDigestV1 };

interface CompletionEvidenceSetV1 {
  currentCheckpointDigest: RunCheckpointDigestV1;
  conversationStateDigest: ConversationStateDigestV1;
  effectBudgetLedgerDigest: EffectBudgetLedgerDigestV1;
  proposalStateDigests: CanonicalSortedUniqueSetV1<ProposalStateDigestV1>;
  approvalGateStateDigests: CanonicalSortedUniqueSetV1<ApprovalGateStateDigestV1>;
  approvalDecisionDigests: CanonicalSortedUniqueSetV1<ApprovalDecisionDigestV1>;
  terminalEffectStateDigests: CanonicalSortedUniqueSetV1<EffectStateDigestV1>;
  effectReceiptDigests: CanonicalSortedUniqueSetV1<EffectReceiptDigestV1>;
  effectRecoveryRecordDigests: CanonicalSortedUniqueSetV1<EffectRecoveryRecordDigestV1>;
  effectAmbiguityRecordDigests: CanonicalSortedUniqueSetV1<EffectAmbiguityRecordDigestV1>;
  contentReferenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  contentReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>;
  verificationAttemptDigests: ReadonlyArray<VerificationAttemptDigestV1>;
  verificationEvaluationDigests: ReadonlyArray<VerificationObservationEvaluationDigestV1>;
  openEffect: CompletionOpenEffectEvidenceV1;
  cancellation: CompletionCancellationEvidenceV1;
}
```

D4 constructs this set from authoritative indexes and verifies every root by
value. The pure evaluator receives no query or writer handle. Sets cannot omit
an effect, proposal, retained reference, attempt, or ambiguity known at the
same settlement state version.

### 24.2 Closed outcome and next step

```ts
type CompletedVerificationEvidenceV1 =
  | { kind: "not-required" }
  | {
      kind: "passed";
      verificationAttemptDigest: VerificationAttemptDigestV1;
      verificationEvaluationDigest: VerificationObservationEvaluationDigestV1;
    };

type RunTerminalOutcomeV1 =
  | {
      kind: "completed";
      verification: CompletedVerificationEvidenceV1;
    }
  | { kind: "failed"; reasonCode: BoundedTerminalReasonCodeV1 }
  | { kind: "rejected"; reasonCode: BoundedTerminalReasonCodeV1 }
  | {
      kind: "ambiguous";
      ambiguityRecordDigests: CanonicalSortedUniqueSetV1<EffectAmbiguityRecordDigestV1>;
    }
  | {
      kind: "cancelled";
      cancellationBarrierDigest: CancellationBarrierDigestV1;
      preservedReceiptDigests: CanonicalSortedUniqueSetV1<EffectReceiptDigestV1>;
    };

type CompletionEvaluationDecisionV1 =
  | {
      kind: "await-existing-effect";
      reservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    }
  | {
      kind: "start-verification";
      verificationBindingDigest: CompletionVerificationBindingDigestV1;
      nextAttemptOrdinal: VerificationAttemptOrdinalV1;
    }
  | { kind: "terminal-candidate"; outcome: RunTerminalOutcomeV1 };

interface CompletionEvaluationV1 {
  schema: "prism-age5-completion-evaluation-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  evaluatedCheckpointDigest: RunCheckpointDigestV1;
  evidence: CompletionEvidenceSetV1;
  evaluatorExecutionBindingDigest: ExecutionBindingDigest;
  decision: CompletionEvaluationDecisionV1;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

### 24.3 Evaluation law

The evaluator applies this fixed priority:

1. Any open effect returns `await-existing-effect`; no terminal candidate or
   verification attempt is allowed.
2. Any post-consumption ambiguity returns terminal `ambiguous`.
3. An authenticated cancellation with resolved effects returns `cancelled`,
   preserving every trustworthy receipt.
4. A proven admitted binding or authority mismatch returns `rejected`.
5. A proven internal integrity or evaluation failure returns `failed`.
6. Missing required verification starts the next legal finite attempt.
7. A required trustworthy verification failure follows the exact retry policy
   and then becomes `failed` when no legal slot remains.
8. Only complete positive evidence for every admitted rule returns
   `completed`.

Missing evidence is never success. An unreadable required reference, absent
receipt, unresolved proposal, stale checkpoint, incomplete attempt chain, or
predicate uncertainty prevents `completed`.

The semantic key is `(ownerDomainId, runId, completionRequestDigest,
evaluatedCheckpointDigest, canonical(evidence))`. Identical replay returns the
same evaluation. A different output from the same policy and evidence is an
integrity conflict.

## 25. Terminal evidence and result

### 25.1 Evidence root

```ts
interface TerminalEvidenceV1 {
  schema: "prism-age5-terminal-evidence-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  completionEvaluationDigest: CompletionEvaluationDigestV1;
  terminalCandidateCheckpointDigest: RunCheckpointDigestV1;
  outcome: RunTerminalOutcomeV1;
  proposalStateDigests: CanonicalSortedUniqueSetV1<ProposalStateDigestV1>;
  approvalGateStateDigests: CanonicalSortedUniqueSetV1<ApprovalGateStateDigestV1>;
  approvalDecisionDigests: CanonicalSortedUniqueSetV1<ApprovalDecisionDigestV1>;
  effectStateDigests: CanonicalSortedUniqueSetV1<EffectStateDigestV1>;
  effectReceiptDigests: CanonicalSortedUniqueSetV1<EffectReceiptDigestV1>;
  recoveryRecordDigests: CanonicalSortedUniqueSetV1<EffectRecoveryRecordDigestV1>;
  ambiguityRecordDigests: CanonicalSortedUniqueSetV1<EffectAmbiguityRecordDigestV1>;
  verificationAttemptDigests: ReadonlyArray<VerificationAttemptDigestV1>;
  verificationEvaluationDigests: ReadonlyArray<VerificationObservationEvaluationDigestV1>;
  contentReferenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  contentReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>;
}
```

Every digest is recomputed and every required content reference is reopened
through AGE-4 before terminal commitment. D4 constructs one immutable evidence
checkpoint from this root and attaches terminal retention pins in the same
host transaction.

### 25.2 Terminal result

```ts
interface RunTerminalResultV1 {
  schema: "prism-age5-run-terminal-result-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  terminalCommitRequestId: TerminalCommitRequestIdV1;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  completionEvaluationDigest: CompletionEvaluationDigestV1;
  terminalEvidenceDigest: TerminalEvidenceDigestV1;
  evidenceCheckpointDigest: EvidenceCheckpointDigest;
  terminalCandidateCheckpointDigest: RunCheckpointDigestV1;
  outcome: RunTerminalOutcomeV1;
  committedAt: EpochMonotonicInstantV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  stateVersionAfterCommit: SettlementStateVersion;
}
```

Only D4 constructs and writes this root. The commit request identity derives
from owner, run, completion request, evaluation, evidence, and candidate
checkpoint. It excludes response channel and process identity.

### 25.3 Atomic terminal commitment

In one host transaction D4:

1. verifies the run is settling, no open effect exists, no terminal result
   exists, and the expected state version is current;
2. recomputes the admitted policy, request, evaluation, outcome, and all
   evidence roots;
3. reopens required AGE-4 content and verifies active or terminal retention;
4. constructs terminal evidence and the D4 evidence checkpoint;
5. attaches every required terminal-evidence pin;
6. constructs and inserts `RunTerminalResultV1`; and
7. closes new AGE-2 checkpoints, AGE-3 reservations, approval gates,
   verification attempts, completion evaluations, and ordinary evidence
   writes for the run.

All records commit or none do. `completed` requires positive evidence for
every admitted rule. `ambiguous` preserves every ambiguity digest. Terminal
outcomes are immutable and never transition to another terminal kind.

Identical replay after response loss returns the same terminal result. A
changed outcome, evidence set, evaluation, policy, request, checkpoint, or
commit identity conflicts.

## 26. Supplemental late observations

### 26.1 Separate evidence root

```ts
interface SupplementalReceiptEvidenceV1 {
  schema: "prism-age5-supplemental-receipt-evidence-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  effectReceiptDigest: EffectReceiptDigestV1;
  receiptContractDigest: EffectReceiptContractDigestV1;
  executorPrincipalId: PrincipalId;
  target: EffectTargetBindingV1;
  resultContentReferenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  verifiedAt: EpochMonotonicInstantV1;
}

type SupplementalObservationPredecessorV1 =
  | { kind: "terminal"; terminalResultDigest: RunTerminalResultDigestV1 }
  | {
      kind: "supplemental";
      priorSupplementalObservationDigest: SupplementalObservationDigestV1;
    };

type SupplementalObservationSourceV1 =
  | {
      kind: "late-trustworthy-receipt";
      receiptEvidenceDigest: SupplementalReceiptEvidenceDigestV1;
    }
  | {
      kind: "late-recovery-observation";
      effectRecoveryRecordDigest: EffectRecoveryRecordDigestV1;
    };

interface SupplementalObservationV1 {
  schema: "prism-age5-supplemental-observation-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  requestId: SupplementalObservationRequestIdV1;
  ordinal: SupplementalObservationOrdinalV1;
  terminalResultDigest: RunTerminalResultDigestV1;
  frozenEvidenceCheckpointDigest: EvidenceCheckpointDigest;
  reservationDigest: EffectReservationDigestV1;
  predecessor: SupplementalObservationPredecessorV1;
  source: SupplementalObservationSourceV1;
  terminalOutcomeUnchanged: true;
  terminalEvidenceUnchanged: true;
  budgetUnchanged: true;
  effectStateUnchanged: true;
  stateVersionAfterAppend: SettlementStateVersion;
}
```

`SupplementalReceiptEvidenceDigestV1` hashes
`SupplementalReceiptEvidenceV1` under domain
`prism-age5-supplemental-receipt-evidence-v1`.

The semantic key for a late receipt is `(ownerDomainId, runId,
terminalResultDigest, reservationDigest, effectReceiptDigest)`. Identical
replay returns the same append. A different receipt, target, content reference,
predecessor, or terminal root conflicts.

### 26.2 No retroactive authority

The supplemental chain cannot change or replace:

- the AGE-3 effect state, receipt state, permit, budget claim, or recovery
  outcome;
- the completion evaluation, terminal evidence, evidence checkpoint, terminal
  outcome, or terminal digest;
- approval, verification, cancellation, retention, or artifact-application
  authority; or
- any downstream work-program, adaptation, observability, deployment, or
  publication decision.

### 26.3 Integrated AGE-4 supplemental custody

When a late trustworthy receipt carries content not already referenced, D4
constructs the final supplemental observation and its digest, then commits the
AGE-4 reference, a `supplemental-observation` attachment, the matching
retention pin, supplemental receipt evidence, and the observation in one host
transaction. Both AGE-4 arms carry the exact
`SupplementalObservationDigestV1`.

The attachment and pin establish custody lineage only. The reference remains
owner- and run-scoped, and neither arm can rewrite terminal evidence, the
frozen evidence checkpoint, the terminal outcome, effect state, budget, or any
downstream authority. A transaction failure commits none of these records.

## 27. Interfaces and D4 transaction commands

### 27.1 Operator channel

```ts
interface ReadApprovalChallengeV1 {
  schema: "prism-age5-read-approval-challenge-v1";
  approvalGateDigest: ApprovalGateDigestV1;
}

interface ApprovalChallengePresentationV1 {
  schema: "prism-age5-approval-challenge-presentation-v1";
  challenge: ApprovalChallengeV1;
  subject: ApprovalSubjectV1;
  view: ApprovalViewV1;
}

interface OperatorDecisionChannel {
  readChallenge(
    input: AuthenticatedAge5CommandV1<ReadApprovalChallengeV1>,
  ): Promise<ApprovalChallengePresentationV1 | Age5RejectV1>;

  submitDecision(
    input: AuthenticatedAge5CommandV1<SubmitApprovalDecisionCommandV1>,
  ): Promise<ApprovalDecisionV1 | Age5RejectV1>;
}
```

`readChallenge` returns the complete canonical view, or a channel response that
contains that exact value without hiding any section. `submitDecision` accepts
only the closed approve or deny outcome. Neither method returns or consumes an
AGE-3 permit.

### 27.2 Completion commands

```ts
interface PrepareApprovalGateCommandV1 {
  schema: "prism-age5-prepare-approval-gate-v1";
  gateRequestId: ApprovalGateRequestIdV1;
  reservationDigest: EffectReservationDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface CommitCompletionRequestCommandV1 {
  schema: "prism-age5-commit-completion-request-v1";
  completionRequestId: CompletionRequestIdV1;
  completionHandoff: CompletionHandoffV1;
  completionHandoffDigest: CompletionHandoffDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface CommitVerificationAttemptCommandV1 {
  schema: "prism-age5-commit-verification-attempt-v1";
  completionRequestDigest: CompletionRequestDigestV1;
  completionHandoffDigest: CompletionHandoffDigestV1;
  terminalCandidateCheckpointDigest: RunCheckpointDigestV1;
  verificationBindingDigest: CompletionVerificationBindingDigestV1;
  attemptOrdinal: VerificationAttemptOrdinalV1;
  predecessor: VerificationAttemptPredecessorV1;
  preparedParameterCandidateDigest: PreparedContentCandidateDigestV1;
  parameterDurabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
  parameterProducerBindingDigest: VerificationParameterProducerBindingDigestV1;
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface RequestCancellationCommandV1 {
  schema: "prism-age5-request-cancellation-v1";
  completionRequestId: CompletionRequestIdV1;
  runId: RunId;
  expectedCheckpointDigest: RunCheckpointDigestV1;
  reasonCode: BoundedCompletionReasonCodeV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface CommitCompletionEvaluationCommandV1 {
  schema: "prism-age5-commit-completion-evaluation-v1";
  completionRequestDigest: CompletionRequestDigestV1;
  expectedCheckpointDigest: RunCheckpointDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface CommitRunTerminalCommandV1 {
  schema: "prism-age5-commit-run-terminal-v1";
  terminalCommitRequestId: TerminalCommitRequestIdV1;
  completionEvaluationDigest: CompletionEvaluationDigestV1;
  expectedCheckpointDigest: RunCheckpointDigestV1;
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface AppendSupplementalObservationCommandV1 {
  schema: "prism-age5-append-supplemental-observation-v1";
  requestId: SupplementalObservationRequestIdV1;
  terminalResultDigest: RunTerminalResultDigestV1;
  reservationDigest: EffectReservationDigestV1;
  predecessor: SupplementalObservationPredecessorV1;
  source: SupplementalObservationSourceV1;
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The authenticated completion channel may submit only
`RequestCancellationCommandV1`. All other commands are constructed from
verified state by D4 or by the pure AGE-5 policy controller and accepted only
through D4's internal transaction port.

The `operator-decision` envelope accepts only challenge reads and decision
submissions. The `owner-completion` envelope accepts only cancellation
requests. D4 rejects every other channel and command pairing.

### 27.3 D4 transaction port

```ts
interface Age5TransactionPort {
  prepareApprovalGate(
    tx: HostTransactionContext,
    input: PrepareApprovalGateCommandV1,
  ): Promise<ApprovalChallengeV1 | Age5RejectV1>;

  commitApprovalDecision(
    tx: HostTransactionContext,
    input: AuthenticatedAge5CommandV1<SubmitApprovalDecisionCommandV1>,
  ): Promise<ApprovalDecisionV1 | Age5RejectV1>;

  commitVerificationAttempt(
    tx: HostTransactionContext,
    input: CommitVerificationAttemptCommandV1,
  ): Promise<VerificationAttemptV1 | Age5RejectV1>;

  commitCompletionRequest(
    tx: HostTransactionContext,
    input: CommitCompletionRequestCommandV1,
  ): Promise<CompletionRequestV1 | Age5RejectV1>;

  commitCancellation(
    tx: HostTransactionContext,
    input: AuthenticatedAge5CommandV1<RequestCancellationCommandV1>,
  ): Promise<CancellationBarrierV1 | Age5RejectV1>;

  commitCompletionEvaluation(
    tx: HostTransactionContext,
    input: CommitCompletionEvaluationCommandV1,
  ): Promise<CompletionEvaluationV1 | Age5RejectV1>;

  commitTerminalResult(
    tx: HostTransactionContext,
    input: CommitRunTerminalCommandV1,
  ): Promise<RunTerminalResultV1 | Age5RejectV1>;

  appendSupplementalObservation(
    tx: HostTransactionContext,
    input: AppendSupplementalObservationCommandV1,
  ): Promise<SupplementalObservationV1 | Age5RejectV1>;
}
```

This port is internal to D4. The operator channel, coordinator, model, parser,
provider broker, tool executor, verifier, content service, consumer, and
external observer cannot call it directly.

### 27.4 Pure derivation ports

```ts
interface ApprovalSubjectConstructor {
  construct(
    reservation: EffectReservationV1,
    verifiedParameterBytes: ReadonlyArray<BoundedByteString>,
  ): Promise<ApprovalSubjectV1 | Age5RejectV1>;
}

interface ApprovalViewConstructor {
  construct(
    subject: ApprovalSubjectV1,
    sourceReadReceiptDigests: CanonicalSortedUniqueSetV1<ContentReadReceiptDigestV1>,
  ): Promise<ApprovalViewV1 | Age5RejectV1>;
}

interface VerificationSubjectConstructor {
  construct(
    handoff: CompletionHandoffV1,
    verifiedEvidenceBytes: ReadonlyArray<BoundedByteString>,
  ): Promise<VerificationSubjectV1 | Age5RejectV1>;
}

interface VerificationPredicate {
  evaluate(
    subject: VerificationSubjectV1,
    verifiedObservationBytes: BoundedByteString,
  ): Promise<VerificationPredicateResultV1 | Age5RejectV1>;
}

interface CompletionPolicyEvaluator {
  evaluate(
    request: CompletionRequestV1,
    evidence: CompletionEvidenceSetV1,
  ): Promise<CompletionEvaluationDecisionV1 | Age5RejectV1>;
}
```

Production adapters receive the exact admitted binding context. These compact
signatures omit immutable constructor context but do not permit ambient lookup.

### 27.5 Rejection union

```ts
type Age5RejectReasonV1 =
  | "authentication-failed"
  | "authorization-policy-stale"
  | "operator-role-ineligible"
  | "admitted-binding-mismatch"
  | "approval-not-required"
  | "approval-subject-incomplete"
  | "approval-view-lossy"
  | "approval-source-unreadable"
  | "approval-gate-conflict"
  | "approval-gate-expired"
  | "approval-gate-epoch-lost"
  | "approval-decision-conflict"
  | "verification-not-required"
  | "verification-binding-invalid"
  | "verification-subject-invalid"
  | "verification-attempt-limit"
  | "verification-attempt-conflict"
  | "verification-observation-invalid"
  | "verification-post-consumption-ambiguous"
  | "completion-request-conflict"
  | "completion-evidence-incomplete"
  | "open-effect-unresolved"
  | "cancellation-conflict"
  | "terminal-conflict"
  | "terminal-already-committed"
  | "supplemental-observation-conflict"
  | "stale-settlement-version"
  | "stale-epoch-or-lease"
  | "content-integrity-failed"
  | "internal-integrity-failed";

interface Age5RejectV1 {
  schema: "prism-age5-reject-v1";
  reason: Age5RejectReasonV1;
}
```

Rejections contain no raw content, endpoint, path, credential, operator
message, provider response, or unbounded diagnostic text.

## 28. Restart and recovery

### 28.1 Recovery procedure

On restart or custody transfer, D4 and AGE-5:

1. rehydrate the exact AGE-1 admitted snapshot and all AGE policy roots;
2. read the immutable terminal result first;
3. if nonterminal, read the current checkpoint, completion request,
   cancellation barrier, open AGE-3 effect, approval gate, attempt chain,
   evaluations, evidence, epoch, lease, and settlement version;
4. verify every referenced AGE-4 object and read receipt by digest and purpose;
5. choose the single recovery row matching durable state; and
6. issue only that row's idempotent next command.

Current templates, registries, UI state, cached model output, logs, process
memory, operator messages, and provider dashboards are not recovery sources.

### 28.2 Exact recovery matrix

| Durable state | Required recovery |
|---|---|
| Approval-required reservation, no gate | Reconstruct from exact admitted bytes and retry the same gate request |
| Gate and challenge exist, no decision | Return the same challenge or commit expiry or epoch loss |
| Decision exists, AGE-3 response lost | Query gate and effect state; replay the same decision transaction only |
| Completion handoff exists, no completion request | Construct and commit the same request once |
| Cancellation request exists, no barrier | Re-run the same one-open-effect compare-and-set transaction |
| Barrier says consumed effect unresolved | Invoke AGE-3 receipt or ambiguity recovery; never force cancelled |
| Verification parameter candidate exists, no attempt | Reverify candidate and resume the same reference-and-attempt transaction |
| Attempt exists, no AGE-3 reservation | Return the same attempt to AGE-2 for the same operation identity and reservation path |
| Verification effect nonterminal | Wait on or recover the same AGE-3 reservation; do not create another attempt |
| Verification receipt exists, no evaluation | Read exact observation and run only the admitted predicate once |
| Verification evaluation exists | Return it; never rerun the predicate |
| Completion evaluation says start verification | Commit only the specified next ordinal if it remains legal |
| Completion evaluation is terminal candidate | Reverify evidence and submit the same terminal commit request |
| Terminal result response lost | Return the identical terminal result by stable request identity |
| Late receipt exists, supplemental append response lost | Query by supplemental semantic key and return or replay the same append |
| Terminal result exists | Reject all ordinary AGE-5 mutations; allow only the separate supplemental path |

### 28.3 Corruption and stale authority

Corrupt or missing approval content before decision closes the gate without
approval. Corrupt verification or terminal evidence prevents positive
completion. If an effect was consumed, AGE-5 accepts AGE-3's trustworthy
receipt or ambiguity result and never rewrites it as an internal failure.

A stale epoch, lease, authorization policy, operator role, or settlement
version may read immutable records for diagnosis but cannot decide, create an
attempt, cancel, evaluate, terminate, or append supplemental evidence.

## 29. Finite progression

Every non-replay AGE-5 transition does exactly one of these things:

- attaches one gate to one existing reservation;
- resolves that gate by decision, expiry, epoch loss, or cancellation;
- claims one bounded verification-attempt ordinal;
- advances the one existing verification effect through AGE-3;
- commits one predicate evaluation for one attempt;
- closes new reservations under one cancellation barrier;
- commits one completion evaluation over a changed evidence set;
- writes one immutable terminal result; or
- appends one uniquely keyed supplemental observation after terminal.

Approval waits perform no polling mutation. Verification attempts cannot exceed
the admitted maximum. One attempt receives one evaluation. A completion
evaluation that requests verification names one strictly greater legal
ordinal. No pure AGE-5 step has a self-loop.

Every reachable nonterminal state therefore has one deterministic command, one
wait on an existing operator gate or AGE-3 effect, or one terminal transition.
An unavailable operator or external dependency grants no unbounded retry,
deadline extension, policy change, or new reservation.

## 30. Failure semantics

| Condition | Required result |
|---|---|
| Approval subject omits or summarizes one semantic value | No gate; close effect under admitted pre-dispatch policy |
| Approval source content is unreadable or digest-invalid | No gate and no operator decision authority |
| Operator role or authorization policy is stale | Reject command; gate remains subject to deadline or epoch loss |
| Decision sample equals either deadline | Expired; no decision and no permit authority |
| Conflicting decisions race | First valid compare-and-set wins; loser cannot change state |
| Epoch changes with gate pending or approved | Epoch-loss terminal gate and AGE-3 effect state; old decision is evidence only |
| Verification binding permits mutation | Reject admission or attempt before reservation |
| Verification pre-dispatch failure is not retryable | No new attempt; follow terminal policy |
| Verification permit was consumed and receipt is uncertain | Terminal `ambiguous`; no automatic retry |
| Verification returns trustworthy `fail` | Retry only if exact finite policy permits; otherwise terminal `failed` |
| Required positive evidence is missing | Never `completed` |
| Cancellation loses race to permit consumption | Wait for receipt or ambiguity; do not rewrite effect |
| Terminal write response is lost | Replay returns identical immutable result |
| Late trustworthy receipt arrives after terminal | Append supplemental evidence only; terminal and budget stay unchanged |

## 31. Proposed AGE-5 invariant refinements

These aliases are contract handles only. The successor constitutional baseline
assigns final invariant IDs.

| Alias | Target statement | Proof class |
|---|---|---|
| `AGE5-INV-SUBJECT` | Every gated effect binds a complete by-value approval subject containing exact operation, principal, target, semantic values, impact, deadlines, and expected receipt. | Static plus runtime adversarial |
| `AGE5-INV-VIEW` | The canonical approval view has exact lossless semantic coverage and every source byte was read through AGE-4 under the subject authority. | Runtime adversarial |
| `AGE5-INV-DECISION` | Only an authenticated eligible operator can commit the first decision strictly before both deadlines in the gate epoch. | Runtime adversarial |
| `AGE5-INV-NOPERMIT` | A gate, challenge, rendered view, or approval record is not permit authority; only AGE-3 may issue and consume the exact permit. | Static plus runtime adversarial |
| `AGE5-INV-VERIFY` | Required completion verification uses one exact observation-only binding and durable finite attempt identity before AGE-3 reservation. | Runtime adversarial |
| `AGE5-INV-NORETRY` | Post-consumption verification uncertainty becomes ambiguous and cannot create an automatic retry. | Runtime adversarial |
| `AGE5-INV-CANCEL` | Cancellation closes new reservations and never rewrites a consumed effect, receipt, or ambiguity result. | Runtime adversarial |
| `AGE5-INV-TERMINAL` | Only D4 writes one immutable terminal result, and completed requires every admitted positive evidence rule. | Static plus runtime adversarial |
| `AGE5-INV-LATE` | Supplemental late observations are append-only and cannot change effect, budget, evidence, or terminal authority. | Runtime adversarial |

## 32. Conformance requirements

One shared suite must run against in-memory and durable adapters. Only the
durable adapter may claim production conformance.

1. Codec tests reject unknown fields, duplicate keys, alternate tags,
   noncanonical ordering, invalid UTF-8, invalid bounds, trailing bytes, and
   digest-domain substitutions for every AGE-5 root.
2. Approval tests generate complete model, local, and outward subjects, then
   delete, summarize, rename, reorder, truncate, or replace every semantic
   value and require gate construction to fail.
3. Decision tests race eligible and ineligible principals, policy versions,
   approve and deny outcomes, response loss, epoch changes, and trusted samples
   one tick before, exactly at, and one tick after both deadlines.
4. Verification tests substitute mutating operations, wrong principals,
   subjects, predicates, schemas, observations, receipts, parameter content,
   attempt ordinals, predecessors, retry reasons, and post-consumption
   uncertainty.
5. Completion tests cover every handoff reason, unresolved proposal and effect,
   missing content, failed readback, required receipt, verification pass, fail,
   uncertainty, exhausted retries, cancellation race, and terminal replay.
6. Late-observation tests append identical and conflicting receipts after each
   terminal outcome and prove the original effect, budget, evidence checkpoint,
   outcome, and terminal digest remain byte-identical.
7. Fault injection runs immediately before and after gate attachment, challenge
   return, decision commit, attempt reference commit, AGE-3 reservation,
   verification receipt, predicate evaluation, cancellation barrier, evidence
   checkpoint, terminal write, and supplemental append.
8. A bounded state-machine model proves one open effect, one decision per gate,
   contiguous finite attempts, immutable terminal state, no pure self-loop, and
   deterministic restart from every reachable nonterminal state.

## 33. Package and downstream boundary

### 33.1 Existing interface closure

AGE-5's exact exports satisfy:

- AGE-1's `ApprovalPolicyBindingDigestV1` and
  `CompletionPolicyBindingDigestV1` imports;
- AGE-2's `CompletionPolicyBindingDigestV1`,
  `CompletionRequestDigestV1`, `CompletionEvaluationDigestV1`,
  `VerificationAttemptDigestV1`, and `RunTerminalResultDigestV1` imports;
- AGE-3's `ApprovalPolicyBindingDigestV1`, `ApprovalSubjectDigestV1`,
  `ApprovalGateDigestV1`, `ApprovalDecisionDigestV1`,
  `ApprovalDecisionOutcomeV1`, and `VerificationSubjectContractDigestV1`
  imports; and
- AGE-4's `ApprovalSubjectDigestV1`, `VerificationAttemptDigestV1`,
  `VerificationParameterProducerBindingDigestV1`, and
  `SupplementalObservationDigestV1` imports.

All names match byte-for-byte. Integrated package verification must also prove
that every imported root has one owner and that all repeated source fields
match by value.

### 33.2 Applied package reconciliations

The integrated contract set closes these exact seams:

1. AGE-4 owns one closed runtime producer root with AGE-3 effect-result, AGE-2
   coordinator, and AGE-5 verification-parameter arms. Its digest is used in
   every custody lineage record.
2. AGE-3 exposes one D4-only pre-consumption cancellation compare-and-set from
   every unconsumed nonterminal effect state.
3. AGE-4 contains supplemental-observation content attachment and retention-
   pin arms keyed by `SupplementalObservationDigestV1`.
4. AGE-5 owns one post-authentication command envelope. D2 derives and supplies
   its authority fields after peer authentication, and D4 revalidates them in
   the authoritative transaction. D4 continues to own evidence and terminal
   transaction semantics.

No reconciliation may introduce a generic producer, generic attachment,
caller-selected principal, direct state writer, direct executor, mutable
terminal result, or terminal-evidence rewrite.

### 33.3 Downstream authority boundary

A completed result may expose immutable artifact bytes and provenance through
separately authorized AGE-4 reads. It grants no destination write, artifact
application, work-program selection, governed adaptation, external
observability, installation, deployment, publication, release, or AGE-6
authority.

Downstream D8-era documents remain blocked until the full AGE-1 through AGE-5
package, successor constitutional baseline, independent hardening, and owner
implementation ratification are complete. AGE-5 does not amend them.

## 34. Draft closure record

- Contract status: draft, not ratified.
- Accepted architecture: bound by exact object digest.
- AGE-1 through AGE-4 inputs: package interfaces reconciled.
- Existing upstream import names: resolved.
- Package reconciliations: applied as recorded in Section 33.2.
- Successor constitutional baseline: not authored.
- Independent package hardening: not run.
- Implementation plan, code, schema migration, deployment, and publication
  authority: none.

This document now participates in one reconciled AGE-1 through AGE-5 package.
The next authorized milestone is the successor constitutional baseline under
a separate instruction. This workstream does not begin it.
