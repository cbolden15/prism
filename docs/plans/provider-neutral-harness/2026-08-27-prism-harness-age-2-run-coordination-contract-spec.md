# Prism Harness AGE-2 Run Coordination contract specification

Date: 2026-08-27

Owner: Vora Technologies, LLC

Status: draft contract, not ratified and not implementation authority

Accepted architecture object:
`5fc1443f9d8e740d4811a02d9e3a5dd637a12184`

## 1. Purpose

AGE-2 defines how Prism advances one admitted autonomous goal run without
granting the coordinator any direct effect, credential, settlement, content
storage, approval, or terminal authority.

The coordinator turns committed state into one deterministic next command. It
assigns stable model-turn, proposal, and operation identities before effect
reservation. It commits model observations before parsing, parses each
observation under one admitted parser, selects proposals in canonical order,
builds model-visible feedback under one admitted renderer, and resumes from
durable checkpoints without regenerating committed meaning.

AGE-2 does not execute effects. Every model, local, outward, and verification
operation enters AGE-3. AGE-2 does not decide completion. It enters AGE-5 with
one exact checkpoint and completion reason, then mirrors only the result that
D4 and AGE-5 commit.

## 2. Source of truth and precedence

This contract is subordinate to:

1. runtime authority and project instructions;
2. the accepted autonomous goal-execution architecture with Git object
   `5fc1443f9d8e740d4811a02d9e3a5dd637a12184`;
3. the architecture acceptance record with Git object
   `d47455756eac691c5cc8b3dc0aa774f6f04c2227`;
4. the AGE-1 contract draft with Git object
   `4c376d39a36e63699ea6bc43d09b89d9291fd4cf`;
5. the AGE-3 contract draft with Git object
   `d69a56b2a3acb9464c16668b56282cf2881bdac9`; and
6. the AGE-4 contract draft with Git object
   `adf893bf8f7e79a19d89dfc421af00d78100ae47`.

This document may refine AGE-2 fields and transitions. It may not reassign
ownership held by AGE-1, AGE-3, AGE-4, AGE-5, or D1 through D7.

The frozen D8 revision 8 pair remains retired historical evidence. It is not
an active design source and remains byte-identical.

## 3. Scope

AGE-2 owns:

- the reusable run-behavior contract;
- exact parser, proposal grammar, serializer, feedback renderer, identity, and
  progression bindings;
- coordinator-derived content producer profiles and admitted bindings;
- stable model-turn, parsed-proposal, and run-operation identities;
- canonical action-parameter metadata;
- one-time model-observation parse records and proposal batches;
- deterministic proposal queue ordering and selection;
- conversation-state and model-feedback lineage;
- run-checkpoint schemas and checkpoint commands;
- coordinator generations, modes, transitions, and restart recovery;
- the narrow handoff into AGE-3 effect reservation and AGE-5 completion; and
- the AGE-2 adapter conformance suite.

## 4. Non-goals and ownership exclusions

AGE-2 does not own:

- task templates, goal admission, or admitted-run construction, which belong
  to AGE-1;
- grants, targets, budgets, deadlines, reservations, permits, execution,
  receipts, or effect recovery, which belong to AGE-3;
- content bytes, publication durability, references, access, retention, or
  deletion, which belong to AGE-4;
- approval views, operator decisions, verification predicates, completion
  evaluation, terminal writes, or late observations, which belong to AGE-5;
- provider credentials, outward adapter credentials, filesystem capabilities,
  or host process capacity;
- D4 settlement writes, even though AGE-2 defines the closed commands D4 may
  accept for run coordination; or
- opaque external-agent execution, work-program selection, governed
  adaptation, external observability authority, installation, deployment,
  publication, release, or AGE-6.

Prompt text, goal text, model output, parser errors, feedback text, and
checkpoint labels cannot create or widen authority.

## 5. Contract vocabulary

| Term | Meaning |
|---|---|
| Run-behavior contract | The reusable template-bound identity of coordinator code, grammar, serializers, producer profiles, transitions, and finite progression |
| Coordinator generation | A D4-issued monotonic run-local fence for one active coordinator custody period |
| Model turn | One stable model-dispatch intent and its resulting committed observation |
| Parsed proposal | One deterministic directive derived from a committed model observation and fixed by turn plus ordinal |
| Operation proposal | The exact AGE-3 execution intent for a model dispatch, selected action, or AGE-5 verification attempt |
| Action parameter set | Metadata binding one operation to one typed AGE-4 parameter reference and its exact constructor or serializer |
| Conversation state | An immutable chain from the AGE-1 initial conversation through committed model observations and model feedback |
| Run checkpoint | One immutable D4-committed step that binds predecessor, mode, conversation, operation, content, and state version |
| Coordinator mode | The closed current phase of one run, derived from the latest checkpoint and any exact AGE-3 or AGE-5 state |
| Replay | Returning or continuing from committed identities and content without reparsing, rerendering, or redispatching |

## 6. Imported and exported contracts

### 6.1 Imports

AGE-2 imports these types without redefining their internals:

| Owner | Imported type | AGE-2 use |
|---|---|---|
| D1 | `OwnerDomainId`, `SchemaDigestV1`, `ExecutionBindingDigest`, `DependencyClosureDigest`, `AuthorizationPolicyDigest` | Owner partition, closed schemas, and exact executable identity |
| D2 | `RunId`, `DaemonEpoch`, `OwnershipLeaseIdentity`, `PrincipalId`, `RoleId`, `ProductionEnvironmentId`, `HostTransactionContext`, `AuthenticatedCoordinatorCommand<T>` | Run custody, fencing, authenticated coordinator principal, and host transaction context |
| D4 | `SettlementStateVersion`, `AdmissionCheckpointDigest`, `ReferenceCommitTransactionId` | One-writer state versions, admitted predecessor, and atomic content attachment |
| AGE-1 | `InitialConversationDigestV1`, `GoalTaskImportSetDigestV1`, `GoalTaskDigestV1`, `AdmittedGoalRunDigestV1` | Initial conversation and sole admitted runtime authority root |
| AGE-3 | `OperationKeyV1`, `GrantedOperationCatalogDigestV1`, `GrantedOperationBindingDigestV1`, `ParameterConstructionBindingDigestV1`, `EffectBudgetPolicyDigestV1`, `EffectTargetBindingV1`, `EffectReservationRequestV1`, `EffectReservationDigestV1`, `EffectStateDigestV1`, `EffectReceiptDigestV1`, `EffectRecoveryRecordDigestV1`, `EffectBudgetLedgerDigestV1`, `ContentProducerBindingDigestV1` | Exact effect intent, reservation, outcome, recovery, accounting, and existing effect-result producer identity |
| AGE-4 | `ContentCustodyAllowanceDigestV1`, `ContentCustodyBindingDigestV1`, `ContentObjectDescriptorDigestV1`, `ContentPublicationRequestIdV1`, `PreparedContentCandidateDigestV1`, `ContentDurabilityReceiptDigestV1`, `ContentReferenceDigestV1`, `ContentByteDigestV1`, `ContentReadReceiptDigestV1` | Coordinator-derived publication, immutable references, and replay reads |
| AGE-5 | `CompletionPolicyBindingDigestV1`, `CompletionRequestDigestV1`, `CompletionEvaluationDigestV1`, `VerificationAttemptDigestV1`, `RunTerminalResultDigestV1` | Completion and verification handoff without AGE-5 decision ownership |
| D6 contract package | `CanonicalCodecBindingDigestV1`, `SchemaBundleDigestV1`, `BoundedByteString` | Exact codec, generated closed schemas, and bounded canonical bytes |

AGE-5 imports remain unresolved until that downstream contract is drafted.
Their absence blocks package ratification, not this bounded AGE-2 draft.

### 6.2 Exports

AGE-2 exports:

- `RunBehaviorContractV1` and `RunBehaviorContractDigestV1`;
- parser, grammar, serializer, feedback, transition, and coordinator producer
  profile roots and digests;
- `CoordinatorContentProducerBindingV1` and its digest;
- `CoordinatorContentBudgetCoverageProofV1` and its digest;
- `CoordinatorGenerationV1` and `CoordinatorGenerationRecordV1`;
- `ModelTurnIdentityV1`, `ModelTurnIdV1`, and `ModelTurnIntentV1`;
- `RunOperationIdentityV1` and `RunOperationIdV1`;
- `ActionParameterSetV1` and `ActionParameterSetDigestV1`;
- `ParsedProposalV1`, `ProposalBatchV1`, and their digests;
- `OperationProposalV1` and `OperationProposalDigestV1`;
- `ModelObservationParseV1` and its digest;
- `ProposalStateV1` and its digest;
- `EffectOutcomeBindingV1` and its digest;
- `ConversationStateV1` and `ConversationStateDigestV1`;
- `ModelFeedbackBindingV1` and its digest;
- `RunCheckpointV1` and `RunCheckpointDigestV1`;
- `RunCoordinatorStateV1` and its digest;
- `CompletionHandoffV1` and its digest; and
- the AGE-2 coordinator, transaction, publication, and recovery interfaces
  plus one shared conformance suite.

The exact export imported by AGE-1 is:

- `RunBehaviorContractDigestV1`.

The exact exports imported by AGE-3 are:

- `RunOperationIdV1`;
- `OperationProposalDigestV1`;
- `ActionParameterSetDigestV1`;
- `CoordinatorGenerationV1`; and
- `RunCheckpointDigestV1`.

The exact exports imported by AGE-4 are:

- `RunCheckpointDigestV1`; and
- `ConversationStateDigestV1`.

Section 10 records one additional coordinator-producer export that the
integrated package must add to AGE-4's closed producer union.

## 7. Trust and principal model

### 7.1 Coordinator principal

One exact restricted coordinator principal advances one run generation. It may:

- read the admitted snapshot and current D4 run projection;
- request AGE-4 reads by value under `run-replay`;
- submit bytes to the AGE-4 custody writer under an exact coordinator producer
  binding;
- submit closed checkpoint and effect-intent commands to D4; and
- request AGE-5 completion evaluation.

It cannot receive provider or adapter credentials, claim or consume a permit,
execute a tool, access a custody path, list content, submit an operator
decision, write D4 state directly, or write a terminal result.

The authenticated channel supplies owner, principal, role, daemon epoch, and
current lease. Caller bytes cannot replace those fields.

### 7.2 Pure executable bindings

The proposal parser, operation-identity constructor, conversation serializer,
feedback renderer, and checkpoint constructor are exact admitted executables.
They are deterministic, bounded, and credential-free. Their production
profiles have no network, filesystem mutation, clock, randomness, environment
lookup, registry lookup, or content-store handle.

Input bytes arrive by value with verified schema, length, and digest. Output
bytes remain non-authoritative until D4 and AGE-4 commit their exact metadata
and references.

## 8. Canonical data and identity law

### 8.1 Closed values

Every AGE-2 record is a generated closed schema. Unknown fields, missing
required fields, duplicate keys, alternate tags, invalid numeric forms, and
trailing bytes reject before hashing or state transition.

Counts, ordinals, versions, and limits are exact bounded unsigned integers.
Floating-point values are forbidden. Strings are valid UTF-8 scalar sequences
and receive no Unicode, newline, or whitespace normalization.

### 8.2 Collections

Keyed catalogs declare one semantic key, sort by canonical key bytes, and
reject duplicate keys before lookup. Semantic sets sort by complete canonical
element bytes and reject duplicates. Ordered proposal, message, and checkpoint
sequences preserve semantic order and require contiguous non-zero ordinals.

No decoder repairs ordering, drops duplicates, or applies first-wins or
last-wins behavior.

### 8.3 Digest construction

Metadata digests use:

```text
UTF8(domain) || 0x00 || canonical(root-record)
```

| Digest | Domain |
|---|---|
| `RunBehaviorContractDigestV1` | `prism-age2-run-behavior-contract-v1` |
| `ProposalGrammarBindingDigestV1` | `prism-age2-proposal-grammar-binding-v1` |
| `ProposalParserBindingDigestV1` | `prism-age2-proposal-parser-binding-v1` |
| `ConversationSerializerBindingDigestV1` | `prism-age2-conversation-serializer-binding-v1` |
| `FeedbackRendererBindingDigestV1` | `prism-age2-feedback-renderer-binding-v1` |
| `RunTransitionPolicyDigestV1` | `prism-age2-run-transition-policy-v1` |
| `CoordinatorContentProducerProfileDigestV1` | `prism-age2-coordinator-producer-profile-v1` |
| `CoordinatorContentProducerBindingDigestV1` | `prism-age2-coordinator-producer-binding-v1` |
| `CoordinatorContentBudgetCoverageProofDigestV1` | `prism-age2-coordinator-content-budget-coverage-v1` |
| `CoordinatorGenerationRecordDigestV1` | `prism-age2-coordinator-generation-record-v1` |
| `ModelTurnIdentityDigestV1` | `prism-age2-model-turn-identity-v1` |
| `RunOperationIdentityDigestV1` | `prism-age2-run-operation-identity-v1` |
| `ConversationStateDigestV1` | `prism-age2-conversation-state-v1` |
| `ModelTurnIntentDigestV1` | `prism-age2-model-turn-intent-v1` |
| `ActionParameterSetDigestV1` | `prism-age2-action-parameter-set-v1` |
| `ParsedProposalDigestV1` | `prism-age2-parsed-proposal-v1` |
| `ProposalBatchDigestV1` | `prism-age2-proposal-batch-v1` |
| `ModelObservationParseDigestV1` | `prism-age2-model-observation-parse-v1` |
| `OperationProposalDigestV1` | `prism-age2-operation-proposal-v1` |
| `ProposalStateDigestV1` | `prism-age2-proposal-state-v1` |
| `EffectOutcomeBindingDigestV1` | `prism-age2-effect-outcome-binding-v1` |
| `ModelFeedbackBindingDigestV1` | `prism-age2-model-feedback-binding-v1` |
| `RunCheckpointDigestV1` | `prism-age2-run-checkpoint-v1` |
| `RunCoordinatorStateDigestV1` | `prism-age2-run-coordinator-state-v1` |
| `CompletionHandoffDigestV1` | `prism-age2-completion-handoff-v1` |

Every digest alias is opaque. Each digest-typed field resolves to one local
root above or one explicit import in Section 6.1. Schema generation rejects an
unresolved or multiply owned digest name.

### 8.4 Local scalar contracts

| Type | Canonical constraint |
|---|---|
| `CoordinatorGenerationV1` | Non-zero unsigned 64-bit integer, monotonic within one run |
| `TurnOrdinalV1` | Non-zero unsigned 64-bit integer, contiguous within one run |
| `ProposalOrdinalV1` | Non-zero unsigned 32-bit integer, contiguous within one turn |
| `CheckpointSequenceV1` | Non-zero unsigned 64-bit integer, contiguous within one run |
| `ConversationMessageOrdinalV1` | Non-zero unsigned 64-bit integer, contiguous within one conversation chain |
| `ModelTurnIdV1` | Exactly the 32 digest bytes of `ModelTurnIdentityV1` |
| `RunOperationIdV1` | Exactly the 32 digest bytes of `RunOperationIdentityV1` |
| `RunCheckpointRequestIdV1` | Exactly 32 deterministic digest bytes under the checkpoint-request domain |
| `RunCheckpointTransactionIdV1` | Exactly 16 D4-generated random bytes encoded as 32 lowercase hexadecimal characters |
| `BoundedCoordinatorErrorCodeV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `BoundedCountV1` | Unsigned 32-bit integer |
| `NonZeroBoundedCountV1` | Non-zero unsigned 32-bit integer |
| `BoundedByteCountV1` | Unsigned 64-bit integer with checked arithmetic |
| `CanonicalSortedUniqueSetV1<T>` | Opaque generated-schema brand, never a raw array |

### 8.5 Temporal digest edges

Schema generation rejects same-instance digest cycles. These predecessor
links are the only local temporal back-references:

- an appended `ConversationStateV1` names the prior conversation state;
- a `RunCheckpointV1` names the immediately prior checkpoint; and
- a new `CoordinatorGenerationRecordV1` names the checkpoint and generation
  record that existed before custody changed;
- model-turn intents, operation proposals, parse records, and completion
  handoffs name a source checkpoint that precedes the successor checkpoint
  carrying their digest; and
- a completion handoff names only proposal-state digests committed before the
  handoff transaction. The successor terminal proposal state may then name the
  handoff digest.

Every predecessor has a lower ordinal, sequence, or generation. The successor
under construction can never be its own predecessor. No other local digest
cycle is permitted.

## 9. Reusable run-behavior contract

### 9.1 Proposal grammar and parser

```ts
interface ProposalGrammarBindingV1 {
  schema: "prism-age2-proposal-grammar-binding-v1";
  grammarSchemaDigest: SchemaDigestV1;
  actionDirectiveSchemaDigest: SchemaDigestV1;
  completionDirectiveSchemaDigest: SchemaDigestV1;
  maximumDirectivesPerTurn: NonZeroBoundedCountV1;
  grammarVersion: NonZeroBoundedCountV1;
}

interface ProposalParserBindingV1 {
  schema: "prism-age2-proposal-parser-binding-v1";
  parserExecutionBindingDigest: ExecutionBindingDigest;
  parserDependencyClosureDigest: DependencyClosureDigest;
  parserInputSchemaDigest: SchemaDigestV1;
  parserOutputSchemaDigest: SchemaDigestV1;
  grammarBindingDigest: ProposalGrammarBindingDigestV1;
  deterministicProtocol: "pure-parse-once-v1";
}
```

The parser accepts only exact model-observation bytes under the admitted input
schema. It returns one bounded closed result. It does not resolve grants,
targets, principals, approval policy, or executable aliases.

### 9.2 Conversation serializer and feedback renderer

```ts
interface ConversationSerializerBindingV1 {
  schema: "prism-age2-conversation-serializer-binding-v1";
  serializerExecutionBindingDigest: ExecutionBindingDigest;
  serializerDependencyClosureDigest: DependencyClosureDigest;
  inputConversationSchemaDigest: SchemaDigestV1;
  outputParameterSchemaDigest: SchemaDigestV1;
  serializerVersion: NonZeroBoundedCountV1;
  deterministicProtocol: "committed-conversation-to-parameters-v1";
}

interface FeedbackRendererBindingV1 {
  schema: "prism-age2-feedback-renderer-binding-v1";
  rendererExecutionBindingDigest: ExecutionBindingDigest;
  rendererDependencyClosureDigest: DependencyClosureDigest;
  feedbackSourceSchemaDigest: SchemaDigestV1;
  feedbackSchemaDigest: SchemaDigestV1;
  rendererVersion: NonZeroBoundedCountV1;
  deterministicProtocol: "committed-outcome-to-feedback-v1";
}
```

The serializer reads a verified conversation chain and emits one canonical
model-dispatch parameter value. The feedback renderer accepts one committed
effect outcome and emits one canonical model-feedback value. Neither can add a
tool call, target, principal, grant, decision, permit, retry, or completion
result.

### 9.3 Coordinator producer profiles

```ts
type CoordinatorContentProducerKindV1 =
  | "model-dispatch-parameters"
  | "parsed-action-parameters"
  | "model-feedback";

interface CoordinatorContentProducerProfileV1 {
  schema: "prism-age2-coordinator-producer-profile-v1";
  producerKind: CoordinatorContentProducerKindV1;
  allowedObjectKind: "action-parameters" | "model-feedback";
  maximumContentBytes: BoundedByteCountV1;
}
```

The profile key is `producerKind`. All three values are required exactly once.
The model-dispatch and parsed-action profiles permit only AGE-4
`action-parameters`. The feedback profile permits only AGE-4 `model-feedback`.
Exact source executable, descriptor, and schema enter the derived producer
binding below.

### 9.4 Transition policy

```ts
interface RunTransitionPolicyV1 {
  schema: "prism-age2-run-transition-policy-v1";
  invalidParseDisposition: "feedback-next-turn" | "settle-failed";
  invalidProposalDisposition: "continue-queue" | "feedback-next-turn" | "settle-failed";
  ungrantedProposalDisposition: "continue-queue" | "feedback-next-turn" | "settle-rejected";
  deniedEffectDisposition: "continue-queue" | "feedback-next-turn" | "settle-rejected";
  failedEffectDisposition: "continue-queue" | "feedback-next-turn" | "settle-failed";
  ambiguousEffectDisposition: "settle-ambiguous";
  queuePolicy: "canonical-first-nonterminal-v1";
  maximumRuntimeMessages: NonZeroBoundedCountV1;
}
```

No disposition retries a consumed effect. `continue-queue` means select the
next already committed proposal only after outcome and feedback checkpoints
exist. It does not reparse or regenerate the batch.

Proposal rejection dispositions are evaluated at the batch boundary. The
coordinator first closes proposals in canonical order. If a policy requests
`feedback-next-turn`, it emits at most one aggregate rejection-feedback object
after no queued proposal remains. An immediate settle disposition may leave
later proposals queued because settling permanently prevents their selection.

### 9.5 Root contract

```ts
interface RunBehaviorContractV1 {
  schema: "prism-age2-run-behavior-contract-v1";
  coordinatorPrincipalId: PrincipalId;
  modelDispatchOperationKey: OperationKeyV1;
  proposalGrammar: ProposalGrammarBindingV1;
  proposalParser: ProposalParserBindingV1;
  conversationSerializer: ConversationSerializerBindingV1;
  feedbackRenderer: FeedbackRendererBindingV1;
  coordinatorProducerProfiles:
    CanonicalSortedUniqueSetV1<CoordinatorContentProducerProfileV1>;
  transitionPolicy: RunTransitionPolicyV1;
  operationIdentityProtocol: "stable-origin-derived-v1";
  checkpointProtocol: "d4-linear-checkpoint-chain-v1";
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  schemaBundleDigest: SchemaBundleDigestV1;
}
```

The model operation key must resolve to exactly one granted AGE-3
`model-dispatch` binding during admission. Every executable and profile must
resolve to the exact D1 execution catalogs and complete dependency closure.

AGE-1 requires the admitted run behavior digest to equal the template-bound
digest exactly. There is no narrower runtime variant, latest version, default
renderer, parser fallback, or mutable transition policy.

## 10. Coordinator-derived content authority

### 10.1 Admitted coordinator producer binding

```ts
type CoordinatorContentSourceBindingV1 =
  | {
      kind: "model-dispatch-parameters";
      serializerBindingDigest: ConversationSerializerBindingDigestV1;
      sourceExecutionBindingDigest: ExecutionBindingDigest;
      sourceDependencyClosureDigest: DependencyClosureDigest;
    }
  | {
      kind: "parsed-action-parameters";
      operationKey: OperationKeyV1;
      operationBindingDigest: GrantedOperationBindingDigestV1;
      parameterConstructionBindingDigest: ParameterConstructionBindingDigestV1;
      sourceExecutionBindingDigest: ExecutionBindingDigest;
      sourceDependencyClosureDigest: DependencyClosureDigest;
    }
  | {
      kind: "model-feedback";
      feedbackRendererBindingDigest: FeedbackRendererBindingDigestV1;
      sourceExecutionBindingDigest: ExecutionBindingDigest;
      sourceDependencyClosureDigest: DependencyClosureDigest;
    };

interface CoordinatorContentProducerBindingV1 {
  schema: "prism-age2-coordinator-producer-binding-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  goalTaskImportSetDigest: GoalTaskImportSetDigestV1;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  producerProfileDigest: CoordinatorContentProducerProfileDigestV1;
  source: CoordinatorContentSourceBindingV1;
  coordinatorPrincipalId: PrincipalId;
  contentCustodyBindingDigest: ContentCustodyBindingDigestV1;
  contentCustodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  contentDescriptorDigest: ContentObjectDescriptorDigestV1;
  contentSchemaDigest: SchemaDigestV1;
  maximumContentBytes: BoundedByteCountV1;
}
```

D1 and AGE-2 derive this record after activation from values already committed
by `AdmittedGoalRunV1`, `GoalTaskImportSetV1`, the run-behavior contract, and
the admitted AGE-3 operation catalog where an action constructor is involved.
It adds no authority beyond those roots. The exact record is persisted as a
derived admission attachment and recomputed before every coordinator
publication.

Bindings are created per exact source, not merely per producer kind. A run has
one model serializer binding, one feedback renderer binding, and one parsed
action binding for each admitted operation constructor actually used. A
binding authorizes only the exact descriptor, schema, source executable,
principal, owner, run, custody binding, allowance, and maximum bytes carried
in the record.

### 10.2 Integrated AGE-4 producer lineage

AGE-4 owns the closed `RuntimeContentProducerBindingV1` root and its digest.
For every coordinator publication, D4 constructs its `run-coordinator` arm by
value with the exact `CoordinatorContentProducerBindingDigestV1` supplied by
this contract. AGE-2 does not construct the AGE-4 root and cannot select its
owner domain or union tag.

AGE-4 uses the resulting `RuntimeContentProducerBindingDigestV1` consistently
in `PrepareContentRequestV1`, `ContentDurabilityReceiptV1`,
`PreparedContentCandidateV1`, `ContentReferenceV1`, and reference
verification. Before preparation, D4 and AGE-4 resolve the coordinator digest
in the admitted producer profile and require exact owner, run, custody,
descriptor, schema, principal, executable, dependency, and maximum-byte
parity. The runtime union also has exact `effect-result` and
`completion-verification` arms. It has no generic extension arm.

This wrapping adds lineage, not authority. The coordinator remains limited to
the exact source binding admitted by AGE-1 and AGE-2.

### 10.3 Stable publication identity

Coordinator publication request identity is derived from:

```text
owner domain || run ID || producer binding digest || source checkpoint digest
|| producer kind || semantic ordinal
```

It excludes daemon epoch, lease, coordinator generation, process identity, and
randomness. Retry after response loss therefore returns the same AGE-4
prepared candidate or one exact conflict. A different byte sequence, schema,
descriptor, producer, or ordinal cannot reuse the identity.

### 10.4 Coordinator content budget coverage

```ts
interface CoordinatorContentBudgetCoverageProofV1 {
  schema: "prism-age2-coordinator-content-budget-coverage-v1";
  ownerDomainId: OwnerDomainId;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  grantedOperationCatalogDigest: GrantedOperationCatalogDigestV1;
  effectBudgetPolicyDigest: EffectBudgetPolicyDigestV1;
  checkerExecutionBindingDigest: ExecutionBindingDigest;
  result: "all-coordinator-content-maxima-precharged";
}
```

Before D1 admits the task package, AGE-2 proves:

- the model-dispatch operation's `contentBytes` charge covers the checked sum
  of serialized input maximum, AGE-3 model-result maximum, and one maximum
  aggregate batch-rejection feedback object for that turn;
- each action operation's charge covers the checked sum of its final parameter
  maximum, AGE-3 result maximum, and model-feedback maximum; and
- every maximum is also within the AGE-4 object and run-retention allowance.

Verification parameter and observation coverage belongs to the AGE-5 and
AGE-3 integrated binding and must satisfy the same no-double-count and
no-uncovered-byte rule.

The proof is derived from roots already bound by AGE-1's import set. D1 stores
it as admission evidence. Arithmetic overflow, missing maximum, incomparable
schema, or insufficient charge rejects admission. Lower actual byte use never
refunds the precharge.

Coordinator parameter references and the related AGE-3 reservation commit in
one D4 host transaction. Feedback bytes use content budget already precharged
by the completed action reservation. AGE-2 never maintains a second content
counter.

## 11. Stable model-turn and operation identities

### 11.1 Model turn

```ts
interface ModelTurnIdentityV1 {
  schema: "prism-age2-model-turn-identity-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  turnOrdinal: TurnOrdinalV1;
}
```

`ModelTurnIdV1` is exactly the digest bytes of this root. The turn ordinal is
the next contiguous ordinal in committed run state. It is allocated in the
same checkpoint transaction that commits the model-turn intent.

### 11.2 Run operation

```ts
type RunOperationOriginV1 =
  | { kind: "model-turn"; modelTurnId: ModelTurnIdV1 }
  | { kind: "parsed-action"; parsedProposalDigest: ParsedProposalDigestV1 }
  | { kind: "verification-attempt"; verificationAttemptDigest: VerificationAttemptDigestV1 };

interface RunOperationIdentityV1 {
  schema: "prism-age2-run-operation-identity-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  operationKey: OperationKeyV1;
  origin: RunOperationOriginV1;
}
```

`RunOperationIdV1` is exactly the digest bytes of this root. The identity
excludes daemon epoch, lease, coordinator generation, permit, reservation,
process, wall clock, and random values.

The operation identity commits before AGE-3 reservation. Restart reuses it.
Changing any operation key, origin, source checkpoint, or behavior binding
creates a different operation and cannot replay an earlier reservation.

## 12. Coordinator generation

```ts
type CoordinatorGenerationRecordV1 =
  | {
      schema: "prism-age2-coordinator-generation-record-v1";
      kind: "first";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      coordinatorPrincipalId: PrincipalId;
      generation: CoordinatorGenerationV1;
      admissionCheckpointDigest: AdmissionCheckpointDigest;
      daemonEpoch: DaemonEpoch;
      ownershipLease: OwnershipLeaseIdentity;
      stateVersionAfterAcquisition: SettlementStateVersion;
    }
  | {
      schema: "prism-age2-coordinator-generation-record-v1";
      kind: "successor";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      coordinatorPrincipalId: PrincipalId;
      generation: CoordinatorGenerationV1;
      priorGenerationRecordDigest: CoordinatorGenerationRecordDigestV1;
      sourceCheckpointDigest: RunCheckpointDigestV1;
      daemonEpoch: DaemonEpoch;
      ownershipLease: OwnershipLeaseIdentity;
      stateVersionAfterAcquisition: SettlementStateVersion;
    };
```

D4 allocates a generation only after authenticating the exact coordinator
principal, current daemon epoch, lease, admitted run, and latest checkpoint.
Generation increments by one with checked arithmetic. Overflow permanently
closes coordination for the run.

A stale generation cannot commit a checkpoint or submit a fresh reservation.
Generation change never changes an already committed model-turn, proposal,
operation, parameter, reservation, or checkpoint identity.

## 13. Conversation state

### 13.1 Message bindings

```ts
type ConversationMessageBindingV1 =
  | {
      kind: "model-observation";
      modelTurnId: ModelTurnIdV1;
      effectReceiptDigest: EffectReceiptDigestV1;
      contentReferenceDigest: ContentReferenceDigestV1;
      descriptorDigest: ContentObjectDescriptorDigestV1;
      contentByteDigest: ContentByteDigestV1;
    }
  | {
      kind: "model-feedback";
      feedbackBindingDigest: ModelFeedbackBindingDigestV1;
      contentReferenceDigest: ContentReferenceDigestV1;
      descriptorDigest: ContentObjectDescriptorDigestV1;
      contentByteDigest: ContentByteDigestV1;
    };
```

Only committed model observations and committed model feedback enter the
runtime conversation chain. Tool and verification receipts first pass through
the admitted feedback renderer. Approval views, operator decisions, logs,
provider telemetry, parser errors, and terminal records do not enter the model
conversation unless the transition policy produces an exact feedback object.

### 13.2 Immutable chain

```ts
type ConversationStateV1 =
  | {
      schema: "prism-age2-conversation-state-v1";
      kind: "initial";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      initialConversationDigest: InitialConversationDigestV1;
      runBehaviorContractDigest: RunBehaviorContractDigestV1;
      runtimeMessageCount: 0;
    }
  | {
      schema: "prism-age2-conversation-state-v1";
      kind: "appended";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      initialConversationDigest: InitialConversationDigestV1;
      runBehaviorContractDigest: RunBehaviorContractDigestV1;
      priorConversationStateDigest: ConversationStateDigestV1;
      messageOrdinal: ConversationMessageOrdinalV1;
      message: ConversationMessageBindingV1;
      runtimeMessageCount: BoundedCountV1;
    };
```

The initial state is deterministically derived from the admitted AGE-1 initial
conversation. An append requires `messageOrdinal` and `runtimeMessageCount` to
equal the predecessor count plus one. Checked overflow or the admitted maximum
closes further model turns and enters completion handling.

Each content reference is verified under AGE-4 before append. The descriptor,
byte digest, owner, run, producer, and retention pin must match its declared
message kind. A conversation state contains no raw bytes or paths.

### 13.3 Replay read

The coordinator reads each referenced object only through AGE-4 `run-replay`,
using the exact current `RunCheckpointDigestV1` and
`ConversationStateDigestV1`. It verifies the returned read receipt before
supplying bytes to the serializer or parser.

Missing, corrupt, oversized, wrong-kind, wrong-owner, or continuity-invalid
content fails before a new effect reservation. A read handle, storage path, or
cached unverified byte slice cannot substitute for the by-value result.

## 14. Canonical operation parameters

### 14.1 Closed parameter-set union

```ts
type ActionParameterSetV1 =
  | {
      schema: "prism-age2-action-parameter-set-v1";
      kind: "model-dispatch";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      modelTurnId: ModelTurnIdV1;
      conversationStateDigest: ConversationStateDigestV1;
      serializerBindingDigest: ConversationSerializerBindingDigestV1;
      parameterSchemaDigest: SchemaDigestV1;
      parameterContentReferenceDigest: ContentReferenceDigestV1;
      parameterContentByteDigest: ContentByteDigestV1;
      producerBindingDigest: CoordinatorContentProducerBindingDigestV1;
    }
  | {
      schema: "prism-age2-action-parameter-set-v1";
      kind: "model-action";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      modelTurnId: ModelTurnIdV1;
      proposalOrdinal: ProposalOrdinalV1;
      operationKey: OperationKeyV1;
      parameterConstructionBindingDigest: ParameterConstructionBindingDigestV1;
      parameterSchemaDigest: SchemaDigestV1;
      parameterContentReferenceDigest: ContentReferenceDigestV1;
      parameterContentByteDigest: ContentByteDigestV1;
      producerBindingDigest: CoordinatorContentProducerBindingDigestV1;
    }
  | {
      schema: "prism-age2-action-parameter-set-v1";
      kind: "verification";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      verificationAttemptDigest: VerificationAttemptDigestV1;
      operationKey: OperationKeyV1;
      parameterSchemaDigest: SchemaDigestV1;
      parameterContentReferenceDigest: ContentReferenceDigestV1;
      parameterContentByteDigest: ContentByteDigestV1;
    };
```

The historical type name `ActionParameterSetV1` covers every AGE-3 operation
because AGE-3 already imports that exact name. Its tagged arms make model,
action, and verification parameters non-substitutable.

Every parameter value is canonical AGE-4 `action-parameters` content. The root
binds the exact schema, byte digest, reference, producer, and source identity.
It grants no execution authority by itself.

### 14.2 Parameter construction

For model dispatch, the admitted conversation serializer reads the complete
verified conversation and produces one canonical parameter value.

For a model action, the admitted AGE-3 parameter constructor receives only the
parser's canonical directive value. It resolves no operation alias or target.
The selected `OperationKeyV1` and exact granted binding select the constructor,
not model text.

AGE-5 supplies verification subject and parameter construction. AGE-2 binds
its resulting attempt, operation key, schema, and content reference without
interpreting the verification predicate.

## 15. Model-turn intent

### 15.1 Operation proposal

```ts
type OperationProposalOriginV1 =
  | { kind: "model-turn"; modelTurnId: ModelTurnIdV1 }
  | { kind: "model-action"; parsedProposalDigest: ParsedProposalDigestV1 }
  | { kind: "verification"; verificationAttemptDigest: VerificationAttemptDigestV1 };

interface OperationProposalV1 {
  schema: "prism-age2-operation-proposal-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  actionParameterSetDigest: ActionParameterSetDigestV1;
  inputContentReferences: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  origin: OperationProposalOriginV1;
}
```

This is the exact `OperationProposalDigestV1` AGE-3 imports. It is a committed
execution intent, not raw model output. D4 verifies that the operation ID is
the correct digest-derived identity for the origin and source checkpoint.

### 15.2 Model intent root

```ts
interface ModelTurnIntentV1 {
  schema: "prism-age2-model-turn-intent-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  modelTurnId: ModelTurnIdV1;
  turnOrdinal: TurnOrdinalV1;
  operationId: RunOperationIdV1;
  operationProposalDigest: OperationProposalDigestV1;
  actionParameterSetDigest: ActionParameterSetDigestV1;
  conversationStateDigest: ConversationStateDigestV1;
  modelDispatchOperationKey: OperationKeyV1;
  modelDispatchBindingDigest: GrantedOperationBindingDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
}
```

The coordinator serializes model parameters and obtains only an AGE-4 prepared
candidate under the exact producer binding. The candidate is durable but has
no content-reference or run authority.

D4 then uses one host transaction to construct and append two consecutive
checkpoints. It first constructs the AGE-4 reference, parameter set, operation
proposal, model-turn intent, and `model-turn-intent` checkpoint. It uses that
checkpoint as the AGE-3 reservation source, claims the complete content and
effect precharge, creates the reservation, and appends the `effect-reserved`
checkpoint. Both checkpoints, the content reference, and the reservation
commit or none do.

The intent identity is therefore committed before reservation in transaction
order, while parameter content cannot become authoritative without the same
budget claim. A model call never starts from an in-memory turn or a freshly
rendered conversation.

## 16. Model observation and one-time parse

### 16.1 Observation checkpoint

A successful model-dispatch receipt must use AGE-3's `content` result and an
AGE-4 `model-observation` descriptor. D4 verifies the exact operation,
reservation, receipt, content reference, descriptor, schema, byte digest, and
turn identity before committing a `model-observation` checkpoint.

That checkpoint appends the observation reference to `ConversationStateV1`.
The appended state becomes the sole parse input identity. A no-content model
receipt, wrong descriptor, missing reference, or reference not attached to the
exact receipt cannot advance.

### 16.2 Parsed proposal values

```ts
type ParsedDirectiveCandidateV1 =
  | {
      kind: "action";
      proposalOrdinal: ProposalOrdinalV1;
      requestedOperationKey: OperationKeyV1;
      canonicalParameterCandidate: BoundedByteString;
    }
  | { kind: "propose-completion"; proposalOrdinal: ProposalOrdinalV1 }
  | {
      kind: "invalid";
      proposalOrdinal: ProposalOrdinalV1;
      errorCode: BoundedCoordinatorErrorCodeV1;
    };

interface ParserOutputV1 {
  schema: "prism-age2-parser-output-v1";
  directives: ReadonlyArray<ParsedDirectiveCandidateV1>;
}

type ParsedProposalV1 =
  | {
      schema: "prism-age2-parsed-proposal-v1";
      kind: "action";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      modelTurnId: ModelTurnIdV1;
      proposalOrdinal: ProposalOrdinalV1;
      requestedOperationKey: OperationKeyV1;
      parameterCandidateSchemaDigest: SchemaDigestV1;
      canonicalParameterCandidate: BoundedByteString;
    }
  | {
      schema: "prism-age2-parsed-proposal-v1";
      kind: "propose-completion";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      modelTurnId: ModelTurnIdV1;
      proposalOrdinal: ProposalOrdinalV1;
    }
  | {
      schema: "prism-age2-parsed-proposal-v1";
      kind: "invalid";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      modelTurnId: ModelTurnIdV1;
      proposalOrdinal: ProposalOrdinalV1;
      errorCode: BoundedCoordinatorErrorCodeV1;
    };

interface ProposalBatchV1 {
  schema: "prism-age2-proposal-batch-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  modelTurnId: ModelTurnIdV1;
  observationReferenceDigest: ContentReferenceDigestV1;
  parserBindingDigest: ProposalParserBindingDigestV1;
  orderedProposalDigests: ReadonlyArray<ParsedProposalDigestV1>;
}
```

Proposal identity is the digest of the complete proposal root. Its turn and
ordinal are stable. The batch preserves parser order, requires contiguous
ordinals, rejects duplicate digests, contains at least one proposal, and
cannot exceed the grammar maximum. A total parse failure becomes one
`invalid` proposal at ordinal one.

An action proposal carries the bounded canonical parser candidate as proposal
metadata. It is not executable parameters or a content reference. When the
proposal is selected, the exact AGE-3 parameter constructor transforms this
candidate into final AGE-4 `action-parameters` content inside the same host
transaction as reservation and budget claim. A completion proposal contains
no parameters, terminal result, verification result, or authority.

### 16.3 Parse record

```ts
interface ModelObservationParseV1 {
  schema: "prism-age2-model-observation-parse-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  modelTurnId: ModelTurnIdV1;
  observationCheckpointDigest: RunCheckpointDigestV1;
  observationReferenceDigest: ContentReferenceDigestV1;
  observationContentByteDigest: ContentByteDigestV1;
  parserBindingDigest: ProposalParserBindingDigestV1;
  grammarBindingDigest: ProposalGrammarBindingDigestV1;
  proposalBatchDigest: ProposalBatchDigestV1;
}
```

The semantic key is `(ownerDomainId, runId, modelTurnId,
observationReferenceDigest)`. Before running parser code, the coordinator asks
D4 for an existing committed parse record. Exact replay returns it.

If no record exists, the exact admitted parser may run against the verified
committed bytes. D4 commits the parse record, proposal roots, batch, initial
proposal states, and parse checkpoint in one transaction. It does not construct
an action parameter set, operation proposal, or parameter content reference at
parse time. After commitment, no parser version or process may parse that
observation again for run progression.

Parser crash before commitment may rerun only the same executable and same
bytes under the stable semantic key. Nondeterministic output for the same key
is an integrity conflict and closes the run before a new effect.

## 17. Proposal state and deterministic selection

### 17.1 Closed state union

```ts
type ProposalTerminalOutcomeV1 =
  | { kind: "effect-receipt"; effectReceiptDigest: EffectReceiptDigestV1 }
  | { kind: "effect-recovery"; effectRecoveryRecordDigest: EffectRecoveryRecordDigestV1 }
  | { kind: "effect-rejected"; effectStateDigest: EffectStateDigestV1 }
  | { kind: "coordination-rejected"; errorCode: BoundedCoordinatorErrorCodeV1 }
  | { kind: "completion-handoff"; completionHandoffDigest: CompletionHandoffDigestV1 };

type ProposalLifecycleV1 =
  | { kind: "queued" }
  | { kind: "rejected-invalid"; errorCode: BoundedCoordinatorErrorCodeV1 }
  | { kind: "rejected-not-granted"; operationKey: OperationKeyV1 }
  | {
      kind: "selected-action";
      operationId: RunOperationIdV1;
      operationKey: OperationKeyV1;
    }
  | { kind: "selected-completion" }
  | {
      kind: "effect-reserved";
      operationId: RunOperationIdV1;
      operationProposalDigest: OperationProposalDigestV1;
      effectReservationDigest: EffectReservationDigestV1;
    }
  | {
      kind: "awaiting-approval";
      operationId: RunOperationIdV1;
      effectReservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    }
  | { kind: "terminal-outcome"; outcome: ProposalTerminalOutcomeV1 };

interface ProposalStateV1 {
  schema: "prism-age2-proposal-state-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  modelTurnId: ModelTurnIdV1;
  parsedProposalDigest: ParsedProposalDigestV1;
  proposalOrdinal: ProposalOrdinalV1;
  state: ProposalLifecycleV1;
  stateVersion: SettlementStateVersion;
}
```

The semantic key is `(ownerDomainId, runId, parsedProposalDigest)`. State
replay returns the exact existing record. The proposal's immutable root never
changes when its lifecycle advances.

### 17.2 Selection law

Only the lowest-ordinal proposal whose state is `queued` may be considered.
The coordinator performs these checks in order:

1. Validate the proposal root, turn, ordinal, batch, parser, and checkpoint.
2. If `invalid`, commit `rejected-invalid` and apply transition policy.
3. If `action`, resolve its exact operation key in the admitted AGE-3 catalog.
4. If no exact grant exists, commit `rejected-not-granted`; do not reserve.
5. Revalidate the bounded canonical parameter candidate, its parser-declared
   schema, the exact parameter constructor, and the complete granted operation
   binding. No final parameter set or content reference exists yet.
6. Derive one stable run operation identity.
7. Change an action proposal to `selected-action` in the same checkpoint
   transaction. Final parameters and the operation proposal do not exist yet.
8. If the proposal requests completion, create no operation identity or AGE-3
   reservation. Commit `selected-completion`, bind that pre-handoff state into
   the completion handoff, then atomically commit the handoff, terminal proposal
   outcome, and `settling` checkpoint.

At most one proposal in a run may be `selected-action`,
`selected-completion`, `effect-reserved`, or `awaiting-approval`. AGE-3
independently enforces one nonterminal effect.

### 17.3 Legal transitions

| From | To |
|---|---|
| `queued` action | `rejected-invalid`, `rejected-not-granted`, or `selected-action` |
| `queued` completion | `selected-completion` |
| `selected-action` | `effect-reserved` or `terminal-outcome` if parameter construction or reservation rejects |
| `selected-completion` | `terminal-outcome` carrying the completion handoff |
| `effect-reserved` | `awaiting-approval` or `terminal-outcome` |
| `awaiting-approval` | `terminal-outcome` for the same existing reservation |

Terminal proposal states never reopen. Approval does not return a proposal to
either selected state, create a new operation, or authorize a new reservation.

## 18. AGE-3 reservation handoff

### 18.1 Exact request construction

For one deterministic operation draft, the coordinator supplies D4 with:

- the admitted run and current generation;
- the stable operation identity and its model-turn, selected-action, or
  verification-attempt origin;
- the exact operation key and granted binding digest;
- one coordinator-prepared parameter candidate or one existing AGE-5
  verification-parameter reference;
- the current predecessor checkpoint, two stable checkpoint request IDs, and
  expected D4 state version; and
- a target candidate derived only through AGE-3's admitted binding and trusted
  outward resolver where applicable.

D4 constructs the final AGE-4 reference, `ActionParameterSetV1`,
`OperationProposalV1`, role-specific intent evidence, intent checkpoint, and
`EffectReservationRequestV1`. It authenticates the command and invokes the
AGE-3 transaction port. The coordinator cannot call that internal port,
choose a principal, select a raw target, or alter a budget or deadline.

### 18.2 Atomic reservation and checkpoint

The D4 transaction that commits an AGE-3 reservation also commits the
parameter reference, complete intent, and two consecutive AGE-2 checkpoints.
It performs all or none of:

1. validate current checkpoint, mode, generation, epoch, lease, and state
   version;
2. verify the prepared parameter candidate or AGE-5 parameter reference;
3. construct the content reference, parameter set, operation proposal, and
   role-specific intent evidence;
4. construct the intent checkpoint at predecessor sequence plus one;
5. call AGE-3 reservation using that intent checkpoint as source, including
   the full content precharge and one-open-effect check;
6. insert or replay the reservation and change the selected action proposal to
   `effect-reserved` when applicable;
7. construct the reserved checkpoint at the next sequence;
8. insert both checkpoints, AGE-4 attachment, AGE-3 reservation, and updated
   coordinator projection; and
9. commit one D4 transaction acknowledgement.

A committed reservation never exists without its preceding intent checkpoint
and following reserved checkpoint. Parameter content never receives a
run-scoped reference without the same transaction's precharge.

If AGE-3 rejects before creating a reservation, the combined transaction
commits none of its references, intents, proposals, or checkpoints. The
prepared candidate remains non-authoritative. For a selected action, D4 may
then commit the exact `coordination-rejected` terminal proposal state through
the `proposal-coordination-rejected` checkpoint arm. For a model draft, AGE-2
must commit a completion handoff and enter `settling` before another model
effect. A verification rejection returns to AGE-5 while the run remains in
`settling`. D4 does not fabricate a reservation digest or refund a budget claim
that AGE-3 actually committed.

### 18.3 Approval observation

When AGE-3 enters `awaiting-approval`, AGE-2 may commit an
`effect-awaiting-approval` checkpoint referencing the exact reservation and
effect-state digest. That checkpoint grants no decision or permit authority.

The coordinator stops issuing new work and waits for the existing AGE-3 state
to become terminal or consumable through AGE-5 and D4. Restart returns to the
same reservation. It never selects another proposal while approval is pending.

## 19. Effect outcomes and model feedback

### 19.1 Outcome binding

```ts
type CoordinatedEffectRoleV1 = "model" | "action" | "verification";

type CoordinatedEffectOutcomeV1 =
  | {
      kind: "receipted-content";
      effectReceiptDigest: EffectReceiptDigestV1;
      resultContentReferenceDigest: ContentReferenceDigestV1;
    }
  | {
      kind: "receipted-no-content";
      effectReceiptDigest: EffectReceiptDigestV1;
    }
  | {
      kind: "rejected";
      terminalEffectStateDigest: EffectStateDigestV1;
    }
  | {
      kind: "recovered";
      effectRecoveryRecordDigest: EffectRecoveryRecordDigestV1;
      terminalEffectStateDigest: EffectStateDigestV1;
    };

interface EffectOutcomeBindingV1 {
  schema: "prism-age2-effect-outcome-binding-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  role: CoordinatedEffectRoleV1;
  operationId: RunOperationIdV1;
  operationProposalDigest: OperationProposalDigestV1;
  effectReservationDigest: EffectReservationDigestV1;
  outcome: CoordinatedEffectOutcomeV1;
}
```

The result-content reference exists only in the `receipted-content` arm.
Model dispatch requires that arm. No-content is legal only when the exact
AGE-3 receipt contract permits it.

AGE-2 validates and records an outcome. It cannot reinterpret an AGE-3
rejection, convert uncertainty to success, retry a consumed effect, or replace
the receipt's content reference.

### 19.2 Feedback binding

```ts
type ModelFeedbackSourceV1 =
  | {
      kind: "effect-outcome";
      sourceProposalDigest: ParsedProposalDigestV1;
      effectOutcomeBindingDigest: EffectOutcomeBindingDigestV1;
      budgetSourceReservationDigest: EffectReservationDigestV1;
    }
  | {
      kind: "batch-rejections";
      proposalBatchDigest: ProposalBatchDigestV1;
      rejectedProposalStateDigests: CanonicalSortedUniqueSetV1<ProposalStateDigestV1>;
      modelTurnReservationDigest: EffectReservationDigestV1;
    };

interface ModelFeedbackBindingV1 {
  schema: "prism-age2-model-feedback-binding-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  source: ModelFeedbackSourceV1;
  rendererBindingDigest: FeedbackRendererBindingDigestV1;
  feedbackSchemaDigest: SchemaDigestV1;
  feedbackContentReferenceDigest: ContentReferenceDigestV1;
  feedbackContentByteDigest: ContentByteDigestV1;
  producerBindingDigest: CoordinatorContentProducerBindingDigestV1;
}
```

After an action outcome, the exact feedback renderer produces one bounded
canonical value. AGE-4 publishes it under the `model-feedback` descriptor. D4
atomically commits the reference, feedback binding, appended conversation
state, feedback checkpoint, and next coordinator mode.

The semantic key is `(ownerDomainId, runId, canonical(source))`. Identical
replay returns the committed bytes and binding. A different renderer result
for the same key is an integrity conflict.

Once feedback commits, restart never rerenders it. `continue-queue` may then
select the next committed proposal. `feedback-next-turn` starts a new model
turn from the conversation containing that exact feedback.

### 19.3 Verification outcome

Verification receipts return to AGE-5 through an exact
`EffectOutcomeBindingV1`. AGE-2 may checkpoint the binding and restore
`settling`, but it does not map the observation to pass, fail, or uncertainty.
Only the AGE-5 verification and completion contracts own that interpretation.

## 20. Coordinator modes and transitions

### 20.1 Closed mode union

```ts
type OpenEffectModeBindingV1 =
  | {
      role: "model";
      modelTurnId: ModelTurnIdV1;
      operationId: RunOperationIdV1;
      operationProposalDigest: OperationProposalDigestV1;
    }
  | {
      role: "action";
      parsedProposalDigest: ParsedProposalDigestV1;
      operationId: RunOperationIdV1;
      operationProposalDigest: OperationProposalDigestV1;
    }
  | {
      role: "verification";
      verificationAttemptDigest: VerificationAttemptDigestV1;
      operationId: RunOperationIdV1;
      operationProposalDigest: OperationProposalDigestV1;
    };

type RunCoordinatorModeV1 =
  | { kind: "initializing"; admissionCheckpointDigest: AdmissionCheckpointDigest }
  | { kind: "ready" }
  | { kind: "effect-intent"; effect: OpenEffectModeBindingV1 }
  | {
      kind: "effect-open";
      effect: OpenEffectModeBindingV1;
      effectReservationDigest: EffectReservationDigestV1;
    }
  | {
      kind: "awaiting-approval";
      effect: OpenEffectModeBindingV1;
      effectReservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
    }
  | {
      kind: "settling";
      completionHandoffDigest: CompletionHandoffDigestV1;
    }
  | {
      kind: "terminal-observed";
      terminalResultDigest: RunTerminalResultDigestV1;
    };
```

The mode contains no optional operation or reservation. `effect-intent` means
identity and parameters have been ordered before reservation inside the same
D4 transaction. It is legal only as the first checkpoint's resulting mode in
the atomic intent-and-reservation pair. It is never the externally visible
current coordinator projection. `effect-open` means the exact AGE-3
reservation exists. `awaiting-approval` refers to that same reservation.

`terminal-observed` is a read-only projection of the AGE-5 and D4 terminal
record. AGE-2 does not write it as a new run checkpoint after terminal.

### 20.2 Run projection

```ts
type ActiveRunCoordinatorModeV1 = Exclude<
  RunCoordinatorModeV1,
  { kind: "initializing" } | { kind: "effect-intent" }
>;

type RunCoordinatorStateV1 =
  | {
      schema: "prism-age2-run-coordinator-state-v1";
      kind: "initializing";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      runBehaviorContractDigest: RunBehaviorContractDigestV1;
      admissionCheckpointDigest: AdmissionCheckpointDigest;
      initialConversationStateDigest: ConversationStateDigestV1;
      nextTurnOrdinal: TurnOrdinalV1;
      nextCheckpointSequence: CheckpointSequenceV1;
      settlementStateVersion: SettlementStateVersion;
    }
  | {
      schema: "prism-age2-run-coordinator-state-v1";
      kind: "active";
      ownerDomainId: OwnerDomainId;
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      runBehaviorContractDigest: RunBehaviorContractDigestV1;
      coordinatorGeneration: CoordinatorGenerationV1;
      currentCheckpointDigest: RunCheckpointDigestV1;
      currentConversationStateDigest: ConversationStateDigestV1;
      mode: ActiveRunCoordinatorModeV1;
      nextTurnOrdinal: TurnOrdinalV1;
      nextCheckpointSequence: CheckpointSequenceV1;
      settlementStateVersion: SettlementStateVersion;
    };
```

D4 stores this as a projection of committed records. The latest checkpoint
contains the same generation, conversation, and resulting mode. Any mismatch
is an integrity incident; the projection cannot override the checkpoint.

The initializing arm has no coordinator generation or AGE-2 checkpoint. The
active arm cannot carry the initializing or transaction-internal
`effect-intent` mode.

### 20.3 Legal mode transitions

| From | To | Required committed cause |
|---|---|---|
| `initializing` | `ready` | First generation and initial conversation checkpoint |
| `ready` | `effect-intent` model | First checkpoint of the atomic model intent-and-reservation transaction |
| `ready` | `effect-intent` action | First checkpoint of the atomic selected-action intent-and-reservation transaction |
| `ready` | `settling` | Completion proposal, finite-stop rule, or authenticated cancellation handoff |
| `effect-intent` | `effect-open` | Second checkpoint of the same transaction; same operation reserved through AGE-3 |
| `effect-open` | `awaiting-approval` | Exact AGE-3 effect-state observation |
| `effect-open` | `ready` or `settling` | Exact terminal AGE-3 outcome and required checkpoint or feedback |
| `awaiting-approval` | `ready` or `settling` | Same reservation reaches exact terminal AGE-3 outcome |
| `settling` | `effect-intent` verification | AGE-5 commits a bounded verification attempt |
| `settling` | `terminal-observed` | AGE-5 and D4 terminal result exists |
| verification `effect-open` | `settling` | Verification outcome checkpoint returned to AGE-5 |

No other transition is legal. A new model or action effect cannot start from
`effect-open`, `awaiting-approval`, or `settling`. Terminal projection never
returns to a nonterminal mode. The two transitions through `effect-intent`
commit atomically. If reservation rejects, neither transition nor checkpoint
commits and the externally visible mode remains at its predecessor.

### 20.4 Ready-mode priority

`ready` is not a scheduler choice. D4 and AGE-2 apply this fixed priority:

1. Resume one `selected-action` whose parameter and reservation transaction is
   not committed.
2. Commit a missing parse for the latest model observation.
3. Commit missing feedback for a terminal action outcome.
4. Advance the canonical first queued proposal in the current batch.
5. Emit one aggregate batch-rejection feedback if policy requires it and the
   batch has no queued proposal.
6. Start the next model turn if no batch work remains and bounds permit it.
7. Enter `settling` when completion, policy, message, or budget conditions
   require stopping.

The first applicable item is the only legal next semantic command. Recovery
queries existing records before evaluating this list.

## 21. Run checkpoints

### 21.1 Common fields

```ts
type RunCheckpointPredecessorV1 =
  | { kind: "admission"; admissionCheckpointDigest: AdmissionCheckpointDigest }
  | { kind: "run-checkpoint"; priorRunCheckpointDigest: RunCheckpointDigestV1 };

interface RunCheckpointCommonV1 {
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  checkpointRequestId: RunCheckpointRequestIdV1;
  checkpointSequence: CheckpointSequenceV1;
  predecessor: RunCheckpointPredecessorV1;
  coordinatorGeneration: CoordinatorGenerationV1;
  conversationStateDigest: ConversationStateDigestV1;
  stateVersionAfterCommit: SettlementStateVersion;
  checkpointTransactionId: RunCheckpointTransactionIdV1;
}
```

The request identity derives from run, predecessor, stage, and stage semantic
identity. It excludes epoch, lease, generation, response channel, and random
values. The final checkpoint records generation and D4 transaction identity
for fencing and evidence.

### 21.2 Stage and resulting mode

```ts
type RunCheckpointBodyV1 =
  | {
      stage: "generation-acquired";
      generationRecordDigest: CoordinatorGenerationRecordDigestV1;
      resultingMode: { kind: "ready" };
    }
  | { stage: "ready"; resultingMode: { kind: "ready" } }
  | {
      stage: "model-turn-intent";
      modelTurnIntentDigest: ModelTurnIntentDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "effect-intent" }>;
    }
  | {
      stage: "action-intent";
      parsedProposalDigest: ParsedProposalDigestV1;
      operationProposalDigest: OperationProposalDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "effect-intent" }>;
    }
  | {
      stage: "effect-reserved";
      effect: OpenEffectModeBindingV1;
      operationProposalDigest: OperationProposalDigestV1;
      effectReservationDigest: EffectReservationDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "effect-open" }>;
    }
  | {
      stage: "effect-awaiting-approval";
      effect: OpenEffectModeBindingV1;
      effectReservationDigest: EffectReservationDigestV1;
      effectStateDigest: EffectStateDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "awaiting-approval" }>;
    }
  | {
      stage: "model-observation";
      modelTurnId: ModelTurnIdV1;
      effectOutcomeBindingDigest: EffectOutcomeBindingDigestV1;
      conversationStateDigest: ConversationStateDigestV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "model-parse";
      parseDigest: ModelObservationParseDigestV1;
      proposalBatchDigest: ProposalBatchDigestV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "proposal-selected-action";
      parsedProposalDigest: ParsedProposalDigestV1;
      proposalStateDigest: ProposalStateDigestV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "proposal-coordination-rejected";
      parsedProposalDigest: ParsedProposalDigestV1;
      terminalProposalStateDigest: ProposalStateDigestV1;
      errorCode: BoundedCoordinatorErrorCodeV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "proposal-selected-completion";
      parsedProposalDigest: ParsedProposalDigestV1;
      selectedProposalStateDigest: ProposalStateDigestV1;
      completionHandoffDigest: CompletionHandoffDigestV1;
      terminalProposalStateDigest: ProposalStateDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "settling" }>;
    }
  | {
      stage: "effect-outcome-ready";
      effectOutcomeBindingDigest: EffectOutcomeBindingDigestV1;
      proposalStateDigest: ProposalStateDigestV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "effect-outcome-settling";
      effectOutcomeBindingDigest: EffectOutcomeBindingDigestV1;
      proposalStateDigest: ProposalStateDigestV1;
      completionHandoffDigest: CompletionHandoffDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "settling" }>;
    }
  | {
      stage: "feedback-committed";
      feedbackBindingDigest: ModelFeedbackBindingDigestV1;
      conversationStateDigest: ConversationStateDigestV1;
      resultingMode: { kind: "ready" };
    }
  | {
      stage: "verification-intent";
      verificationAttemptDigest: VerificationAttemptDigestV1;
      operationProposalDigest: OperationProposalDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "effect-intent" }>;
    }
  | {
      stage: "settling";
      completionHandoffDigest: CompletionHandoffDigestV1;
      resultingMode: Extract<RunCoordinatorModeV1, { kind: "settling" }>;
    };

interface RunCheckpointV1 {
  schema: "prism-age2-run-checkpoint-v1";
  common: RunCheckpointCommonV1;
  body: RunCheckpointBodyV1;
}
```

The body union makes stage and mode combinations structural. D4 additionally
requires repeated operation, effect, reservation, conversation, proposal, and
completion identities to match field-for-field across the body.

### 21.3 Append law

D4 appends a checkpoint only when:

- the predecessor is the current checkpoint, or the AGE-1 admission checkpoint
  for the first append;
- sequence is predecessor sequence plus one;
- generation, epoch, lease, coordinator principal, and expected state version
  are current;
- all stage roots and content references recompute and match;
- the proposed mode transition is legal; and
- no terminal result already exists.

The semantic uniqueness key is `(ownerDomainId, runId,
checkpointRequestId)`. Identical replay returns the same checkpoint and state
projection. Changed predecessor, payload, generation, content, mode, sequence,
or expected authority conflicts.

## 22. Atomic coordinator content and checkpoint commitment

### 22.1 Parameter content

Serialized model parameters and selected action parameters follow Section
18.2. Their reference, parameter set, operation proposal, intent checkpoint,
AGE-3 budget claim and reservation, and reserved checkpoint all commit in one host
transaction. No earlier checkpoint or reference exposes those parameter bytes.

### 22.2 Feedback content

Model feedback uses this order:

1. Authenticate the current coordinator and exact feedback producer binding.
2. Verify the exact budget-source reservation and its coordinator content
   budget coverage proof. Effect feedback uses the action reservation. Parse
   and proposal-rejection feedback is aggregated once per batch and uses the
   preceding model-turn reservation.
3. Prepare bytes through AGE-4 under the stable publication identity.
4. Verify the prepared candidate, durability receipt, descriptor, schema,
   byte digest, owner, run, custody, and producer.
5. Inside one D4 host transaction, allocate the reference-commit identity and
   deterministically construct the AGE-4 content reference.
6. Construct the feedback binding and appended conversation state.
7. Construct and hash the final feedback checkpoint.
8. Call AGE-4's transaction port with a `run-checkpoint` attachment carrying
   that checkpoint digest.
9. Insert the AGE-2 roots, reference, retention pin, checkpoint, and updated
   coordinator projection, or commit none.

The AGE-4 reference root does not include its attachment, so references are
computable before the checkpoint that attaches them. The checkpoint includes
the reference digests. This ordering has no digest cycle.

### 22.3 Failure and replay

A failed transaction may leave durable prepared candidates, but never a
checkpoint pointing to absent content and never an authoritative content
reference detached from a checkpoint.

Restart reuses publication and checkpoint request identities. AGE-4 returns
the identical candidate for identical bytes. D4 returns the identical
checkpoint for an already committed request. A changed candidate or checkpoint
under the same identity is an integrity conflict, not a second append.

Model observations already have AGE-3 receipt-attached content references.
AGE-2 reuses and pins those references in its checkpoint; it does not publish
or duplicate the observation bytes.

## 23. Restart and recovery

### 23.1 Recovery procedure

On startup or custody transfer, the coordinator:

1. rehydrates the exact AGE-1 admitted snapshot and recomputes every bound root;
2. verifies the run-behavior contract and every executable dependency closure;
3. reads D4's current terminal result, coordinator projection, latest
   checkpoint, generation, and open AGE-3 effect state;
4. verifies the checkpoint chain to the admission checkpoint and all referenced
   AGE-4 content by digest and continuity;
5. acquires one new fenced coordinator generation when the run is nonterminal;
6. chooses the single recovery row matching committed state; and
7. issues only that row's idempotent next command.

Mutable templates, current registries, parser aliases, renderer aliases,
cached model output, process memory, and logs are not recovery sources.

### 23.2 Exact recovery matrix

| Durable state | Required recovery |
|---|---|
| Admission exists, no AGE-2 checkpoint | Derive initial conversation, acquire first generation, commit first ready checkpoint |
| Ready checkpoint | Deterministically select first queued proposal, start next model turn, or enter settling |
| Selected action exists, no AGE-3 reservation | Reuse its stable operation identity, rerun only the exact constructor if no prepared candidate exists, and submit the same combined intent-and-reservation command |
| Prepared model or action parameter candidate exists, no paired checkpoints | Reverify the candidate and submit the same combined intent-and-reservation command |
| Intent checkpoint appears as the externally visible latest checkpoint without its reserved successor | Treat as transaction-integrity failure; do not reserve or advance |
| AGE-3 reservation exists, combined-transaction response lost | Query the reservation and both stable checkpoint request identities, then replay the same combined command if needed; never create another reservation |
| Effect awaiting approval | Wait on the same reservation; do not issue new work or challenge authority |
| Effect permit may have been consumed | Invoke AGE-3 recovery; never redispatch from AGE-2 |
| Trustworthy effect receipt exists, outcome checkpoint missing | Bind the exact receipt and commit the missing outcome checkpoint once |
| Model observation checkpoint exists, no parse record | Query by parse semantic key, then run only the admitted parser on exact bytes if no record committed |
| Parse record exists | Return it; never reparse the observation |
| Proposal batch exists, no selection | Select the canonical first queued proposal once |
| Action outcome exists, feedback missing | Run the same admitted renderer and stable publication request, then commit feedback once |
| Prepared feedback content exists, checkpoint absent | Reverify candidate and resume the same atomic reference/checkpoint transaction |
| Settling checkpoint exists | Resume the same AGE-5 completion request or verification attempt |
| Terminal result exists | Return immutable terminal projection; commit no new AGE-2 checkpoint |

### 23.3 Integrity failures

Before effect consumption, corrupt checkpoint or content state prevents new
authority and enters AGE-5 with a proven failure reason. If an effect was
consumed, AGE-2 first accepts AGE-3's receipt or ambiguity recovery and cannot
rewrite it as an internal parse or checkpoint failure.

A stale coordinator generation can read immutable records for diagnosis but
cannot publish coordinator content, reserve an effect, append a checkpoint, or
enter completion.

## 24. Finite progression

### 24.1 Progress measure

Every non-replay transition must do exactly one of these things:

- consume a model-dispatch, action-effect, or verification-attempt budget slot
  through AGE-3 or AGE-5;
- advance one bounded proposal from `queued` to a non-queued state;
- advance one open effect to a later AGE-3 state without creating another;
- append one missing deterministic content, parse, feedback, or checkpoint
  record in the acyclic step sequence; or
- enter `settling` or observe an immutable terminal result.

Pure coordinator steps form a finite directed acyclic sequence between
budget-consuming effects. No pure step has a self-loop, and exact replay makes
no progress mutation.

### 24.2 Bounded queues and messages

Each proposal batch is bounded by the run-behavior grammar maximum. Each
proposal leaves `queued` at most once. A batch cannot gain proposals after its
parse checkpoint.

The conversation is bounded by `maximumRuntimeMessages`. A new model turn also
requires AGE-3 to claim the admitted model-dispatch charge. If either bound is
unavailable, the coordinator enters AGE-5 completion handling instead of
spinning or truncating content.

### 24.3 Budget ownership

AGE-2 observes exact AGE-3 budget policy, ledger, claim, and rejection
identities but does not maintain a second counter. It does not estimate
provider use or reconstruct active time. AGE-3 remains authoritative for model,
action, provider, and content precharges. AGE-5 remains authoritative for
verification attempt limits and completion retry policy.

Rejection, denial, crash, replay, or unused precharge never causes AGE-2 to
refund or decrement a budget.

### 24.4 No autonomous livelock

The conformance model checker must prove that every reachable nonterminal state
has one deterministic next command, one external wait on an existing effect or
operator gate, or one finite-stop transition. It must reject transition-policy
combinations that can cycle without consuming a budget or closing a queued
proposal.

An unavailable external dependency does not authorize polling without bound.
D2 scheduling may wake the run, but AGE-2 persists the wait state and performs
no semantic transition until committed authority changes.

## 25. AGE-5 completion and verification handoff

### 25.1 Completion reasons

```ts
type CompletionHandoffReasonV1 =
  | { kind: "model-proposed"; proposalDigest: ParsedProposalDigestV1 }
  | { kind: "model-budget-unavailable"; budgetLedgerDigest: EffectBudgetLedgerDigestV1 }
  | { kind: "action-budget-unavailable"; budgetLedgerDigest: EffectBudgetLedgerDigestV1 }
  | { kind: "conversation-limit-reached" }
  | { kind: "transition-policy-stop"; errorCode: BoundedCoordinatorErrorCodeV1 }
  | { kind: "effect-ambiguous"; effectRecoveryRecordDigest: EffectRecoveryRecordDigestV1 }
  | { kind: "authenticated-cancellation"; completionRequestDigest: CompletionRequestDigestV1 };

interface CompletionHandoffV1 {
  schema: "prism-age2-completion-handoff-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  conversationStateDigest: ConversationStateDigestV1;
  preHandoffProposalStateDigests: CanonicalSortedUniqueSetV1<ProposalStateDigestV1>;
  reason: CompletionHandoffReasonV1;
  coordinatorGeneration: CoordinatorGenerationV1;
}
```

The handoff states why coordination stopped and binds the exact run evidence
available to AGE-5. It is not a terminal result, completion pass, failure
classification, cancellation decision, or verification result.

### 25.2 Entering settling

D4 commits the completion handoff, `settling` checkpoint, and coordinator mode
atomically. After that transaction, AGE-2 cannot start a model or action effect
unless AGE-5 commits a specific verification attempt and the run remains
nonterminal.

Identical completion request replay returns the same handoff. Changed reason,
checkpoint, proposal set, policy, conversation, or generation conflicts.

### 25.3 Verification loop

When AGE-5 requires verification, it first commits one exact
`VerificationAttemptDigestV1` under its finite policy. AGE-2 then:

1. derives a stable verification operation ID from that attempt;
2. binds AGE-5's canonical verification parameters as
   `ActionParameterSetV1`;
3. commits one verification operation proposal and intent checkpoint;
4. reserves it through the same AGE-3 path as every other effect;
5. checkpoints the exact AGE-3 outcome; and
6. returns to `settling` with that outcome for AGE-5 interpretation.

AGE-2 cannot choose a verifier, predicate, subject, result mapping, or retry
count. Post-consumption verification uncertainty follows AGE-3 ambiguity and
cannot automatically create another attempt.

### 25.4 Terminal observation

Only D4 and AGE-5 commit `RunTerminalResultDigestV1`. AGE-2 may expose a
`terminal-observed` projection after verifying that result against the current
settling state. It appends no checkpoint, feedback, proposal, or conversation
message after terminal commitment.

## 26. Interfaces

### 26.1 Coordinator decisions

```ts
type RunCoordinatorNextDecisionV1 =
  | { kind: "acquire-generation" }
  | {
      kind: "derive-model-parameters";
      conversationStateDigest: ConversationStateDigestV1;
    }
  | {
      kind: "parse-model-observation";
      modelTurnId: ModelTurnIdV1;
      observationReferenceDigest: ContentReferenceDigestV1;
    }
  | { kind: "derive-action-parameters"; parsedProposalDigest: ParsedProposalDigestV1 }
  | { kind: "derive-feedback"; source: ModelFeedbackSourceV1 }
  | { kind: "commit-checkpoint"; command: CommitRunCheckpointCommandV1 }
  | { kind: "reserve-effect"; command: ReserveCoordinatedEffectCommandV1 }
  | { kind: "wait-existing-effect"; effectReservationDigest: EffectReservationDigestV1 }
  | { kind: "begin-completion"; command: BeginCompletionCommandV1 }
  | { kind: "terminal"; terminalResultDigest: RunTerminalResultDigestV1 };

interface RunCoordinator {
  next(
    input: AuthenticatedCoordinatorCommand<ReadRunCoordinatorStateV1>,
  ): Promise<RunCoordinatorNextDecisionV1 | RunCoordinationRejectV1>;
}
```

`next` is a pure decision over authenticated, verified state. It does not
perform the returned command and has no executor, custody, or D4 writer handle.

### 26.2 Commands

```ts
interface ReadRunCoordinatorStateV1 {
  schema: "prism-age2-read-coordinator-state-v1";
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
}

type AcquireCoordinatorGenerationCommandV1 =
  | {
      schema: "prism-age2-acquire-generation-v1";
      kind: "first";
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      admissionCheckpointDigest: AdmissionCheckpointDigest;
      expectedSettlementStateVersion: SettlementStateVersion;
    }
  | {
      schema: "prism-age2-acquire-generation-v1";
      kind: "successor";
      runId: RunId;
      admittedGoalRunDigest: AdmittedGoalRunDigestV1;
      priorGenerationRecordDigest: CoordinatorGenerationRecordDigestV1;
      currentCheckpointDigest: RunCheckpointDigestV1;
      expectedSettlementStateVersion: SettlementStateVersion;
    };

interface CheckpointPreparedContentV1 {
  publicationRequestId: ContentPublicationRequestIdV1;
  producerBindingDigest: CoordinatorContentProducerBindingDigestV1;
  preparedCandidateDigest: PreparedContentCandidateDigestV1;
  durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
  descriptorDigest: ContentObjectDescriptorDigestV1;
  expectedContentByteDigest: ContentByteDigestV1;
}

type CoordinatedParameterInputV1 =
  | {
      kind: "coordinator-prepared";
      content: CheckpointPreparedContentV1;
    }
  | {
      kind: "verification-reference";
      verificationAttemptDigest: VerificationAttemptDigestV1;
      parameterSchemaDigest: SchemaDigestV1;
      parameterContentReferenceDigest: ContentReferenceDigestV1;
      parameterContentByteDigest: ContentByteDigestV1;
    };

type CoordinatedOperationDraftV1 =
  | {
      kind: "model";
      modelTurnIdentity: ModelTurnIdentityV1;
      operationIdentity: RunOperationIdentityV1;
      operationKey: OperationKeyV1;
      operationBindingDigest: GrantedOperationBindingDigestV1;
      conversationStateDigest: ConversationStateDigestV1;
    }
  | {
      kind: "action";
      parsedProposalDigest: ParsedProposalDigestV1;
      operationIdentity: RunOperationIdentityV1;
      operationKey: OperationKeyV1;
      operationBindingDigest: GrantedOperationBindingDigestV1;
    }
  | {
      kind: "verification";
      verificationAttemptDigest: VerificationAttemptDigestV1;
      operationIdentity: RunOperationIdentityV1;
      operationKey: OperationKeyV1;
      operationBindingDigest: GrantedOperationBindingDigestV1;
    };

type ReservationOwnedCheckpointBodyV1 = Extract<
  RunCheckpointBodyV1,
  | { stage: "model-turn-intent" }
  | { stage: "action-intent" }
  | { stage: "verification-intent" }
  | { stage: "effect-reserved" }
>;

type StandaloneRunCheckpointBodyV1 = Exclude<
  RunCheckpointBodyV1,
  ReservationOwnedCheckpointBodyV1
>;

interface CommitRunCheckpointCommandV1 {
  schema: "prism-age2-commit-run-checkpoint-v1";
  checkpointRequestId: RunCheckpointRequestIdV1;
  runId: RunId;
  predecessor: RunCheckpointPredecessorV1;
  coordinatorGeneration: CoordinatorGenerationV1;
  expectedCurrentMode: RunCoordinatorModeV1;
  proposedBody: StandaloneRunCheckpointBodyV1;
  preparedContent: ReadonlyArray<CheckpointPreparedContentV1>;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface ReserveCoordinatedEffectCommandV1 {
  schema: "prism-age2-reserve-coordinated-effect-v1";
  runId: RunId;
  coordinatorGeneration: CoordinatorGenerationV1;
  predecessorCheckpointDigest: RunCheckpointDigestV1;
  operationDraft: CoordinatedOperationDraftV1;
  parameterInput: CoordinatedParameterInputV1;
  target: EffectTargetBindingV1;
  intentCheckpointRequestId: RunCheckpointRequestIdV1;
  reservedCheckpointRequestId: RunCheckpointRequestIdV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface BeginCompletionCommandV1 {
  schema: "prism-age2-begin-completion-v1";
  runId: RunId;
  coordinatorGeneration: CoordinatorGenerationV1;
  completionHandoff: CompletionHandoffV1;
  settlingCheckpointRequestId: RunCheckpointRequestIdV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The authenticated channel supplies owner, coordinator principal, role, epoch,
and lease. D4 rejects caller-supplied replacements.

The four reservation-owned checkpoint stages are constructible only inside
`reserveEffect`. `commitCheckpoint` cannot accept an intent checkpoint or a
reserved checkpoint by itself, even from an authenticated coordinator.

### 26.3 D4 transaction port

```ts
interface RunCoordinationTransactionPort {
  acquireGeneration(
    tx: HostTransactionContext,
    input: AcquireCoordinatorGenerationCommandV1,
  ): Promise<CoordinatorGenerationRecordV1 | RunCoordinationRejectV1>;

  commitCheckpoint(
    tx: HostTransactionContext,
    input: CommitRunCheckpointCommandV1,
  ): Promise<RunCheckpointV1 | RunCoordinationRejectV1>;

  reserveEffect(
    tx: HostTransactionContext,
    input: ReserveCoordinatedEffectCommandV1,
  ): Promise<RunCheckpointV1 | RunCoordinationRejectV1>;

  beginCompletion(
    tx: HostTransactionContext,
    input: BeginCompletionCommandV1,
  ): Promise<RunCheckpointV1 | RunCoordinationRejectV1>;
}
```

This port is internal to D4. The coordinator, parser, serializer, renderer,
model, broker, tools, verifier, operator channel, consumer, and external
observer cannot call it directly.

### 26.4 Pure derivation ports

```ts
interface ConversationSerializer {
  serialize(
    conversationStateDigest: ConversationStateDigestV1,
    verifiedMessages: ReadonlyArray<BoundedByteString>,
  ): Promise<BoundedByteString | RunCoordinationRejectV1>;
}

interface ModelObservationParser {
  parse(
    observationReferenceDigest: ContentReferenceDigestV1,
    verifiedObservationBytes: BoundedByteString,
  ): Promise<ParserOutputV1 | RunCoordinationRejectV1>;
}

interface ModelFeedbackRenderer {
  render(
    source: ModelFeedbackSourceV1,
  ): Promise<BoundedByteString | RunCoordinationRejectV1>;
}
```

Production adapters receive exact binding context from the admitted
run-behavior contract. The compact signatures omit that immutable context but
do not permit ambient lookup.

### 26.5 Rejection union

```ts
type RunCoordinationRejectReasonV1 =
  | "authentication-failed"
  | "admitted-snapshot-invalid"
  | "binding-drift"
  | "checkpoint-conflict"
  | "content-invalid"
  | "generation-stale"
  | "identity-conflict"
  | "illegal-transition"
  | "parse-integrity-conflict"
  | "proposal-order-conflict"
  | "state-version-conflict"
  | "terminal-state-exists";

interface RunCoordinationRejectV1 {
  kind: "rejected";
  reason: RunCoordinationRejectReasonV1;
}
```

A rejection union contains no replacement authority, retry grant, raw content,
path, endpoint, credential, or terminal classification.

## 27. Failure semantics

| Condition | Required result |
|---|---|
| Run-behavior digest differs from the template-bound value | Reject admission or startup; no coordination |
| Parser, serializer, renderer, grammar, producer profile, codec, or schema drifts | Reject before new authority |
| Coordinator-derived publication lacks the closed producer-union reconciliation | Package is not ratifiable; production publication remains blocked |
| Checkpoint predecessor, sequence, generation, mode, lease, epoch, or state version is stale | Reject; current checkpoint unchanged |
| Conversation or referenced content is missing, corrupt, wrong-kind, or cross-owner | Fail closed before a new effect |
| Same model observation yields a different parse under one semantic key | Integrity conflict; no proposal selection |
| Proposal is malformed | Durable `rejected-invalid`; follow admitted policy |
| Proposal operation is not exactly granted | Durable `rejected-not-granted`; no reservation |
| Non-first queued proposal is selected | Reject selection; queue unchanged |
| Second proposal or effect is made nonterminal | Reject; existing proposal and AGE-3 effect unchanged |
| Reservation commits but checkpoint response is lost | Replay returns the atomically paired checkpoint; never reserve again |
| Permit may have been consumed | Delegate to AGE-3 recovery; never redispatch |
| Feedback or parameter publication response is lost | Replay stable publication and checkpoint identities |
| Pure transition would loop without budget use or queue closure | Reject run-behavior contract before admission |
| Completion handoff commits | No new model or action effect; only exact AGE-5 verification may return to effect intent |
| Terminal result exists | Return immutable terminal projection; no AGE-2 mutation |

## 28. Proposed AGE-2 invariant refinements

These aliases refine the accepted architecture's invariant families. Final IDs
belong to the successor constitutional baseline.

| Alias | Target statement | Proof class |
|---|---|---|
| `AGE2-INV-BEHAVIOR` | Every run uses one template-bound parser, grammar, serializer, feedback renderer, transition policy, producer profile set, codec, and schema bundle. | Static plus runtime adversarial |
| `AGE2-INV-IDENTITY` | Every model turn, parsed proposal, and AGE-3 operation has one deterministic identity committed before effect reservation and stable across restart. | Runtime adversarial |
| `AGE2-INV-PARSE` | A committed model observation has one committed parse result and proposal batch; restart never reparses or changes proposal order. | Runtime adversarial |
| `AGE2-INV-SERIAL` | Only the canonical first queued proposal may advance, and one run has at most one selected proposal and one open AGE-3 effect. | Runtime adversarial |
| `AGE2-INV-CHECKPOINT` | Every semantic transition appends one fenced predecessor-linked checkpoint, and content-bearing checkpoints atomically attach durable AGE-4 references. | Runtime adversarial |
| `AGE2-INV-REPLAY` | Restart reuses committed conversation, parameters, feedback, parse, proposal, operation, effect, and checkpoint identities without regeneration or redispatch. | Runtime adversarial |
| `AGE2-INV-FINITE` | Every non-replay transition consumes a finite allowance, closes bounded queued work, advances an existing effect, advances an acyclic pure step, or enters settling. | Static plus runtime model checking |
| `AGE2-INV-BOUNDARY` | The coordinator has no credentials, permit claim, effect executor, operator decision, direct settlement write, terminal write, or downstream application authority. | Static plus runtime adversarial |

## 29. Conformance requirements

One generated suite must run unchanged against the in-memory test adapter and
the production durable adapter. It must include:

1. canonical fixtures for every AGE-2 root, union arm, domain, collection
   ordering, duplicate rejection, and single-field mutation;
2. run-behavior admission tests for executable, dependency, grammar, profile,
   policy, codec, schema, model-operation, and principal drift;
3. model-turn and operation identity tests across daemon epoch, lease,
   generation, process, response-loss, and restart changes;
4. conversation and producer tests for wrong owner, kind, schema, bytes,
   profile, source executable, custody binding, allowance, and message order;
5. parse-once races with concurrent parsers, response loss before and after
   commit, nondeterministic parser output, corrupted observations, and parser
   version drift;
6. proposal-order tests with invalid, ungranted, completion, denied, failed,
   ambiguous, and multiple action directives;
7. atomic AGE-3 reservation and AGE-2 checkpoint tests on both sides of budget
   claim, reservation insert, checkpoint insert, and acknowledgement;
8. content-reference and checkpoint fault injection before and after candidate
   publication, reference construction, attachment, feedback append, and
   commit;
9. restart tests for every row in Section 23.2, including consumed effects and
   missing feedback; and
10. finite-state model checking proving no unauthorized transition, duplicate
    operation, duplicate parse, second open effect, pure livelock, or
    post-terminal mutation is reachable.

Two independent canonical codecs must reproduce every AGE-2 digest and reject
alternate encodings. Static capability tests must prove the coordinator and
pure executables cannot reach provider credentials, outward credentials,
local capability handles, AGE-3 permit claim or executor ports, AGE-4 paths or
write handles, AGE-5 decision submission, or D4 mutation internals.

This milestone runs structural draft verification only. It does not run
independent package hardening, constitutional proof registration, or code tests.

## 30. Package and downstream boundary

### 30.1 Existing interface closure

AGE-2's exact existing exports satisfy:

- AGE-1's `RunBehaviorContractDigestV1` import;
- AGE-3's `RunOperationIdV1`, `OperationProposalDigestV1`,
  `ActionParameterSetDigestV1`, `CoordinatorGenerationV1`, and
  `RunCheckpointDigestV1` imports; and
- AGE-4's `RunCheckpointDigestV1`, `ConversationStateDigestV1`, and
  `CoordinatorContentProducerBindingDigestV1` imports.

### 30.2 Integrated producer reconciliation

AGE-4's closed `RuntimeContentProducerBindingV1` includes the exact
`run-coordinator` arm required by Section 10.2. D4 constructs that arm from
this contract's `CoordinatorContentProducerBindingDigestV1`, and AGE-4 carries
the resulting digest through preparation, durability, candidate, reference,
and verification records. The union also closes the AGE-3 and AGE-5 producer
arms without a generic extension.

This resolves the only producer interface delta introduced by AGE-2. It does
not authorize implementation or migration.

### 30.3 AGE-5 dependency

AGE-5 may import AGE-2 checkpoints, conversation state, proposal state,
operation proposals, effect outcomes, completion handoffs, and coordinator
mode. It owns approval, verification interpretation, completion, terminal
evidence, and late observations. It cannot ask AGE-2 to bypass AGE-3 or mutate
a committed checkpoint.

Work programs, governed adaptation, external observability, installation,
deployment, publication, release, and AGE-6 remain outside AGE-2. A checkpoint,
proposal, terminal artifact, or content reference grants none of those powers.

## 31. Draft closure record

This draft now participates in one reconciled AGE-1 through AGE-5 package. It
defines the run-behavior identity, coordinator producer authority, stable
operation identities, conversation and parse lineage, proposal queue,
checkpoint chain, mode transitions, restart matrix, finite progression, and
AGE-3/AGE-5 handoffs.

It does not:

- ratify AGE-2 or the integrated AGE package;
- assign successor constitutional invariant IDs;
- run independent hardening;
- authorize implementation, migration, installation, deployment, live
  provider execution, publication, or release; or
- reconcile retired D8-era downstream documents.

All AGE-2 cross-contract package seams are resolved. The next authorized
milestone is the successor constitutional baseline under a separate
instruction.
