# Prism Harness AGE-3 Effect Authority contract specification

Date: 2026-08-27

Owner: Vora Technologies, LLC

Status: draft contract, not ratified and not implementation authority

Accepted architecture object:
`5fc1443f9d8e740d4811a02d9e3a5dd637a12184`

## 1. Purpose

AGE-3 defines the complete authority boundary for every model dispatch, local
tool operation, outward tool operation, and verification operation in an
autonomous goal run.

It turns a non-executable authority request into exact admitted operation
bindings. During a run, it resolves one exact target, reserves one effect,
claims discrete budget, issues one kind-tagged permit, records one permit
consumption, and accepts one trustworthy receipt or one explicit ambiguity
result.

AGE-3 does not infer authority from prompts, tool names, approval text, raw
endpoints, or provider responses. Every authority-bearing value is closed,
digest-bound, and written through D4 under the current D2 epoch and lease.

## 2. Source of truth and precedence

This contract is subordinate to:

1. runtime authority and project instructions;
2. the accepted autonomous goal-execution architecture with Git object
   `5fc1443f9d8e740d4811a02d9e3a5dd637a12184`;
3. the architecture acceptance record with Git object
   `d47455756eac691c5cc8b3dc0aa774f6f04c2227`;
4. the AGE-1 contract draft with Git object
   `4c376d39a36e63699ea6bc43d09b89d9291fd4cf`; and
5. the AGE-4 contract draft with Git object
   `adf893bf8f7e79a19d89dfc421af00d78100ae47`.

This document may refine AGE-3 fields and transitions. It may not reassign
ownership held by AGE-1, AGE-2, AGE-4, AGE-5, or D1 through D7.

The frozen D8 revision 8 pair is retired historical evidence. It is not a
source of active design authority for this contract and remains byte-identical.

## 3. Scope

AGE-3 owns:

- requested effect-authority envelopes and subset proof;
- exact granted operation catalogs and operation bindings;
- local capability and outward destination authority;
- trusted outward destination resolution;
- effect reservations and the one-open-effect constraint;
- monotonic discrete budget claims and ledgers;
- epoch-local reservation, approval-gate, permit, and executor deadlines;
- kind-tagged permit issue, replay, and one-use consumption;
- content-producer lineage and effect receipt contracts;
- receipt commitment, ambiguity, and restart recovery; and
- the AGE-3 adapter conformance suite.

## 4. Non-goals and ownership exclusions

AGE-3 does not own:

- task templates, goal schemas, submissions, or admitted-run identity, which
  belong to AGE-1;
- model-turn progression, proposal parsing, operation IDs, checkpoints, or
  feedback construction, which belong to AGE-2;
- content bytes, publication, readback, references, access, retention, or
  deletion, which belong to AGE-4;
- approval rendering, operator authentication semantics, decision protocol,
  verification predicates, completion policy, terminal outcomes, or late
  supplemental observations, which belong to AGE-5;
- provider credentials, host lease issuance, process capacity, or protected
  root custody, which remain under D2 and D3;
- a second settlement writer, because D4 remains the only writer of effect
  state; or
- opaque external-agent execution, installation, deployment, publication,
  governed adaptation, external observability authority, or AGE-6.

Approval can authorize only an already granted and already resolved effect. It
cannot create an operation, change a target, increase a budget, extend a
deadline, replace a principal, or authorize a retry.

## 5. Contract vocabulary

| Term | Meaning |
|---|---|
| Requested authority | A template-bound maximum that D1 may consider; it grants no executable capability |
| Operation key | The closed kind, owner-ratified operation ID, and exact operation version used for lookup |
| Granted operation binding | The complete executable, principal, parameter, target, budget, deadline, and receipt contract for one operation key |
| Local capability | One provisioned whole-boundary capability available only to an exact restricted executor |
| Destination capability | One owner-pinned, non-protected outward target under an exact adapter and principal |
| Resolved destination | The single admitted destination capability selected by the trusted resolver before reservation |
| Reservation | The first durable effect record, coupled atomically to one budget claim and one-open-effect enforcement |
| Permit | A kind-tagged, epoch-bound, lease-bound, deadline-bound capability claimable only by the exact admitted executor |
| Consumption | D4's durable one-use record sampled strictly before the permit deadline, after which execution may have occurred |
| Receipt | An authenticated observation binding the consumed permit to its exact operation, target, environment, usage, and closed result |
| Ambiguous | A terminal effect result meaning execution may have occurred but no trustworthy receipt can prove the outcome |

## 6. Imported and exported contracts

### 6.1 Imports

AGE-3 imports these types without redefining their internals:

| Owner | Imported type | AGE-3 use |
|---|---|---|
| D1 | `OwnerDomainId`, `AuthorizationPolicyDigest`, `SchemaDigestV1`, `ExecutionBindingDigest`, `DependencyClosureDigest`, `EffectiveGrantDigest`, `ExecutionBindingCatalogDigest`, `ProviderBrokerBindingCatalogDigest` | Owner partition, admitted grants, exact schemas, executables, adapters, and dependency closure |
| D2 | `RunId`, `DaemonEpoch`, `OwnershipLeaseIdentity`, `PrincipalId`, `RoleId`, `ProductionEnvironmentId`, `EpochMonotonicInstantV1`, `EpochMonotonicDeadlineV1`, `HostTransactionContext`, `AuthenticatedEffectCommand<T>`, `ProvisionedLocalCapabilityDigestV1` | Fencing, trusted time, authenticated principals, host environment, local capabilities, transport authentication, and shared transaction context |
| D4 | `SettlementStateVersion`, `ReferenceCommitTransactionId` | One-writer compare-and-set and atomic content-reference attachment |
| AGE-1 | `GoalTaskDigestV1`, `AdmittedGoalRunDigestV1` | Exact admitted task and run authority |
| AGE-2 | `RunOperationIdV1`, `OperationProposalDigestV1`, `ActionParameterSetDigestV1`, `CoordinatorGenerationV1`, `RunCheckpointDigestV1` | Stable operation identity, parsed proposal identity, parameters, generation, and checkpoint lineage |
| AGE-4 | `ContentCustodyAllowanceDigestV1`, `ContentCustodyBindingDigestV1`, `ContentObjectDescriptorDigestV1`, `PreparedContentCandidateDigestV1`, `ContentDurabilityReceiptDigestV1`, `ContentReferenceDigestV1`, `ContentByteDigestV1` | Result publication and by-reference receipt content |
| AGE-5 | `ApprovalPolicyBindingDigestV1`, `ApprovalSubjectDigestV1`, `ApprovalGateDigestV1`, `ApprovalDecisionDigestV1`, `ApprovalDecisionOutcomeV1`, `VerificationSubjectContractDigestV1`, `CompletionRequestDigestV1` | Approval, verification, and authenticated cancellation identities without operator rendering or decision ownership |
| D6 contract package | `CanonicalCodecBindingDigestV1`, `SchemaBundleDigestV1`, `BoundedByteString` | Exact codec, generated closed schemas, and bounded canonical bytes |

All AGE-2 and AGE-5 imports resolve to exact roots in this reconciled package.
An unresolved or multiply owned imported root still blocks ratification.

### 6.2 Exports

AGE-3 exports:

- `EffectClassIdV1` as the closed effect-class scalar used by AGE-5;
- `RequestedAuthorityEnvelopeV1` and
  `RequestedAuthorityEnvelopeDigestV1`;
- `GrantedOperationCatalogV1` and `GrantedOperationCatalogDigestV1`;
- `GrantedOperationBindingV1` and its digest;
- `GrantedVerificationOperationBindingV1` and its digest;
- `EffectBudgetPolicyV1`, `EffectBudgetLedgerV1`, and their digests;
- `EffectDeadlinePolicyV1` and its digest;
- `ContentProducerBindingV1` and
  `ContentProducerBindingDigestV1`;
- `ProtectedDestinationTaxonomyV1` and its digest;
- `GrantableDestinationCatalogV1` and its digest;
- `ResolvedOutwardDestinationV1` and its digest;
- `EffectReservationV1` and `EffectReservationDigestV1`;
- `CancelUnconsumedEffectCommandV1` for D4's internal cancellation
  compare-and-set;
- `EffectPermitV1`, `EffectConsumptionV1`, and their digests;
- `EffectReceiptSubmissionV1`, `EffectReceiptV1`, and their digests;
- `EffectAmbiguityRecordV1`, `EffectRecoveryRecordV1`, and their digests; and
- `AuthoritySubsetProofV1`, `EffectRecoveryEvidenceV1`, and their digests; and
- `ExecutorReconciliationObservationV1` and its digest; and
- the AGE-3 admission, resolver, transaction, executor, receipt, and recovery
  interfaces plus one shared conformance suite.

The four exports imported by AGE-1 are exactly:

- `RequestedAuthorityEnvelopeDigestV1`;
- `GrantedOperationCatalogDigestV1`;
- `EffectBudgetPolicyDigestV1`; and
- `EffectDeadlinePolicyDigestV1`.

The three exports imported by AGE-4 are exactly:

- `ContentProducerBindingDigestV1`;
- `EffectReservationDigestV1`; and
- `EffectReceiptDigestV1`.

## 7. Trust and principal model

### 7.1 Principals

| Action | Only authorized principal |
|---|---|
| Model dispatch | Exact D3 broker principal in the admitted provider binding |
| Local tool execution | Exact restricted local executor in the local capability binding |
| Outward resolution | Exact resolver principal in the resolver binding |
| Outward execution | Exact destination-adapter principal in the resolved capability |
| Verification | Exact read-only verifier executor selected by the AGE-5 completion binding |
| Effect-state mutation | D4 transaction writer under current D2 epoch and ownership lease |
| Receipt submission | The same exact executor principal that consumed the permit |

The authenticated channel supplies owner domain, principal, role, daemon
epoch, and current lease. Caller content cannot assert or replace those values.

### 7.2 No ambient authority

Executors receive only the consumed permit arm for their effect kind plus
content bytes read by value under the exact AGE-4 reservation authority. They
do not receive registry handles, arbitrary filesystem paths, provider
credentials, generic network clients, destination catalogs, content-store
handles, operator credentials, or D4 writer access.

Provider credentials remain inside the D3 broker. Outward adapter credentials
remain inside the exact admitted adapter. Local tools receive only provisioned
capabilities. A permit never contains a secret.

## 8. Canonical data and identity law

### 8.1 Closed values

Every AGE-3 record is a generated closed schema. Unknown fields, missing
required fields, duplicate keys, alternate tags, noncanonical numbers, and
trailing bytes reject before hashing, admission, reservation, permit issue,
consumption, or receipt commitment.

All identifiers and counts use exact bounded integer or byte-string schemas.
Floating-point values are forbidden in authority and accounting records.
Strings are valid UTF-8 scalar sequences and receive no Unicode, newline, or
whitespace normalization.

### 8.2 Collections

Keyed catalogs declare one semantic key, sort by canonical key bytes, and
reject duplicate key bytes before map construction. Semantic sets sort by
complete canonical element bytes and reject duplicates. Ordered event and
claim sequences preserve order and use contiguous non-zero ordinals.

No decoder repairs order, discards duplicates, or applies first-wins or
last-wins behavior.

### 8.3 Digest construction

Metadata digests use:

```text
UTF8(domain) || 0x00 || canonical(root-record)
```

| Digest | Domain |
|---|---|
| `RequestedAuthorityEnvelopeDigestV1` | `prism-age3-requested-authority-v1` |
| `GrantedOperationCatalogDigestV1` | `prism-age3-granted-operation-catalog-v1` |
| `GrantedOperationBindingDigestV1` | `prism-age3-granted-operation-binding-v1` |
| `GrantedVerificationOperationBindingDigestV1` | `prism-age3-granted-verification-binding-v1` |
| `EffectClassificationDigestV1` | `prism-age3-effect-classification-v1` |
| `ParameterConstructionBindingDigestV1` | `prism-age3-parameter-construction-v1` |
| `EffectReceiptContractDigestV1` | `prism-age3-receipt-contract-v1` |
| `ContentProducerBindingDigestV1` | `prism-age3-content-producer-v1` |
| `LocalCapabilityBindingDigestV1` | `prism-age3-local-capability-v1` |
| `ProtectedDestinationTaxonomyDigestV1` | `prism-age3-protected-destination-taxonomy-v1` |
| `GrantableDestinationCatalogDigestV1` | `prism-age3-grantable-destination-catalog-v1` |
| `OutwardDestinationCapabilityDigestV1` | `prism-age3-outward-destination-capability-v1` |
| `OutwardDestinationResolverBindingDigestV1` | `prism-age3-outward-resolver-binding-v1` |
| `OutwardOperationAuthorityDigestV1` | `prism-age3-outward-operation-authority-v1` |
| `DestinationSelectorValueDigestV1` | `prism-age3-destination-selector-value-v1` |
| `DestinationClassificationSubjectDigestV1` | `prism-age3-destination-classification-subject-v1` |
| `DestinationClassificationEvidenceDigestV1` | `prism-age3-destination-classification-evidence-v1` |
| `OpaqueDestinationIdentityDigestV1` | `prism-age3-opaque-destination-identity-v1` |
| `ResolvedOutwardDestinationDigestV1` | `prism-age3-resolved-outward-destination-v1` |
| `EffectBudgetPolicyDigestV1` | `prism-age3-budget-policy-v1` |
| `EffectBudgetClaimDigestV1` | `prism-age3-budget-claim-v1` |
| `EffectBudgetLedgerDigestV1` | `prism-age3-budget-ledger-v1` |
| `EffectDeadlinePolicyDigestV1` | `prism-age3-deadline-policy-v1` |
| `EffectReservationRequestDigestV1` | `prism-age3-reservation-request-v1` |
| `EffectReservationDigestV1` | `prism-age3-reservation-v1` |
| `EffectStateDigestV1` | `prism-age3-effect-state-v1` |
| `EffectPermitClaimDigestV1` | `prism-age3-permit-claim-v1` |
| `EffectPermitDigestV1` | `prism-age3-permit-v1` |
| `EffectExecutionRequestDigestV1` | `prism-age3-execution-request-v1` |
| `EffectConsumptionDigestV1` | `prism-age3-consumption-v1` |
| `EffectReceiptSubmissionDigestV1` | `prism-age3-receipt-submission-v1` |
| `EffectReceiptDigestV1` | `prism-age3-receipt-v1` |
| `EffectAmbiguityRecordDigestV1` | `prism-age3-ambiguity-v1` |
| `EffectRecoveryRecordDigestV1` | `prism-age3-recovery-v1` |
| `AuthoritySubsetProofDigestV1` | `prism-age3-authority-subset-proof-v1` |
| `EffectRecoveryEvidenceDigestV1` | `prism-age3-recovery-evidence-v1` |
| `ExecutorReconciliationObservationDigestV1` | `prism-age3-executor-reconciliation-observation-v1` |

Every digest alias is opaque. Every digest-typed field must resolve to one
local root above or one explicit import in Section 6.1. The complete schema
bundle fails generation on an unresolved or multiply owned digest name.

### 8.4 Local scalar contracts

| Type | Canonical constraint |
|---|---|
| `OperationIdV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `OperationVersionV1` | Non-zero unsigned 64-bit integer |
| `EffectClassIdV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `LocalCapabilityClassIdV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `GrantableDestinationClassIdV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `DestinationCapabilityIdV1` | Exactly 16 owner-generated random bytes encoded as 32 lowercase hexadecimal characters |
| `DestinationSelectorKeyV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}`; never an endpoint, path, hostname, account number, or free-form label |
| `EffectPermitIdV1` | Exactly 16 D4-generated random bytes encoded as 32 lowercase hexadecimal characters |
| `EffectTransactionIdV1` | Exactly 16 D4-generated random bytes encoded as 32 lowercase hexadecimal characters |
| `EffectSequenceV1` | Non-zero unsigned 64-bit integer, contiguous within one run |
| `BudgetUnitsV1` | Unsigned 64-bit integer with checked addition |
| `MonotonicDurationNanosV1` | Non-zero unsigned 64-bit integer interpreted only in one daemon epoch |
| `CanonicalSortedUniqueSetV1<T>` | Opaque generated-schema brand, never a raw array |

### 8.5 Digest acyclicity and temporal back-references

Schema generation rejects a root that includes its own digest or any
same-instance digest cycle. Local digest dependencies must form a directed
acyclic graph except for these two strict temporal back-reference shapes:

- `EffectBudgetClaimV1.priorLedgerDigest` points to the immutable ledger whose
  claim list and ordinal precede the new claim. The new ledger may then include
  the claim digest.
- `EffectRecoveryEvidenceV1.observedStateDigest` points to the immutable
  pre-recovery state. A later ambiguity, recovery, or effect-state record may
  include that evidence digest only with a greater settlement version.

Adapters validate the lower ordinal or lower state version before hashing the
successor. No reference may point to the successor under construction. The
AGE-4 content-reference and AGE-3 receipt ordering in Section 21.4 is a separate
acyclic construction and permits no additional exception.

## 9. Requested authority

### 9.1 Effect kinds and operation keys

```ts
type EffectKindV1 =
  | "model-dispatch"
  | "local-tool"
  | "outward-tool"
  | "verification";

interface OperationKeyV1 {
  kind: EffectKindV1;
  operationId: OperationIdV1;
  operationVersion: OperationVersionV1;
}
```

An operation key is a lookup key, not authority. A name without its kind and
version cannot resolve an operation.

### 9.2 Requested operation envelopes

```ts
type RequestedTargetEnvelopeV1 =
  | {
      kind: "model-dispatch";
      permittedProviderRouteClassIds: CanonicalSortedUniqueSetV1<EffectClassIdV1>;
    }
  | {
      kind: "local-tool";
      permittedLocalCapabilityClassIds: CanonicalSortedUniqueSetV1<LocalCapabilityClassIdV1>;
    }
  | {
      kind: "outward-tool";
      permittedDestinationClassIds: CanonicalSortedUniqueSetV1<GrantableDestinationClassIdV1>;
    }
  | {
      kind: "verification";
      permittedVerificationClassIds: CanonicalSortedUniqueSetV1<EffectClassIdV1>;
    };

interface EffectBudgetVectorV1 {
  modelDispatches: BudgetUnitsV1;
  localToolEffects: BudgetUnitsV1;
  outwardToolEffects: BudgetUnitsV1;
  verificationEffects: BudgetUnitsV1;
  totalActionEffects: BudgetUnitsV1;
  providerUsageUnits: BudgetUnitsV1;
  contentBytes: BudgetUnitsV1;
}

interface RequestedOperationEnvelopeV1 {
  operationKey: OperationKeyV1;
  targetEnvelope: RequestedTargetEnvelopeV1;
  maximumReservationCharge: EffectBudgetVectorV1;
  maximumReservationAge: MonotonicDurationNanosV1;
  maximumPermitAge: MonotonicDurationNanosV1;
}

interface RequestedAuthorityEnvelopeV1 {
  schema: "prism-age3-requested-authority-v1";
  requestedOperations: CanonicalSortedUniqueSetV1<RequestedOperationEnvelopeV1>;
  maximumRunBudget: EffectBudgetVectorV1;
}
```

`requestedOperations` is keyed by canonical `OperationKeyV1`. The target arm
must match the key kind. Duplicate keys reject even when their envelopes are
byte-identical.

The template request may name only ratified operation and class identifiers.
It contains no executable binding, principal, local capability, destination
capability, endpoint, credential, permit, or receipt. It grants nothing.

### 9.3 Subset proof

AGE-3 admission accepts a proposed granted catalog, budget policy, and deadline
policy only when all of these checks pass:

1. Every granted operation key occurs exactly once in the requested envelope.
2. Its target kind and admitted target class are members of the matching
   requested target arm.
3. Its per-reservation budget charge is component-wise less than or equal to
   the requested maximum for that operation.
4. The run budget policy is component-wise less than or equal to the requested
   run maximum.
5. Each granted reservation and permit duration is less than or equal to the
   requested durations for the same operation key.
6. Every granted local or outward capability belongs to the exact owner and
   admitted catalogs named by the proposed grant.
7. Every outward target proves non-protected classification under the exact
   protected taxonomy.

Missing fields, overflow, unknown classes, unmatched operation kinds, and
incomparable policy versions reject. No default or wildcard can satisfy the
proof.

## 10. Complete granted operation bindings

### 10.1 Common bindings

```ts
type EffectClassificationV1 =
  | {
      schema: "prism-age3-effect-classification-v1";
      kind: "model-dispatch";
      effectClassId: EffectClassIdV1;
      hasExternalSideEffect: true;
      mutatesLocalState: false;
      transmitsOwnerContent: true;
      requiresHumanApproval: boolean;
    }
  | {
      schema: "prism-age3-effect-classification-v1";
      kind: "local-tool";
      effectClassId: EffectClassIdV1;
      localBehavior: "read-only" | "mutation";
      hasExternalSideEffect: false;
      transmitsOwnerContent: false;
      requiresHumanApproval: boolean;
    }
  | {
      schema: "prism-age3-effect-classification-v1";
      kind: "outward-tool";
      effectClassId: EffectClassIdV1;
      hasExternalSideEffect: true;
      mutatesLocalState: false;
      transmitsOwnerContent: boolean;
      requiresHumanApproval: boolean;
    }
  | {
      schema: "prism-age3-effect-classification-v1";
      kind: "verification";
      effectClassId: EffectClassIdV1;
      hasExternalSideEffect: false;
      mutatesLocalState: false;
      transmitsOwnerContent: false;
      requiresHumanApproval: false;
    };

interface ParameterConstructionBindingV1 {
  schema: "prism-age3-parameter-construction-v1";
  parameterSchemaDigest: SchemaDigestV1;
  constructorExecutionBindingDigest: ExecutionBindingDigest;
  constructorDependencyClosureDigest: DependencyClosureDigest;
  constructorVersion: OperationVersionV1;
  canonicalOutputSchemaDigest: SchemaDigestV1;
}

type EffectApprovalRequirementV1 =
  | { kind: "none" }
  | {
      kind: "required";
      approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
      approvalClassId: EffectClassIdV1;
    };

type EffectResultContractV1 =
  | {
      kind: "content-required";
      contentProducerBindingDigest: ContentProducerBindingDigestV1;
    }
  | {
      kind: "no-content-only";
      noContentReasonCode: EffectClassIdV1;
    };

interface EffectReceiptContractV1 {
  schema: "prism-age3-receipt-contract-v1";
  receiptSchemaDigest: SchemaDigestV1;
  executionObservationSchemaDigest: SchemaDigestV1;
  resultContract: EffectResultContractV1;
  maximumObservedProviderUsageUnits: BudgetUnitsV1;
  executionIdempotencyBindingDigest: ExecutionBindingDigest;
  reconciliationBindingDigest: ExecutionBindingDigest;
}

interface GrantedOperationCommonV1 {
  operationKey: OperationKeyV1;
  executorBindingDigest: ExecutionBindingDigest;
  executorDependencyClosureDigest: DependencyClosureDigest;
  adapterBindingDigest: ExecutionBindingDigest;
  protocolVersion: OperationVersionV1;
  claimantPrincipalId: PrincipalId;
  parameterConstructionBindingDigest: ParameterConstructionBindingDigestV1;
  effectClassificationDigest: EffectClassificationDigestV1;
  approvalRequirement: EffectApprovalRequirementV1;
  reservationCharge: EffectBudgetVectorV1;
  effectBudgetPolicyDigest: EffectBudgetPolicyDigestV1;
  effectDeadlinePolicyDigest: EffectDeadlinePolicyDigestV1;
  receiptContractDigest: EffectReceiptContractDigestV1;
}
```

The effect classification must agree with the operation arm and approval
requirement. Verification is always observation-only. An outward operation
always has an external side effect. A local operation declares its read-only or
mutation behavior exactly. Classification cannot override an executable or
target binding that can perform a broader effect.

### 10.2 Local capability binding

```ts
interface LocalCapabilityBindingV1 {
  schema: "prism-age3-local-capability-v1";
  ownerDomainId: OwnerDomainId;
  capabilityClassId: LocalCapabilityClassIdV1;
  provisionedCapabilityDigest: ProvisionedLocalCapabilityDigestV1;
  executorPrincipalId: PrincipalId;
  relativeResolutionBindingDigest: ExecutionBindingDigest;
  mutationEnvelopeSchemaDigest: SchemaDigestV1;
  resolutionProtocol: "descriptor-relative-no-follow-v1";
}
```

The D2 capability is provisioned as a whole boundary. AGE-3 never stores or
accepts an absolute path, mount path, file descriptor, root selector, or
caller-selected base directory. Resolution rejects absolute components,
parent traversal, empty components, symlinks, hard-link escape, mount escape,
replacement races, and any object outside the provisioned boundary.

### 10.3 Operation union

```ts
type GrantedOperationBindingV1 =
  | {
      schema: "prism-age3-granted-operation-binding-v1";
      kind: "model-dispatch";
      common: GrantedOperationCommonV1;
      providerBrokerBindingCatalogDigest: ProviderBrokerBindingCatalogDigest;
      providerRouteBindingDigest: ExecutionBindingDigest;
      providerRouteClassId: EffectClassIdV1;
    }
  | {
      schema: "prism-age3-granted-operation-binding-v1";
      kind: "local-tool";
      common: GrantedOperationCommonV1;
      localCapabilityBindingDigest: LocalCapabilityBindingDigestV1;
    }
  | {
      schema: "prism-age3-granted-operation-binding-v1";
      kind: "outward-tool";
      common: GrantedOperationCommonV1;
      outwardOperationAuthorityDigest: OutwardOperationAuthorityDigestV1;
    }
  | {
      schema: "prism-age3-granted-operation-binding-v1";
      kind: "verification";
      common: GrantedOperationCommonV1;
      verificationSubjectContractDigest: VerificationSubjectContractDigestV1;
    };
```

The outer kind, common operation kind, effect classification, claimant, and
target arm must agree exactly. Tagged arms are not shape-compatible
capabilities. A provider broker cannot claim a local, outward, or verification
operation. The same rule applies to every other claimant kind.

### 10.4 Verification specialization

```ts
interface GrantedVerificationOperationBindingV1 {
  schema: "prism-age3-granted-verification-binding-v1";
  operationBindingDigest: GrantedOperationBindingDigestV1;
  verificationSubjectContractDigest: VerificationSubjectContractDigestV1;
  observationOnly: true;
  allowedEffectClassificationDigest: EffectClassificationDigestV1;
  receiptContractDigest: EffectReceiptContractDigestV1;
}
```

The referenced operation must be the `verification` arm and its classification
must set all mutation, messaging, publication, and outward-write properties to
false. A verifier that can repair, mutate, send, publish, install, promote, or
write a destination is not grantable as completion verification.

AGE-5 adds terminal-candidate subject construction, predicate, attempt, and
receipt interpretation. It cannot weaken this AGE-3 execution boundary.

### 10.5 Granted catalog

```ts
interface GrantedOperationCatalogV1 {
  schema: "prism-age3-granted-operation-catalog-v1";
  ownerDomainId: OwnerDomainId;
  effectiveGrantDigest: EffectiveGrantDigest;
  executionBindingCatalogDigest: ExecutionBindingCatalogDigest;
  providerBrokerBindingCatalogDigest: ProviderBrokerBindingCatalogDigest;
  protectedDestinationTaxonomy: ProtectedDestinationTaxonomyV1;
  grantableDestinationCatalog: GrantableDestinationCatalogV1;
  effectClassifications: CanonicalSortedUniqueSetV1<EffectClassificationV1>;
  parameterConstructionBindings:
    CanonicalSortedUniqueSetV1<ParameterConstructionBindingV1>;
  receiptContracts: CanonicalSortedUniqueSetV1<EffectReceiptContractV1>;
  contentProducerBindings: CanonicalSortedUniqueSetV1<ContentProducerBindingV1>;
  localCapabilityBindings: CanonicalSortedUniqueSetV1<LocalCapabilityBindingV1>;
  outwardResolverBindings:
    CanonicalSortedUniqueSetV1<OutwardDestinationResolverBindingV1>;
  outwardOperationAuthorities:
    CanonicalSortedUniqueSetV1<OutwardOperationAuthorityV1>;
  operationBindings: CanonicalSortedUniqueSetV1<GrantedOperationBindingV1>;
  verificationBindings:
    CanonicalSortedUniqueSetV1<GrantedVerificationOperationBindingV1>;
}
```

Operation bindings and outward authorities are keyed by `operationKey`.
Classifications are keyed by `effectClassId`. All other support sets are keyed
by their complete digest. Every digest referenced by an operation binding must
resolve to exactly one by-value support record in this catalog, one explicit
imported catalog, or the exact budget, deadline, approval, and custody sibling
digests in AGE-1's `GoalTaskImportSetV1`. Missing, duplicate, conflicting, and
multiply owned support records reject.

The support graph is exact and closed. Every support record must be reachable
from at least one granted operation, and every operation reference must be
reachable. Unreferenced records reject so the catalog cannot carry dormant
authority. A tool ID, effect class, plugin name, operation name, approval
record, or destination class cannot substitute for catalog lookup.

The catalog is immutable within one admitted goal task. Registry change,
executable change, dependency change, principal change, adapter change,
schema change, target change, or policy change requires a new catalog and a
new AGE-1 task identity.

## 11. Result-content producer binding

```ts
interface ContentProducerBindingV1 {
  schema: "prism-age3-content-producer-v1";
  ownerDomainId: OwnerDomainId;
  operationKey: OperationKeyV1;
  executorBindingDigest: ExecutionBindingDigest;
  claimantPrincipalId: PrincipalId;
  contentCustodyBindingDigest: ContentCustodyBindingDigestV1;
  contentCustodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  objectDescriptorDigest: ContentObjectDescriptorDigestV1;
  resultSchemaDigest: SchemaDigestV1;
  maximumContentBytes: BudgetUnitsV1;
}
```

This binding is run-independent and contains no operation-binding digest, so
the operation binding may safely carry its digest without a digest cycle. The
operation key, executor, principal, result schema, and custody contracts must
match the enclosing granted operation.

Only a `content-required` receipt contract may name this binding. The maximum
content bytes must be non-zero and less than or equal to the operation's
precharged `contentBytes`. A `no-content-only` operation has no content
producer binding and cannot publish result bytes under its receipt.

AGE-4 authenticates the exact producer digest on publication. A prepared
candidate grants no receipt or read authority by itself.

## 12. Protected and grantable destinations

### 12.1 Protected taxonomy

```ts
type ProtectedDestinationClassV1 =
  | "consumer-durable-state"
  | "instruction-or-procedural-guidance-store"
  | "admission-or-authority-registry"
  | "credential-store"
  | "constitutional-or-release-state"
  | "executable-extension-path";

interface RequiredProtectedDestinationClassesV1 {
  consumerDurableState: "consumer-durable-state";
  instructionOrProceduralGuidanceStore: "instruction-or-procedural-guidance-store";
  admissionOrAuthorityRegistry: "admission-or-authority-registry";
  credentialStore: "credential-store";
  constitutionalOrReleaseState: "constitutional-or-release-state";
  executableExtensionPath: "executable-extension-path";
}

interface ProtectedDestinationTaxonomyV1 {
  schema: "prism-age3-protected-destination-taxonomy-v1";
  requiredClasses: RequiredProtectedDestinationClassesV1;
  classifierBindingDigest: ExecutionBindingDigest;
  classifierDependencyClosureDigest: DependencyClosureDigest;
  classificationSchemaDigest: SchemaDigestV1;
}
```

All six class values are required. A package that omits, renames, aliases, or
merges one of them does not satisfy this schema version.

`consumer-durable-state` includes a downstream consumer's canonical mutable
knowledge, task, workflow, preference, configuration, or business-data store.
An emitted artifact may later be imported by an independently authorized
consumer, but AGE-3 cannot grant direct application to that store.

### 12.2 Grantable catalog shape

```ts
interface DestinationClassificationEvidenceV1 {
  schema: "prism-age3-destination-classification-evidence-v1";
  ownerDomainId: OwnerDomainId;
  classificationSubjectDigest: DestinationClassificationSubjectDigestV1;
  protectedTaxonomyDigest: ProtectedDestinationTaxonomyDigestV1;
  classifierBindingDigest: ExecutionBindingDigest;
  classifiedAs: "non-protected";
}

interface OpaqueDestinationIdentityV1 {
  schema: "prism-age3-opaque-destination-identity-v1";
  identitySchemeId: EffectClassIdV1;
  registrarBindingDigest: ExecutionBindingDigest;
  opaqueIdentityBytes: BoundedByteString;
}

interface DestinationClassificationSubjectV1 {
  schema: "prism-age3-destination-classification-subject-v1";
  ownerDomainId: OwnerDomainId;
  destinationCapabilityId: DestinationCapabilityIdV1;
  destinationClassId: GrantableDestinationClassIdV1;
  opaqueTargetIdentityDigest: OpaqueDestinationIdentityDigestV1;
  adapterBindingDigest: ExecutionBindingDigest;
  adapterDependencyClosureDigest: DependencyClosureDigest;
  adapterConfigurationBindingDigest: ExecutionBindingDigest;
  adapterPrincipalId: PrincipalId;
}

interface OutwardDestinationCapabilityV1 {
  schema: "prism-age3-outward-destination-capability-v1";
  ownerDomainId: OwnerDomainId;
  destinationCapabilityId: DestinationCapabilityIdV1;
  destinationClassId: GrantableDestinationClassIdV1;
  opaqueTargetIdentityDigest: OpaqueDestinationIdentityDigestV1;
  adapterBindingDigest: ExecutionBindingDigest;
  adapterDependencyClosureDigest: DependencyClosureDigest;
  adapterConfigurationBindingDigest: ExecutionBindingDigest;
  adapterPrincipalId: PrincipalId;
  classificationSubjectDigest: DestinationClassificationSubjectDigestV1;
  classificationEvidenceDigest: DestinationClassificationEvidenceDigestV1;
}

interface GrantableDestinationCatalogV1 {
  schema: "prism-age3-grantable-destination-catalog-v1";
  ownerDomainId: OwnerDomainId;
  protectedTaxonomyDigest: ProtectedDestinationTaxonomyDigestV1;
  opaqueTargetIdentities: CanonicalSortedUniqueSetV1<OpaqueDestinationIdentityV1>;
  classificationSubjects:
    CanonicalSortedUniqueSetV1<DestinationClassificationSubjectV1>;
  classificationEvidence:
    CanonicalSortedUniqueSetV1<DestinationClassificationEvidenceV1>;
  destinationCapabilities: CanonicalSortedUniqueSetV1<OutwardDestinationCapabilityV1>;
}
```

The catalog key is `destinationCapabilityId`. Its generated schema has no
field whose type is `ProtectedDestinationClassV1`. Admission independently
verifies each classification evidence record under the exact taxonomy before
the capability becomes grantable. The classification subject must equal the
capability field-for-field, including opaque target identity, adapter,
dependency closure, configuration, and principal. One-field drift creates a
new subject and invalidates the old evidence.

The opaque target identity is an admission-time identity proof, not a raw
endpoint. Raw URLs, hostnames, IP addresses, paths, database keys, tenant
names, account names, redirect targets, service-discovery names, and arbitrary
writer handles are not valid run-time destination selectors or capability
substitutes.

### 12.3 Catalog closure

An outward destination capability is rejected when any of these conditions
holds:

- the target is protected, unknown, unclassifiable, or classification evidence
  is missing;
- the adapter can select a target outside the opaque capability;
- one adapter configuration spans more than one destination capability;
- redirects, aliases, DNS, service discovery, imported writers, or aggregate
  writers can change target identity after classification;
- the adapter principal or dependency closure differs from the admitted
  record; or
- the target identity cannot be carried unchanged into the receipt.

An owner may create a new non-protected capability only through a new ratified
catalog. Goal content, model output, tool parameters, and operator approval
cannot add one during a run.

## 13. Outward operation authority and resolution

### 13.1 Resolver and operation bindings

```ts
interface OutwardDestinationResolverBindingV1 {
  schema: "prism-age3-outward-resolver-binding-v1";
  ownerDomainId: OwnerDomainId;
  resolverBindingDigest: ExecutionBindingDigest;
  resolverDependencyClosureDigest: DependencyClosureDigest;
  resolverPrincipalId: PrincipalId;
  selectorSchemaDigest: SchemaDigestV1;
  grantableDestinationCatalogDigest: GrantableDestinationCatalogDigestV1;
  protectedDestinationTaxonomyDigest: ProtectedDestinationTaxonomyDigestV1;
  resolutionProtocol: "closed-capability-lookup-v1";
}

interface OutwardOperationAuthorityV1 {
  schema: "prism-age3-outward-operation-authority-v1";
  operationKey: OperationKeyV1;
  resolverBindingDigest: OutwardDestinationResolverBindingDigestV1;
  allowedDestinationCapabilityDigests:
    CanonicalSortedUniqueSetV1<OutwardDestinationCapabilityDigestV1>;
}
```

The operation key must be the `outward-tool` kind. Every allowed capability
must occur in the exact catalog bound by the resolver, have the same owner,
and have valid non-protected classification evidence.

The resolver executable has read-only access to its immutable admitted
catalog. It has no network, filesystem mutation, registry mutation, content
publication, approval, permit, or destination-write authority.

### 13.2 Selector and resolved identity

```ts
interface DestinationSelectorValueV1 {
  schema: "prism-age3-destination-selector-value-v1";
  selectorSchemaDigest: SchemaDigestV1;
  selectorKey: DestinationSelectorKeyV1;
}

interface ResolveOutwardDestinationRequestV1 {
  schema: "prism-age3-resolve-outward-request-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  outwardAuthorityDigest: OutwardOperationAuthorityDigestV1;
  resolverBindingDigest: OutwardDestinationResolverBindingDigestV1;
  selectorValueDigest: DestinationSelectorValueDigestV1;
}

interface ResolvedOutwardDestinationV1 {
  schema: "prism-age3-resolved-outward-destination-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  outwardAuthorityDigest: OutwardOperationAuthorityDigestV1;
  resolverBindingDigest: OutwardDestinationResolverBindingDigestV1;
  selectorValueDigest: DestinationSelectorValueDigestV1;
  destinationCapabilityDigest: OutwardDestinationCapabilityDigestV1;
  destinationCapabilityId: DestinationCapabilityIdV1;
  destinationClassId: GrantableDestinationClassIdV1;
  opaqueTargetIdentityDigest: OpaqueDestinationIdentityDigestV1;
  adapterBindingDigest: ExecutionBindingDigest;
  adapterConfigurationBindingDigest: ExecutionBindingDigest;
  adapterPrincipalId: PrincipalId;
  classificationEvidenceDigest: DestinationClassificationEvidenceDigestV1;
  protectedDestinationTaxonomyDigest: ProtectedDestinationTaxonomyDigestV1;
}
```

Resolution occurs before reservation. The resolver canonical-decodes the
selector, performs one closed lookup, and returns either one complete resolved
record or one rejection. Zero matches, multiple matches, unknown selectors,
schema mismatch, owner mismatch, class mismatch, capability drift, or evidence
drift reject.

The resolved digest is carried unchanged through reservation, AGE-5 approval
subject and challenge, permit, consumption, executor request, receipt, and
terminal evidence. None of those stages can resolve again or replace one
field.

### 13.3 Indirection and redirect law

The admitted capability must prove that any protocol-level indirection still
resolves to the same opaque target identity. If the adapter observes a
redirect, alias, DNS answer, service-discovery result, tenant mapping, account
mapping, or server-selected root that is not covered by that proof, it must
stop before sending or mutating.

If uncertainty appears before permit consumption, the effect rejects safely.
If it appears after consumption and no trustworthy no-effect proof exists, the
effect becomes `ambiguous`.

## 14. Discrete budget policy and accounting

### 14.1 Admitted policy

```ts
interface EffectBudgetPolicyV1 {
  schema: "prism-age3-budget-policy-v1";
  ownerDomainId: OwnerDomainId;
  requestedAuthorityDigest: RequestedAuthorityEnvelopeDigestV1;
  maximumRunConsumption: EffectBudgetVectorV1;
  accountingProtocol: "monotonic-precharge-no-refund-v1";
}
```

Every component is a hard discrete limit. Version 1 has no active-time,
wall-time, CPU-time, lease-free-time, or reconstructed interval accumulator.
D2 process and capacity limits remain separate controls.

`totalActionEffects` counts local and outward effects. It does not count model
dispatch or verification. The kind-specific component and any applicable
aggregate component are charged together.

### 14.2 Budget claim and ledger

```ts
interface EffectBudgetClaimV1 {
  schema: "prism-age3-budget-claim-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  budgetPolicyDigest: EffectBudgetPolicyDigestV1;
  priorLedgerDigest: EffectBudgetLedgerDigestV1;
  claimOrdinal: EffectSequenceV1;
  charged: EffectBudgetVectorV1;
  totalsAfterClaim: EffectBudgetVectorV1;
}

interface EffectBudgetLedgerV1 {
  schema: "prism-age3-budget-ledger-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  budgetPolicyDigest: EffectBudgetPolicyDigestV1;
  orderedClaimDigests: ReadonlyArray<EffectBudgetClaimDigestV1>;
  consumed: EffectBudgetVectorV1;
}
```

The initial ledger has an empty claim list and all-zero consumption. Its digest
is still explicit and task-bound. A new claim references the exact prior
ledger. The next ledger appends that claim digest and copies
`totalsAfterClaim`.

The semantic uniqueness key for a claim is `(ownerDomainId, runId,
operationId)`. Identical replay returns the existing claim and resulting
ledger. A different operation, binding, charge, ordinal, policy, or prior
ledger conflicts.

### 14.3 Precharge law

The reservation transaction charges the complete
`GrantedOperationCommonV1.reservationCharge` before it creates execution
authority. The charge is the admitted maximum for that invocation:

- model and outward operations precharge their maximum provider usage;
- every content-producing operation precharges its maximum result bytes;
- each kind charges exactly one kind slot;
- local and outward operations also charge one action slot; and
- components that do not apply must be zero.

Actual receipt usage must be less than or equal to the precharge. Lower actual
usage does not refund budget. Higher actual usage makes the receipt
untrustworthy and the consumed effect ambiguous.

Admission also proves that each receipt contract's maximum observed provider
usage and each content producer's maximum bytes are less than or equal to the
matching components of the operation's reservation charge.

Every component addition is checked unsigned arithmetic. Overflow is budget
exhaustion and rejects before reservation. A claim whose resulting total would
exceed any policy component rejects atomically without changing the ledger or
open-effect state.

No denial, expiry, crash, cancellation, pre-dispatch rejection, receipt, or
recovery path refunds a committed claim. This keeps accounting monotonic and
restart-independent.

## 15. Deadline policy

### 15.1 Policy shape

```ts
interface EffectDeadlineEntryV1 {
  operationKey: OperationKeyV1;
  maximumReservationAge: MonotonicDurationNanosV1;
  maximumPermitAge: MonotonicDurationNanosV1;
}

interface EffectDeadlinePolicyV1 {
  schema: "prism-age3-deadline-policy-v1";
  ownerDomainId: OwnerDomainId;
  requestedAuthorityDigest: RequestedAuthorityEnvelopeDigestV1;
  entries: CanonicalSortedUniqueSetV1<EffectDeadlineEntryV1>;
  comparisonRule: "strictly-before-v1";
}
```

Entries are keyed by `operationKey`. Every granted operation has exactly one
entry. Unknown, duplicate, or missing entries reject admission.

### 15.2 Epoch-local construction

D4 samples the trusted monotonic clock inside the reservation transaction and
constructs the gate deadline by checked addition of the admitted reservation
age. It samples again inside permit issue and constructs the permit deadline
as the earlier of:

- the existing gate deadline; and
- the issue sample plus the admitted maximum permit age.

Every instant and deadline belongs to the exact current `DaemonEpoch`.
Cross-epoch comparison is invalid. Addition overflow rejects before authority
is created.

### 15.3 Strict deadline law

Every authority transition that checks a deadline samples the trusted clock
inside the same D4 compare-and-set transaction. It succeeds only when
`sample < deadline`. Equality is expired.

The executor rechecks the exact permit deadline before beginning the external
or local operation. It cancels work at the deadline when the admitted protocol
supports cancellation. It cannot submit a positive receipt when its trusted
completion sample is equal to or later than the permit deadline.

An executor-side check does not replace D4 permit consumption. D4 consumption
does not replace the executor-side check. Both are required.

## 16. Reservation

### 16.1 Target binding

```ts
type EffectTargetBindingV1 =
  | {
      kind: "model-dispatch";
      providerRouteBindingDigest: ExecutionBindingDigest;
      brokerPrincipalId: PrincipalId;
    }
  | {
      kind: "local-tool";
      localCapabilityBindingDigest: LocalCapabilityBindingDigestV1;
      executorPrincipalId: PrincipalId;
    }
  | {
      kind: "outward-tool";
      resolvedDestinationDigest: ResolvedOutwardDestinationDigestV1;
      adapterPrincipalId: PrincipalId;
    }
  | {
      kind: "verification";
      verificationBindingDigest: GrantedVerificationOperationBindingDigestV1;
      verifierPrincipalId: PrincipalId;
    };
```

The target arm must match the operation kind, complete operation binding, and
claimant principal. A target union value cannot be retagged or reused for a
different kind.

### 16.2 Request

```ts
interface EffectReservationRequestV1 {
  schema: "prism-age3-reservation-request-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  operationId: RunOperationIdV1;
  operationProposalDigest: OperationProposalDigestV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  actionParameterSetDigest: ActionParameterSetDigestV1;
  inputContentReferences: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  target: EffectTargetBindingV1;
  coordinatorGeneration: CoordinatorGenerationV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The request is constructed from committed AGE-2 proposal bytes and admitted
parameter-construction code. It contains no raw tool call, raw provider
request, endpoint, path, credential, or model-selected principal.

The semantic idempotency key is `(ownerDomainId, runId, operationId)`.
Identical replay returns the same reservation. Any difference conflicts and
does not claim another budget slot.

### 16.3 Reservation record

```ts
interface EffectReservationV1 {
  schema: "prism-age3-reservation-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  admittedGoalRunDigest: AdmittedGoalRunDigestV1;
  reservationRequestDigest: EffectReservationRequestDigestV1;
  effectSequence: EffectSequenceV1;
  operationId: RunOperationIdV1;
  operationProposalDigest: OperationProposalDigestV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  actionParameterSetDigest: ActionParameterSetDigestV1;
  inputContentReferences: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  target: EffectTargetBindingV1;
  budgetClaimDigest: EffectBudgetClaimDigestV1;
  budgetLedgerAfterDigest: EffectBudgetLedgerDigestV1;
  reservedAt: EpochMonotonicInstantV1;
  gateDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  coordinatorGeneration: CoordinatorGenerationV1;
  sourceCheckpointDigest: RunCheckpointDigestV1;
  stateVersionAfterCommit: SettlementStateVersion;
  reservationTransactionId: EffectTransactionIdV1;
}
```

The D4 transaction performs grant lookup, target validation, budget claim,
ledger append, deadline construction, one-open-effect enforcement, sequence
allocation, and reservation insertion atomically.

### 16.4 One open effect

For each run, D4 enforces a durable uniqueness constraint permitting at most
one effect whose state is nonterminal. `reserved`, `awaiting-approval`,
`approved-awaiting-permit`, `permit-issued`, and `consumed` are all
nonterminal.

The constraint applies across all four effect kinds. It is checked in the same
transaction that commits the reservation. A model-proposed ordered list does
not create several reservations. AGE-2 presents one operation only after the
prior effect reaches a terminal AGE-3 state and its outcome is checkpointed.

Several independently admitted runs may each have one open effect. A single
run has no parallel or nested effect exception in version 1.

## 17. Effect lifecycle

### 17.1 Closed state union

```ts
type PreDispatchRejectReasonV1 =
  | "invalid-approval-gate"
  | "target-revalidation-failed"
  | "capability-revoked"
  | "content-input-invalid"
  | "coordinator-generation-stale"
  | "cancelled-before-consumption"
  | "epoch-loss-before-permit";

type ExpiredBoundaryV1 = "approval-gate" | "permit";

type EffectLifecycleStateV1 =
  | { kind: "reserved" }
  | {
      kind: "awaiting-approval";
      approvalSubjectDigest: ApprovalSubjectDigestV1;
      approvalGateDigest: ApprovalGateDigestV1;
      gateDeadline: EpochMonotonicDeadlineV1;
    }
  | {
      kind: "approved-awaiting-permit";
      approvalDecisionDigest: ApprovalDecisionDigestV1;
    }
  | { kind: "permit-issued"; permitDigest: EffectPermitDigestV1 }
  | { kind: "consumed"; consumptionDigest: EffectConsumptionDigestV1 }
  | {
      kind: "receipted";
      receiptDigest: EffectReceiptDigestV1;
      resultKind: "content";
      contentReferenceDigest: ContentReferenceDigestV1;
    }
  | {
      kind: "receipted";
      receiptDigest: EffectReceiptDigestV1;
      resultKind: "no-content";
    }
  | { kind: "ambiguous"; ambiguityRecordDigest: EffectAmbiguityRecordDigestV1 }
  | { kind: "rejected-pre-dispatch"; reason: PreDispatchRejectReasonV1 }
  | { kind: "rejected-denied"; approvalDecisionDigest: ApprovalDecisionDigestV1 }
  | { kind: "rejected-expired"; expiredBoundary: ExpiredBoundaryV1 }
  | { kind: "rejected-epoch-loss"; priorDaemonEpoch: DaemonEpoch };

type CancellableEffectStateV1 =
  | { kind: "reserved" }
  | {
      kind: "awaiting-approval";
      approvalSubjectDigest: ApprovalSubjectDigestV1;
      approvalGateDigest: ApprovalGateDigestV1;
      gateDeadline: EpochMonotonicDeadlineV1;
    }
  | {
      kind: "approved-awaiting-permit";
      approvalDecisionDigest: ApprovalDecisionDigestV1;
    }
  | { kind: "permit-issued"; permitDigest: EffectPermitDigestV1 };

interface CancelUnconsumedEffectCommandV1 {
  schema: "prism-age3-cancel-unconsumed-effect-v1";
  reservationDigest: EffectReservationDigestV1;
  completionRequestDigest: CompletionRequestDigestV1;
  expectedEffectStateDigest: EffectStateDigestV1;
  expectedState: CancellableEffectStateV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface EffectStateV1 {
  schema: "prism-age3-effect-state-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  state: EffectLifecycleStateV1;
  stateVersion: SettlementStateVersion;
  lastTransactionId: EffectTransactionIdV1;
}
```

`PreDispatchRejectReasonV1` and `ExpiredBoundaryV1` are generated closed enums.
Initial reject reasons cover invalid gate construction, target revalidation,
capability revocation, corrupt content input, stale coordinator generation,
and explicit cancellation before consumption. Expired boundaries are
`approval-gate` and `permit`.

The content reference exists only in the concrete `content` receipted arm.
There is no nullable or optional authority field.

### 17.2 Legal transitions

| From | Command or event | To |
|---|---|---|
| none | valid reservation transaction | `reserved` |
| `reserved` | pre-dispatch validation fails | `rejected-pre-dispatch` |
| `reserved` | operation requires approval and valid AGE-5 gate attaches | `awaiting-approval` |
| `reserved` | operation requires no approval and valid permit claim wins | `permit-issued` |
| `reserved` | D4-only cancellation compare-and-set wins | `rejected-pre-dispatch` with `cancelled-before-consumption` |
| `awaiting-approval` | valid first denial wins before both deadlines | `rejected-denied` |
| `awaiting-approval` | deadline equality or later wins | `rejected-expired` |
| `awaiting-approval` | daemon epoch changes | `rejected-epoch-loss` |
| `awaiting-approval` | valid first approval wins before both deadlines | `approved-awaiting-permit` |
| `awaiting-approval` | D4-only cancellation compare-and-set wins and closes the AGE-5 gate atomically | `rejected-pre-dispatch` with `cancelled-before-consumption` |
| `approved-awaiting-permit` | valid permit claim wins | `permit-issued` |
| `approved-awaiting-permit` | daemon epoch changes | `rejected-epoch-loss` |
| `approved-awaiting-permit` | D4-only cancellation compare-and-set wins | `rejected-pre-dispatch` with `cancelled-before-consumption` |
| `permit-issued` | permit deadline equality or later wins before consumption | `rejected-expired` |
| `permit-issued` | daemon epoch changes before consumption | `rejected-epoch-loss` |
| `permit-issued` | exact first consumption wins strictly before deadline | `consumed` |
| `permit-issued` | D4-only cancellation compare-and-set wins before consumption | `rejected-pre-dispatch` with `cancelled-before-consumption` |
| `consumed` | trustworthy receipt commits | `receipted` |
| `consumed` | recovery cannot prove a trustworthy receipt or no execution | `ambiguous` |

No other transition is legal. Terminal states are immutable. Exact request
replay returns the existing terminal record without changing its state version
or transaction ID.

### 17.3 Compare-and-set law

Every transition authenticates owner, run, principal where applicable,
current daemon epoch, current lease, coordinator generation where applicable,
reservation digest, expected state variant, and expected settlement version.
The transition samples any required clock value inside the same transaction.

The first valid compare-and-set wins. Losing, stale, cross-owner, cross-run,
cross-epoch, wrong-principal, wrong-kind, wrong-target, or wrong-version calls
return a rejection or the identical committed replay result. They do not
create new authority.

`CancelUnconsumedEffectCommandV1` is accepted only through D4's internal
transaction port. D4 resolves its completion request, reservation, exact state
digest, full expected state payload, and expected settlement version in one
transaction. The command is legal from every unconsumed nonterminal state and
from no other state. If `consumePermit` commits first, cancellation loses its
compare-and-set and cannot rewrite `consumed`. If cancellation commits first,
later permit issue or consumption fails against the terminal state. An attached
AGE-5 gate is changed to `cancelled` in that same host transaction. The command
creates no executor, coordinator, operator-channel, or caller cancellation
authority.

## 18. AGE-5 approval interaction

```ts
interface AttachApprovalGateCommandV1 {
  schema: "prism-age3-attach-approval-gate-v1";
  reservationDigest: EffectReservationDigestV1;
  approvalSubjectDigest: ApprovalSubjectDigestV1;
  approvalGateDigest: ApprovalGateDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface ApplyApprovalDecisionCommandV1 {
  schema: "prism-age3-apply-approval-decision-v1";
  reservationDigest: EffectReservationDigestV1;
  approvalGateDigest: ApprovalGateDigestV1;
  approvalDecisionDigest: ApprovalDecisionDigestV1;
  outcome: ApprovalDecisionOutcomeV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The attached AGE-5 subject must bind the complete operation, principal, target,
semantic parameters, mutation footprint, gate deadline, and expected receipt
contract. A digest-only or lossy subject rejects.

The AGE-5 challenge deadline must be in the reservation epoch and less than or
equal to the AGE-3 gate deadline. D4 samples the trusted clock inside the first
decision transaction. Approval or denial commits only when the sample is
strictly before both deadlines. Equality or later commits
`rejected-expired` exactly once.

Permit issue requires the winning `approved-awaiting-permit` state and exact
approval decision digest. An approval row, challenge, UI acknowledgement, or
operator message is not permit authority.

Epoch loss makes a pending or approved gate unusable. The prior subject,
challenge, and decision remain evidence only. No old challenge can be
reactivated, and AGE-3 does not return to `reserved`.

## 19. Permit issue and replay

### 19.1 Claim

```ts
interface EffectPermitClaimV1 {
  schema: "prism-age3-permit-claim-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  reservationRequestDigest: EffectReservationRequestDigestV1;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  claimantPrincipalId: PrincipalId;
  target: EffectTargetBindingV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  coordinatorGeneration: CoordinatorGenerationV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The authenticated channel supplies the claimant, owner, epoch, and lease and
must reproduce the stored values. The claim target is copied from the
reservation. It cannot be freshly resolved or caller-selected.

The semantic idempotency key is `(ownerDomainId, runId, reservationDigest)`.
Identical replay by the same principal returns the same immutable permit.
Different principal, kind, operation, target, epoch, lease, generation,
request, or expected authority conflicts and cannot issue a replacement.

### 19.2 Kind-tagged permit

```ts
interface EffectPermitCommonV1 {
  permitId: EffectPermitIdV1;
  permitClaimDigest: EffectPermitClaimDigestV1;
  reservationDigest: EffectReservationDigestV1;
  reservationRequestDigest: EffectReservationRequestDigestV1;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  claimantPrincipalId: PrincipalId;
  receiptContractDigest: EffectReceiptContractDigestV1;
  issuedAt: EpochMonotonicInstantV1;
  permitDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  coordinatorGeneration: CoordinatorGenerationV1;
  stateVersionAfterIssue: SettlementStateVersion;
  issueTransactionId: EffectTransactionIdV1;
}

type EffectPermitV1 =
  | {
      schema: "prism-age3-permit-v1";
      kind: "model-dispatch";
      common: EffectPermitCommonV1;
      providerRouteBindingDigest: ExecutionBindingDigest;
      brokerPrincipalId: PrincipalId;
    }
  | {
      schema: "prism-age3-permit-v1";
      kind: "local-tool";
      common: EffectPermitCommonV1;
      localCapabilityBindingDigest: LocalCapabilityBindingDigestV1;
      executorPrincipalId: PrincipalId;
    }
  | {
      schema: "prism-age3-permit-v1";
      kind: "outward-tool";
      common: EffectPermitCommonV1;
      resolvedDestinationDigest: ResolvedOutwardDestinationDigestV1;
      adapterPrincipalId: PrincipalId;
    }
  | {
      schema: "prism-age3-permit-v1";
      kind: "verification";
      common: EffectPermitCommonV1;
      verificationBindingDigest: GrantedVerificationOperationBindingDigestV1;
      verifierPrincipalId: PrincipalId;
    };
```

The generated permit schema has four distinct tagged arms. Similar field
shapes do not make them substitutable. Claimant authentication, operation kind,
target arm, and arm-specific principal must all agree.

### 19.3 Issue preconditions

D4 issues a permit only when all of these conditions hold in one transaction:

1. The reservation and its admitted run, operation binding, target, budget
   claim, deadline policy, epoch, lease, and coordinator generation are valid.
2. The current state is `reserved` for a no-approval operation or
   `approved-awaiting-permit` for a required-approval operation.
3. A required approval carries the exact winning AGE-5 decision digest.
4. Target and executable catalogs still match their admitted immutable
   digests, and any revocation policy allows use.
5. The trusted issue sample is strictly before the gate deadline.
6. The computed permit deadline is in the same epoch and strictly after the
   issue sample.
7. No permit already exists for the reservation.

The issue transaction inserts the permit and changes effect state to
`permit-issued` atomically. A permit row that is not the current state payload
has no authority.

## 20. Permit consumption and executor delivery

### 20.1 Exact execution request

```ts
interface EffectExecutionRequestV1 {
  schema: "prism-age3-execution-request-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  actionParameterSetDigest: ActionParameterSetDigestV1;
  inputContentReferences: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  target: EffectTargetBindingV1;
  receiptContractDigest: EffectReceiptContractDigestV1;
}

interface ConsumeEffectPermitCommandV1 {
  schema: "prism-age3-consume-permit-v1";
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  executionRequestDigest: EffectExecutionRequestDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The execution request must reproduce the reservation's operation, parameter,
input-content, target, and receipt identities. It contains references, never
raw AGE-4 bytes. The exact executor reads permitted input bytes by value under
AGE-4's `effect-input` purpose and this reservation digest.

### 20.2 Consumption record

```ts
interface EffectConsumptionV1 {
  schema: "prism-age3-consumption-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  executionRequestDigest: EffectExecutionRequestDigestV1;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  claimantPrincipalId: PrincipalId;
  target: EffectTargetBindingV1;
  consumptionSample: EpochMonotonicInstantV1;
  permitDeadline: EpochMonotonicDeadlineV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  coordinatorGeneration: CoordinatorGenerationV1;
  stateVersionAfterConsumption: SettlementStateVersion;
  consumptionTransactionId: EffectTransactionIdV1;
}
```

D4 authenticates the arm-specific claimant and samples trusted time inside the
same compare-and-set that changes `permit-issued` to `consumed`. The consume
succeeds only when the sample is strictly less than the permit deadline.
Equality commits `rejected-expired`, not consumption.

Exactly one consumption record can exist for a permit. Identical replay by the
same authenticated principal returns the existing record. It does not perform
another state transition. Drift or a different principal rejects.

### 20.3 Executor idempotency

The consumption digest is the mandatory executor operation key. Every admitted
executor binding includes a durable idempotency or reconciliation mechanism
that prevents an identical consumption response from causing a second model
call, local mutation, outward request, or verification observation.

For a target protocol with native idempotency, the adapter passes a stable key
derived from the consumption digest. Otherwise the exact executor keeps a
durable first-start journal under its admitted execution binding. It must
reconcile that journal before a replay can dispatch.

An executor or target that cannot provide the admitted idempotency and
reconciliation protocol is not grantable. D4's one-use consume record alone
does not justify duplicate external dispatch after an uncertain executor
start.

### 20.4 Deadline at the executor

Before the first irreversible step, the executor authenticates the complete
consumption, verifies kind, principal, target, environment, epoch, and
deadline, and samples its trusted epoch clock. A sample equal to or after the
deadline starts nothing.

If the operation was already started, the executor follows the admitted
cancellation and reconciliation binding. Positive result evidence is valid
only when its trusted completion sample is strictly before the same permit
deadline. An unprovable or late outcome cannot become a positive receipt.

## 21. Receipts and result content

### 21.1 Receipt candidate

```ts
type EffectReceiptCandidateResultV1 =
  | {
      kind: "content";
      preparedCandidateDigest: PreparedContentCandidateDigestV1;
      durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
      expectedDescriptorDigest: ContentObjectDescriptorDigestV1;
      expectedContentByteDigest: ContentByteDigestV1;
      observedContentBytes: BudgetUnitsV1;
    }
  | {
      kind: "no-content";
      noContentReasonCode: EffectClassIdV1;
    };

interface EffectReceiptSubmissionV1 {
  schema: "prism-age3-receipt-submission-v1";
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  consumptionDigest: EffectConsumptionDigestV1;
  executionRequestDigest: EffectExecutionRequestDigestV1;
  receiptContractDigest: EffectReceiptContractDigestV1;
  result: EffectReceiptCandidateResultV1;
  observedProviderUsageUnits: BudgetUnitsV1;
  executionStartedAt: EpochMonotonicInstantV1;
  executionCompletedAt: EpochMonotonicInstantV1;
}

interface CommitEffectReceiptCommandV1 {
  schema: "prism-age3-commit-receipt-v1";
  submission: EffectReceiptSubmissionV1;
  submissionDigest: EffectReceiptSubmissionDigestV1;
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The exact executor returns only `EffectReceiptSubmissionV1`. The authenticated
executor channel supplies the owner, principal, role, environment, epoch, and
lease. D4 verifies the submission, computes its digest, allocates the reference
transaction ID, adds the expected state version, and constructs the internal
commit command. An executor cannot choose either D4 value.

The executor submits no raw result bytes to D4. Content bytes must already be
a durable AGE-4 prepared candidate produced under the exact
`ContentProducerBindingDigestV1`.

### 21.2 Final result and receipt

```ts
type EffectReceiptResultV1 =
  | {
      kind: "content";
      contentReferenceDigest: ContentReferenceDigestV1;
      descriptorDigest: ContentObjectDescriptorDigestV1;
      contentByteDigest: ContentByteDigestV1;
      contentBytes: BudgetUnitsV1;
      durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
    }
  | {
      kind: "no-content";
      noContentReasonCode: EffectClassIdV1;
    };

interface EffectReceiptV1 {
  schema: "prism-age3-receipt-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  consumptionDigest: EffectConsumptionDigestV1;
  submissionDigest: EffectReceiptSubmissionDigestV1;
  executionRequestDigest: EffectExecutionRequestDigestV1;
  operationId: RunOperationIdV1;
  operationKey: OperationKeyV1;
  operationBindingDigest: GrantedOperationBindingDigestV1;
  claimantPrincipalId: PrincipalId;
  target: EffectTargetBindingV1;
  executionEnvironmentId: ProductionEnvironmentId;
  receiptContractDigest: EffectReceiptContractDigestV1;
  observedProviderUsageUnits: BudgetUnitsV1;
  executionStartedAt: EpochMonotonicInstantV1;
  executionCompletedAt: EpochMonotonicInstantV1;
  permitDeadline: EpochMonotonicDeadlineV1;
  result: EffectReceiptResultV1;
  daemonEpoch: DaemonEpoch;
  ownershipLease: OwnershipLeaseIdentity;
  stateVersionAfterReceipt: SettlementStateVersion;
  receiptTransactionId: EffectTransactionIdV1;
}
```

The receipt target arm and all target fields must equal the reservation,
permit, consumption, and execution request. Provider route, local capability,
or resolved outward destination drift rejects the receipt. Verification
receipts also reproduce the exact verification binding.

The executor principal must equal the consumed permit claimant. Actual
provider usage and content bytes must not exceed the precharged operation
maximum. The execution completion sample must be in the permit epoch and
strictly before the permit deadline.

### 21.3 Closed result law

A receipt contract admits exactly one result arm:

- `content-required` accepts only `content`; or
- `no-content-only` accepts only `no-content` with the exact admitted reason
  code.

An output-bearing model, tool, outward, or verification operation cannot use
`no-content`. A status code, provider ID, empty string, omitted body, truncated
body, log pointer, temporary path, or executor assertion cannot substitute for
a durable AGE-4 content reference.

### 21.4 Atomic AGE-4 reference commitment

For a content result, D4 performs this sequence inside one host transaction:

1. Construct AGE-4's closed `RuntimeContentProducerBindingV1` by value with
   the `effect-result` arm carrying the exact
   `ContentProducerBindingDigestV1`, then verify the prepared candidate,
   durability receipt, descriptor, byte digest, byte length, producer,
   custody binding, allowance, owner, run, and active publication lease
   through AGE-4.
2. Deterministically construct the exact `ContentReferenceV1` from the
   candidate and the preallocated `ReferenceCommitTransactionId`.
3. Compute the reference digest, verify the exact executor submission, then
   construct the final AGE-3 receipt containing both digests and compute the
   receipt digest.
4. Call the AGE-4 transaction port with the same candidate and an
   `effect-receipt` attachment containing that receipt digest.
5. Insert or replay the final receipt, attach the reference and retention pin,
   and change effect state from `consumed` to `receipted`.
6. Commit all D4 and AGE-4 metadata or none.

There is no digest cycle. `ContentReferenceV1` does not include its attachment,
so its digest is computable before the receipt. The AGE-4 attachment then binds
the completed receipt digest to that independently computed reference in the
same transaction.

A failed metadata transaction leaves a durable but unreferenced candidate and
the effect in `consumed`. It never leaves a committed receipt pointing to
absent bytes or a committed content reference detached from its receipt.

AGE-3 never constructs or extends the AGE-4 union. D4 supplies its outer owner
domain and exact arm, and AGE-4 verifies that the imported effect-result
binding matches every content constraint admitted by this contract.

### 21.5 Replay and conflict

The receipt semantic key is `(ownerDomainId, runId, consumptionDigest)`.
Identical replay returns the same receipt and AGE-4 reference. Any changed
submission, observation, target, usage, time, result, candidate, reference
transaction, principal, or environment conflicts.

If the state is already terminal for another reason, AGE-3 does not mutate it.
A trustworthy late receipt may be offered only to the separate AGE-5
supplemental-observation path keyed by the frozen terminal checkpoint. This
contract grants no such append by itself.

## 22. Ambiguity and recovery

### 22.1 Recovery evidence

```ts
type EffectRecoveryEvidenceV1 =
  | {
      schema: "prism-age3-recovery-evidence-v1";
      kind: "durable-state-only";
      observedStateDigest: EffectStateDigestV1;
    }
  | {
      schema: "prism-age3-recovery-evidence-v1";
      kind: "executor-reconciliation";
      observedStateDigest: EffectStateDigestV1;
      executorBindingDigest: ExecutionBindingDigest;
      reconciliationObservationDigest: ExecutorReconciliationObservationDigestV1;
    };

type ExecutorReconciliationOutcomeV1 =
  | "not-started-proven"
  | "started-without-trustworthy-receipt"
  | "execution-status-uncertain";

interface ExecutorReconciliationObservationV1 {
  schema: "prism-age3-executor-reconciliation-observation-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  consumptionDigest: EffectConsumptionDigestV1;
  executorBindingDigest: ExecutionBindingDigest;
  executorPrincipalId: PrincipalId;
  outcome: ExecutorReconciliationOutcomeV1;
  observedAt: EpochMonotonicInstantV1;
  observationDaemonEpoch: DaemonEpoch;
}
```

The exact executor produces this bounded metadata observation through its
admitted reconciliation binding. It contains no raw result, path, endpoint,
credential, or reusable handle. A recovered trustworthy receipt is submitted
through the normal receipt protocol instead. The observation cannot itself
commit a receipt, choose a destination, issue a permit, or authorize retry.

### 22.2 Ambiguity record

```ts
type EffectAmbiguityReasonV1 =
  | "consumed-receipt-missing"
  | "executor-start-uncertain"
  | "destination-identity-uncertain"
  | "receipt-authentication-failed-after-consumption"
  | "receipt-content-unavailable"
  | "receipt-exceeded-precharge"
  | "receipt-completed-after-deadline"
  | "verification-outcome-uncertain";

interface EffectAmbiguityRecordV1 {
  schema: "prism-age3-ambiguity-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  permitDigest: EffectPermitDigestV1;
  consumptionDigest: EffectConsumptionDigestV1;
  reason: EffectAmbiguityReasonV1;
  recoveryEvidenceDigest: EffectRecoveryEvidenceDigestV1;
  automaticRedispatchForbidden: true;
  stateVersionAfterAmbiguity: SettlementStateVersion;
  ambiguityTransactionId: EffectTransactionIdV1;
}
```

The recovery evidence records facts used to choose ambiguity and grants no
execution or retry authority.

`ambiguous` is terminal for this effect lifecycle. Reconciliation may produce
a supplemental observation later, but cannot rewrite the effect, refund its
budget, issue another permit, or authorize automatic redispatch.

### 22.3 Recovery record

```ts
type EffectRecoveryOutcomeV1 =
  | { kind: "rejected-pre-dispatch"; reason: PreDispatchRejectReasonV1 }
  | { kind: "rejected-expired"; expiredBoundary: ExpiredBoundaryV1 }
  | { kind: "rejected-epoch-loss"; priorDaemonEpoch: DaemonEpoch }
  | { kind: "receipted"; receiptDigest: EffectReceiptDigestV1 }
  | { kind: "ambiguous"; ambiguityRecordDigest: EffectAmbiguityRecordDigestV1 }
  | { kind: "terminal-replay"; stateDigest: EffectStateDigestV1 };

interface EffectRecoveryRecordV1 {
  schema: "prism-age3-recovery-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  reservationDigest: EffectReservationDigestV1;
  observedStateDigest: EffectStateDigestV1;
  priorDaemonEpoch: DaemonEpoch;
  recoveryDaemonEpoch: DaemonEpoch;
  recoveryEvidenceDigest: EffectRecoveryEvidenceDigestV1;
  outcome: EffectRecoveryOutcomeV1;
  stateVersionAfterRecovery: SettlementStateVersion;
  recoveryTransactionId: EffectTransactionIdV1;
}
```

Recovery authenticates the current D2 epoch and lease, reads durable state,
and never reconstructs authority from memory, logs, provider responses, model
output, or an old process. It reparses no proposal and reruns no resolver.

### 22.4 Exact recovery matrix

| Durable state | Required recovery |
|---|---|
| `reserved`, no permit | Commit `rejected-pre-dispatch` with `epoch-loss-before-permit`; no execution authority crossed |
| `awaiting-approval` | Commit `rejected-epoch-loss`; old subject and challenge remain evidence only |
| `approved-awaiting-permit` | Commit `rejected-epoch-loss`; prior decision remains evidence only |
| `permit-issued`, not consumed, same epoch and deadline due | Commit `rejected-expired` |
| `permit-issued`, not consumed, epoch changed | Commit `rejected-epoch-loss`; durable state proves no consumption crossed |
| `consumed`, trustworthy receipt found and not yet committed | Validate and commit that exact receipt once |
| `consumed`, no trustworthy receipt or no-effect proof | Commit `ambiguous`; never redispatch automatically |
| `receipted` | Return the immutable receipt and state |
| any other terminal state | Return the immutable existing state |

The `consumed` row never becomes a pre-dispatch rejection. Cancellation,
shutdown, owner request, budget exhaustion, or a new daemon epoch cannot erase
the possibility that execution occurred.

### 22.5 Crash boundaries

The conformance suite injects process death and response loss:

- immediately before and after budget claim and reservation commit;
- immediately before and after approval decision commit;
- immediately before and after permit issue;
- immediately before and after permit consumption;
- immediately before executor first-start journal commit;
- immediately before and after AGE-4 durable publication; and
- immediately before and after the atomic reference and receipt commit.

Each boundary must recover to exactly one matrix row under both the in-memory
test adapter and the production durable adapter.

## 23. Interfaces

### 23.1 Admission and resolver ports

```ts
type EffectAuthorityRejectReasonV1 =
  | "authentication-failed"
  | "authority-subset-failed"
  | "binding-invalid"
  | "budget-exhausted"
  | "deadline-expired"
  | "epoch-or-lease-stale"
  | "idempotency-conflict"
  | "one-open-effect-conflict"
  | "principal-or-kind-mismatch"
  | "state-conflict"
  | "target-invalid";

interface EffectAuthorityRejectV1 {
  kind: "rejected";
  reason: EffectAuthorityRejectReasonV1;
}

type DestinationResolutionRejectReasonV1 =
  | "selector-invalid"
  | "zero-matches"
  | "multiple-matches"
  | "capability-not-granted"
  | "protected-or-unclassifiable"
  | "resolver-or-catalog-drift";

interface DestinationResolutionRejectV1 {
  kind: "destination-resolution-rejected";
  reason: DestinationResolutionRejectReasonV1;
}

interface ExecutorUncertaintyV1 {
  kind: "executor-uncertainty";
  consumptionDigest: EffectConsumptionDigestV1;
  reason: EffectAmbiguityReasonV1;
}

interface AuthoritySubsetProofV1 {
  schema: "prism-age3-authority-subset-proof-v1";
  ownerDomainId: OwnerDomainId;
  requestedAuthorityDigest: RequestedAuthorityEnvelopeDigestV1;
  grantedOperationCatalogDigest: GrantedOperationCatalogDigestV1;
  effectBudgetPolicyDigest: EffectBudgetPolicyDigestV1;
  effectDeadlinePolicyDigest: EffectDeadlinePolicyDigestV1;
  checkerBindingDigest: ExecutionBindingDigest;
  result: "all-subsets-proven";
}

interface EffectAuthorityAdmission {
  proveSubset(
    requestedAuthorityDigest: RequestedAuthorityEnvelopeDigestV1,
    grantedOperationCatalogDigest: GrantedOperationCatalogDigestV1,
    effectBudgetPolicyDigest: EffectBudgetPolicyDigestV1,
    effectDeadlinePolicyDigest: EffectDeadlinePolicyDigestV1,
  ): Promise<AuthoritySubsetProofV1 | EffectAuthorityRejectV1>;
}

interface OutwardDestinationResolver {
  resolve(
    input: AuthenticatedEffectCommand<ResolveOutwardDestinationRequestV1>,
  ): Promise<ResolvedOutwardDestinationV1 | DestinationResolutionRejectV1>;
}
```

`AuthoritySubsetProofV1` is hashed as
`AuthoritySubsetProofDigestV1` under domain
`prism-age3-authority-subset-proof-v1`. AGE-1 may store the proof as admission
evidence, but task identity continues to bind the four imported authority
digests directly.

### 23.2 D4 transaction port

```ts
interface EffectAuthorityTransactionPort {
  reserve(
    tx: HostTransactionContext,
    input: EffectReservationRequestV1,
  ): Promise<EffectReservationV1 | EffectAuthorityRejectV1>;

  attachApprovalGate(
    tx: HostTransactionContext,
    input: AttachApprovalGateCommandV1,
  ): Promise<EffectStateV1 | EffectAuthorityRejectV1>;

  applyApprovalDecision(
    tx: HostTransactionContext,
    input: ApplyApprovalDecisionCommandV1,
  ): Promise<EffectStateV1 | EffectAuthorityRejectV1>;

  cancelUnconsumed(
    tx: HostTransactionContext,
    input: CancelUnconsumedEffectCommandV1,
  ): Promise<EffectStateV1 | EffectAuthorityRejectV1>;

  issuePermit(
    tx: HostTransactionContext,
    input: EffectPermitClaimV1,
  ): Promise<EffectPermitV1 | EffectAuthorityRejectV1>;

  consumePermit(
    tx: HostTransactionContext,
    input: ConsumeEffectPermitCommandV1,
  ): Promise<EffectConsumptionV1 | EffectAuthorityRejectV1>;

  commitReceipt(
    tx: HostTransactionContext,
    input: CommitEffectReceiptCommandV1,
  ): Promise<EffectReceiptV1 | EffectAuthorityRejectV1>;

  recover(
    tx: HostTransactionContext,
    reservationDigest: EffectReservationDigestV1,
  ): Promise<EffectRecoveryRecordV1 | EffectAuthorityRejectV1>;
}
```

This port is internal to the D4 transaction writer. It is not available to the
coordinator, model, plugins, broker, local executor, outward adapter, verifier,
operator renderer, consumer, or external observer.

### 23.3 Executor ports

```ts
interface ModelDispatchEffectExecutor {
  executeConsumedModelDispatch(
    permit: Extract<EffectPermitV1, { kind: "model-dispatch" }>,
    consumption: EffectConsumptionV1,
    request: EffectExecutionRequestV1,
  ): Promise<EffectReceiptSubmissionV1 | ExecutorUncertaintyV1>;
}

interface LocalToolEffectExecutor {
  executeConsumedLocalTool(
    permit: Extract<EffectPermitV1, { kind: "local-tool" }>,
    consumption: EffectConsumptionV1,
    request: EffectExecutionRequestV1,
  ): Promise<EffectReceiptSubmissionV1 | ExecutorUncertaintyV1>;
}

interface OutwardToolEffectExecutor {
  executeConsumedOutwardTool(
    permit: Extract<EffectPermitV1, { kind: "outward-tool" }>,
    consumption: EffectConsumptionV1,
    request: EffectExecutionRequestV1,
  ): Promise<EffectReceiptSubmissionV1 | ExecutorUncertaintyV1>;
}

interface VerificationEffectExecutor {
  executeConsumedVerification(
    permit: Extract<EffectPermitV1, { kind: "verification" }>,
    consumption: EffectConsumptionV1,
    request: EffectExecutionRequestV1,
  ): Promise<EffectReceiptSubmissionV1 | ExecutorUncertaintyV1>;
}

interface EffectExecutorReconciler {
  reconcileConsumedEffect(
    permit: EffectPermitV1,
    consumption: EffectConsumptionV1,
  ): Promise<EffectReceiptSubmissionV1 | ExecutorReconciliationObservationV1>;
}
```

The host delivers each port only to its exact admitted principal. The output is
a receipt submission, not an internal command or committed receipt. Only D4
can authenticate it, allocate transaction identity, validate it, attach
content, and commit it.

`AuthenticatedEffectCommand<T>`, `EffectAuthorityRejectV1`,
`DestinationResolutionRejectV1`, and `ExecutorUncertaintyV1` are generated
transport or rejection unions. They contain no authority beyond the accepted
record and are resolved in the integrated D2/D4 package.

No executor interface exposes arbitrary provider routes, local paths,
destination selectors, generic network clients, content write handles,
approval mutation, budget mutation, or terminal-state mutation.

## 24. Failure semantics

| Condition | Required result |
|---|---|
| Requested envelope, grant, budget, or deadline subset proof incomplete | Reject admission; no run authority |
| Operation key absent, duplicated, wrong-kind, or binding incomplete | Reject before reservation |
| Goal or model content names a tool, principal, route, path, or destination not in the grant | Reject before reservation |
| Local capability fails whole-boundary or no-follow validation | Reject before reservation |
| Outward destination is protected, unknown, multiple, raw, redirected, aliased, indirect, or unclassifiable | Reject before reservation; if uncertainty begins after consumption, `ambiguous` |
| Budget addition overflows or exceeds any limit | Reject atomically; no reservation and no partial claim |
| Second nonterminal effect is requested for one run | Reject atomically; existing effect unchanged |
| Approval denied | `rejected-denied`; no permit |
| Approval or permit check occurs at deadline equality or later | `rejected-expired`; no new execution authority |
| Wrong principal, effect kind, target, epoch, lease, generation, or state version claims or consumes | Reject; no state change |
| Permit consumed and no trustworthy receipt exists | `ambiguous`; no automatic retry |
| Receipt claims a changed route, capability, destination, principal, environment, or schema | Reject as untrustworthy; consumed effect becomes `ambiguous` on recovery |
| Receipt exceeds precharged provider usage or content bytes | `ambiguous`; no budget mutation or refund |
| Output-bearing receipt lacks durable AGE-4 content | No receipt commitment; recover consumed state as `ambiguous` if unresolved |
| AGE-4 reference or AGE-3 receipt side of atomic commit fails | Commit neither; retain consumed state and reconcile exact transaction identity |
| Trustworthy receipt already committed | Return it and settle exactly once |
| Terminal state exists | Return immutable state; late evidence uses AGE-5 supplemental path only |

## 25. Proposed AGE-3 invariant refinements

These aliases refine the architecture's proposed invariant families. Final IDs
belong to the successor constitutional baseline.

| Alias | Target statement | Proof class |
|---|---|---|
| `AGE3-INV-GRANT` | Every executable effect resolves one complete admitted operation binding that is proven equal to or narrower than the template request. | Static plus runtime adversarial |
| `AGE3-INV-DEST` | Every outward effect resolves exactly one owner-pinned non-protected destination before reservation and carries it unchanged through receipt. | Runtime adversarial |
| `AGE3-INV-SERIAL` | One run has at most one nonterminal effect, and its reservation atomically claims one monotonic budget charge. | Runtime adversarial |
| `AGE3-INV-PERMIT` | Every effect kind uses one tagged permit claimable and consumable once only by its exact principal strictly before its epoch-local deadline. | Runtime adversarial |
| `AGE3-INV-RECEIPT` | A receipt binds the consumed permit, exact target, environment, usage, and closed result; output bytes exist only through an atomically attached durable AGE-4 reference. | Runtime adversarial |
| `AGE3-INV-RECOVERY` | Proven pre-consumption states reject safely, consumed uncertainty becomes ambiguous, committed receipts settle once, and terminal state never rewrites. | Runtime adversarial |

## 26. Conformance requirements

One generated conformance suite must run unchanged against the in-memory test
adapter and the production durable adapter. It must include:

1. canonical codec fixtures for every AGE-3 root, union arm, digest domain,
   collection order, duplicate rejection, and single-field mutation;
2. request-to-grant subset tests covering unknown operations, wrong kinds,
   widened classes, widened charges, widened deadlines, missing policies, and
   arithmetic overflow;
3. destination tests covering protected classes, credential stores, raw
   endpoints, absolute and relative paths, traversal, symlinks, aliases,
   redirects, DNS and service indirection, aggregate writers, alternate
   tenants, multiple matches, and classifier drift;
4. reservation and budget races proving one operation ID, one claim, one
   ledger append, and one nonterminal effect under concurrent callers and lost
   responses;
5. approval races at one tick before, exactly at, and one tick after both gate
   and challenge deadlines, including daemon epoch loss;
6. permit tests for every kind covering correct and wrong principals,
   cross-kind replay, concurrent claims, issue-response loss, consume-response
   loss, exact deadline boundaries, stale leases, stale generations, and target
   drift;
7. executor idempotency tests proving duplicate delivery of one consumption
   digest causes at most one external or local start;
8. receipt tests covering target drift, principal drift, environment drift,
   over-usage, late completion, wrong result arm, missing content, candidate
   corruption, reference and receipt atomicity, and exact replay; and
9. fault injection at every boundary in Section 22.5, with byte-identical
   recovery outcomes and no automatic post-consumption redispatch.

The package also requires two independent canonical codecs to reproduce every
AGE-3 digest and reject alternate encodings. Static tests must prove executors
cannot reach D4 mutation ports, AGE-4 storage handles, provider credentials,
unscoped local roots, or generic outward clients.

This milestone runs structural draft verification only. Independent hardening,
constitutional proof registration, implementation ratification, and code tests
remain future package gates.

## 27. Downstream contract boundary

AGE-2 may import AGE-3 operation keys, reservation commands, lifecycle state,
permit and receipt outcomes, and recovery records to define deterministic turn
progression. It cannot create or mutate grants, targets, budgets, deadlines,
permits, receipts, or recovery outcomes.

AGE-5 may import AGE-3 operation bindings, reservations, resolved destinations,
approval requirements, verification specializations, receipts, and ambiguity
records. It may define lossless approval views, authenticated decisions,
verification interpretation, completion, terminal evidence, and supplemental
late observations. It cannot write AGE-3 state directly or widen execution
authority.

Work-program selection, governed adaptation, external observability,
installation, deployment, publication, and AGE-6 remain outside this contract.
An AGE-3 receipt or content reference grants none of those powers.

## 28. Draft closure record

This draft now participates in one reconciled AGE-1 through AGE-5 package. It
defines AGE-3's owned schemas, state family, authority transitions, external
target boundary, budget and deadline law, content receipt handshake,
cancellation compare-and-set, and recovery outcomes.

It does not:

- ratify AGE-3 or the integrated AGE package;
- assign successor constitutional invariant IDs;
- authorize implementation, migration, installation, deployment, or live
  provider execution;
- reconcile retired D8-era downstream documents; or
- begin independent hardening.

All AGE-3 cross-contract package seams are resolved. The next authorized
milestone is the successor constitutional baseline under a separate
instruction. The reconciled draft remains contract evidence, not
implementation authority.
