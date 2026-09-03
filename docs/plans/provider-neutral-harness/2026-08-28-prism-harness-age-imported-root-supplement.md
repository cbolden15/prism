# AGE imported-root supplement

Date: 2026-08-28

Status: **bounded root supplement, candidate contract material**. Drafted under
Gate A0 of the constitutional closure program using Goal 36 drafting authority
only. It assigns exact names, owners, bounded shapes, digest domains, and
source identities to every symbol the reconciled AGE-1 through AGE-5 contracts
import without owning. It is not owner-ratified law, grants no runtime,
implementation, or proof authority, and does not amend any AGE contract byte.

Decision area: Autonomous Goal Execution constitutional law (imported roots).

## 1. Purpose and authority

The five reconciled AGE contracts reference symbols owned outside the package:
D1 admission, D2 custody, and D4 settlement runtime roots, two D6
contract-package roots, and shared primitive constructors. No owner contract
document defines these roots today; their only prior written shapes sit in the
frozen D8 goal-execution draft, which is byte-identical historical evidence
with no authority.

Gate A0 of the closure program directs: inventory every imported symbol not
owned by AGE-1 through AGE-5, add a closed mapping, and, where an owner
contract is absent, use Goal 36 authority only to draft a bounded root
supplement. This document is that supplement. Drafting it is authoring work
permitted by the ratified Plan A completion outcome (Plan B authoring allowed);
it creates no implementation authority, which remains not authorized.

Bounded means: this supplement fixes each root's name, owning area, bounded
logical shape or explicit opacity, digest domain where the root is a digest,
and exact source identity. It does not define runtime behavior, internals of
D1, D2, or D4 services, or any new law row.

## 2. Source bindings

| Source | Git object | Role |
|---|---|---|
| AGE-1 Task Authority | `5e531334cc4f63eaa957341c5505e24f970444c2` | Importing contract |
| AGE-2 Run Coordination | `651943a4581e57079b804b29722403933178419c` | Importing contract |
| AGE-3 Effect Authority | `c8cebdc7f4528d3a7a2b0539b6247581cd26d33e` | Importing contract |
| AGE-4 Content Custody | `34657d4c3e3d0d230663023e48d886f8e4b73e20` | Importing contract |
| AGE-5 Human Decision and Completion | `b2df98c612870097f3ece3dcf2eb15fd6d7ad89e` | Importing contract |
| Accepted AGE architecture | `5fc1443f9d8e740d4811a02d9e3a5dd637a12184` | D1 through D7 area ownership (section 15) |
| Frozen D8 goal-execution draft | `d7e65343f1d893688ae5740b9c2ffde5430708ac` | Historical shape provenance only; no authority |

The inventory below is mechanical: a symbol is package-owned when any AGE
contract declares it in a TypeScript block, a vocabulary or digest table row,
or its export list; every other referenced or import-listed symbol is external
and must appear exactly once in the section 4 mapping. TypeScript builtin
utility types are excluded.

## 3. Root definitions

Each family below fixes bounded shapes. Internals marked opaque are owned by
the named area's future contract; importers depend only on the name, arity,
and brand fixed here.

### 3.1 Shared primitive constructors

`CanonicalSortedUniqueSetV1` keeps the exact branded form recorded in the
frozen D8 draft so historical and candidate usage stay shape-identical.

```ts
type Digest<TDomain extends string> = `sha256:${string}` & {
  readonly digestDomain: TDomain;
};

type DigestBytes<TBrand extends string> = `sha256:${string}` & {
  readonly requestBrand: TBrand;
};

type BrandedU64<TBrand extends string> = bigint & {
  readonly u64Brand: TBrand;
};

type NonZeroU64 = bigint & { readonly nonZeroU64Brand: true };

type NonZeroBoundedU32<TBrand extends string> = number & {
  readonly nonZeroBoundedU32Brand: TBrand;
};

type BoundedString<TBrand extends string> = string & {
  readonly boundedStringBrand: TBrand;
};

declare const canonicalSortedUniqueSetV1Brand: unique symbol;
type CanonicalSortedUniqueSetV1<T> = ReadonlyArray<T> & {
  readonly [canonicalSortedUniqueSetV1Brand]: true;
};
```

### 3.2 D1 admission roots

```ts
type OwnerDomainId = BoundedString<"prism-d1-owner-domain-id">;
type AuthorizationPolicyDigest = Digest<"prism-d1-authorization-policy">;
type DependencyClosureDigest = Digest<"prism-d1-dependency-closure">;
type EffectiveGrantDigest = Digest<"prism-d1-effective-grant">;
type ExecutionBindingCatalogDigest = Digest<"prism-d1-execution-binding-catalog">;
type ExecutionBindingDigest = Digest<"prism-d1-execution-binding">;
type OwnerRegistryDecisionDigest = Digest<"prism-d1-owner-registry-decision">;
type PluginSetDigest = Digest<"prism-d1-plugin-set">;
type ProviderBrokerBindingCatalogDigest = Digest<"prism-d1-provider-broker-binding-catalog">;
type RegistryDigest = Digest<"prism-d1-registry">;
type SchemaDigestV1 = Digest<"prism-d1-schema-v1">;
type TrustedRootDigest = Digest<"prism-d1-trusted-root">;
```

### 3.3 D2 custody roots

Identity scalars, epoch-fenced time values, and post-authentication envelope
constructors. Envelope internals (owner domain, principal, role, epoch, and
lease derivation after operating-system peer authentication) are D2-owned and
deliberately opaque here.

```ts
type ActivationRequestId = BoundedString<"prism-d2-activation-request-id">;
type DaemonEpoch = BrandedU64<"prism-d2-daemon-epoch">;
type HostAuthorityDomainId = BoundedString<"prism-d2-host-authority-domain-id">;
type OwnershipLeaseIdentity = BoundedString<"prism-d2-ownership-lease-identity">;
type PrincipalId = BoundedString<"prism-d2-principal-id">;
type ProductionEnvironmentId = BoundedString<"prism-d2-production-environment-id">;
type RoleId = BoundedString<"prism-d2-role-id">;
type RunId = BoundedString<"prism-d2-run-id">;

interface EpochMonotonicInstantV1 {
  daemonEpoch: DaemonEpoch;
  monotonicNanoseconds: NonZeroU64;
}

interface EpochMonotonicDeadlineV1 {
  daemonEpoch: DaemonEpoch;
  monotonicNanoseconds: NonZeroU64;
}

type ConfiguredStorageRootRegistryDigestV1 = Digest<"prism-d2-configured-storage-root-registry-v1">;
type LiveMountInventoryDigestV1 = Digest<"prism-d2-live-mount-inventory-v1">;
type MountPolicyDigestV1 = Digest<"prism-d2-mount-policy-v1">;
type OwnerCustodyDecisionDigest = Digest<"prism-d2-owner-custody-decision">;
type OwnerDomainCatalogDigestV1 = Digest<"prism-d2-owner-domain-catalog-v1">;
type ProtectedRootPolicyDigestV1 = Digest<"prism-d2-protected-root-policy-v1">;
type ProvisionedLocalCapabilityDigestV1 = Digest<"prism-d2-provisioned-local-capability-v1">;
type RootAccessPolicyDigestV1 = Digest<"prism-d2-root-access-policy-v1">;
type StorageInventoryPolicyDigestV1 = Digest<"prism-d2-storage-inventory-policy-v1">;

declare const d2ChannelEnvelopeBrand: unique symbol;
declare const d2CoordinatorEnvelopeBrand: unique symbol;
declare const d2EffectEnvelopeBrand: unique symbol;
declare const d2CustodyEnvelopeBrand: unique symbol;
declare const d2SubmissionLookupBrand: unique symbol;
declare const d2HostTransactionBrand: unique symbol;

interface AuthenticatedChannelCommand<TCommand> {
  readonly [d2ChannelEnvelopeBrand]: true;
  readonly command: TCommand;
}

interface AuthenticatedCoordinatorCommand<TCommand> {
  readonly [d2CoordinatorEnvelopeBrand]: true;
  readonly command: TCommand;
}

interface AuthenticatedEffectCommand<TCommand> {
  readonly [d2EffectEnvelopeBrand]: true;
  readonly command: TCommand;
}

interface AuthenticatedCustodyCommand<TCommand> {
  readonly [d2CustodyEnvelopeBrand]: true;
  readonly command: TCommand;
}

interface AuthenticatedSubmissionLookup {
  readonly [d2SubmissionLookupBrand]: true;
}

interface HostTransactionContext {
  readonly [d2HostTransactionBrand]: true;
}
```

### 3.4 D4 settlement roots

```ts
type AdmissionAcknowledgementDigest = Digest<"prism-d4-admission-acknowledgement">;
type AdmissionCheckpointDigest = Digest<"prism-d4-admission-checkpoint">;
type D4RetentionReleaseAuthorityDigestV1 = Digest<"prism-d4-retention-release-authority-v1">;
type EvidenceCheckpointDigest = Digest<"prism-d4-evidence-checkpoint">;
type ReferenceCommitTransactionId = BoundedString<"prism-d4-reference-commit-transaction-id">;
type SettlementStateVersion = BrandedU64<"prism-d4-settlement-state-version">;
```

### 3.5 D6 contract-package roots

```ts
type CanonicalCodecBindingDigestV1 = Digest<"prism-d6-canonical-codec-binding-v1">;
type SchemaBundleDigestV1 = Digest<"prism-d6-schema-bundle-v1">;
type BoundedByteString = Uint8Array & {
  readonly boundedByteStringBrand: true;
};
```

### 3.6 Contract-local informal vocabulary

Twelve names are referenced by exactly one contract's port interfaces without
a formal declaration. They are that contract's own vocabulary, not external
imports. This supplement assigns their ownership; adding formal declarations
is a carried follow-up for each owning contract's next revision, not an A0
change.

- AGE-1: `AuthorizedTaskDisclosureRequest`, `GoalSubmissionDecision`,
  `TaskDisclosure`, `TemplateValidation`, `UntrustedTemplateBytes`.
- AGE-4: `AuthorizedIntegrityReconciliationRequest`,
  `ContentReconciliationReport`, `ContentRetentionDecision`,
  `InternalReferenceVerificationRequest`, `PrepareContentDecision`,
  `ReadContentDecision`, `ReferenceVerification`.

## 4. Closed import mapping

The mapping is normative for the candidate package and closed in both
directions: every external symbol from the section 2 inventory rule appears
exactly once, and no row names a symbol the package declares. The importing
AGE fields column records the exact per-contract count of typed references,
with up to two exemplar fields; `0 (import row only)` marks a contract that
lists the symbol in its imports table without a typed reference. The complete
field enumeration is mechanical and is recomputed by the refreshed package
verifier, which checks every count in this table.

| Root | Owner | Schema | Digest domain | Source identity | Importing AGE fields |
|---|---|---|---|---|---|
| `AuthorizationPolicyDigest` | D1 | sha-256 digest scalar | `prism-d1-authorization-policy` | this supplement §3.2 | AGE-1: 1 (AuthenticatedGoalSubmissionV1.authorizationPolicyDigest); AGE-2: 0 (import row only); AGE-3: 0 (import row only); AGE-4: 2 (ContentAccessPolicyV1.authorizationPolicyDigest, ContentReadReceiptV1.authorizationPolicyDigest); AGE-5: 6 (AuthenticatedAge5CommandV1.authorizationPolicyDigest, ApprovalPolicyBindingV1.authorizationPolicyDigest, …) |
| `DependencyClosureDigest` | D1 | sha-256 digest scalar | `prism-d1-dependency-closure` | this supplement §3.2 | AGE-1: 2 (GoalInputSchemaBindingV1.validatorDependencyClosureDigest, GoalInputSchemaBindingV1.rendererDependencyClosureDigest); AGE-2: 4 (ProposalParserBindingV1.parserDependencyClosureDigest, ConversationSerializerBindingV1.serializerDependencyClosureDigest, …); AGE-3: 6 (ParameterConstructionBindingV1.constructorDependencyClosureDigest, GrantedOperationCommonV1.executorDependencyClosureDigest, …); AGE-4: 7 (PhysicalRootIdentityV1.measurementDependencyClosureDigest, StorageRootCatalogV1.probeDependencyClosureDigest, …); AGE-5: 7 (ApprovalClassPolicyV1.subjectConstructorDependencyClosureDigest, ApprovalClassPolicyV1.viewConstructorDependencyClosureDigest, …) |
| `EffectiveGrantDigest` | D1 | sha-256 digest scalar | `prism-d1-effective-grant` | this supplement §3.2 | AGE-1: 1 (GoalTaskImportSetV1.effectiveGrantDigest); AGE-3: 1 (GrantedOperationCatalogV1.effectiveGrantDigest) |
| `ExecutionBindingCatalogDigest` | D1 | sha-256 digest scalar | `prism-d1-execution-binding-catalog` | this supplement §3.2 | AGE-1: 1 (GoalTaskImportSetV1.executionBindingCatalogDigest); AGE-3: 1 (GrantedOperationCatalogV1.executionBindingCatalogDigest) |
| `ExecutionBindingDigest` | D1 | sha-256 digest scalar | `prism-d1-execution-binding` | this supplement §3.2 | AGE-1: 2 (GoalInputSchemaBindingV1.validatorExecutableBindingDigest, GoalInputSchemaBindingV1.rendererExecutableBindingDigest); AGE-2: 5 (ProposalParserBindingV1.parserExecutionBindingDigest, ConversationSerializerBindingV1.serializerExecutionBindingDigest, …); AGE-3: 23 (ParameterConstructionBindingV1.constructorExecutionBindingDigest, EffectReceiptContractV1.executionIdempotencyBindingDigest, …); AGE-4: 7 (PhysicalRootIdentityV1.measurementExecutableBindingDigest, StorageRootCatalogV1.probeExecutableBindingDigest, …); AGE-5: 12 (ApprovalClassPolicyV1.subjectConstructorExecutionBindingDigest, ApprovalClassPolicyV1.viewConstructorExecutionBindingDigest, …) |
| `OwnerDomainId` | D1 | opaque identity scalar | — | this supplement §3.2 | AGE-1: 5 (TaskTemplateV1.ownerDomainId, AuthenticatedGoalSubmissionV1.ownerDomainId, …); AGE-2: 18 (CoordinatorContentProducerBindingV1.ownerDomainId, CoordinatorContentBudgetCoverageProofV1.ownerDomainId, …); AGE-3: 25 (LocalCapabilityBindingV1.ownerDomainId, GrantedOperationCatalogV1.ownerDomainId, …); AGE-4: 16 (StorageRootScopeV1.ownerDomainId, CustodyContinuityEvidenceV1.ownerDomainId, …); AGE-5: 23 (AuthenticatedAge5CommandV1.ownerDomainId, ApprovalPolicyBindingV1.ownerDomainId, …) |
| `OwnerRegistryDecisionDigest` | D1 | sha-256 digest scalar | `prism-d1-owner-registry-decision` | this supplement §3.2 | AGE-1: 2 (TaskTemplateRatificationV1.ownerRegistryDecisionDigest, TaskTemplateAvailabilityV1.ownerRegistryDecisionDigest) |
| `PluginSetDigest` | D1 | sha-256 digest scalar | `prism-d1-plugin-set` | this supplement §3.2 | AGE-1: 1 (GoalTaskImportSetV1.pluginSetDigest) |
| `ProviderBrokerBindingCatalogDigest` | D1 | sha-256 digest scalar | `prism-d1-provider-broker-binding-catalog` | this supplement §3.2 | AGE-1: 1 (GoalTaskImportSetV1.providerBrokerBindingCatalogDigest); AGE-3: 2 (GrantedOperationBindingV1.providerBrokerBindingCatalogDigest, GrantedOperationCatalogV1.providerBrokerBindingCatalogDigest) |
| `RegistryDigest` | D1 | sha-256 digest scalar | `prism-d1-registry` | this supplement §3.2 | AGE-1: 3 (TaskTemplateRatificationV1.registryDigest, TaskTemplateAvailabilityV1.effectiveRegistryDigest, …) |
| `SchemaDigestV1` | D1 | sha-256 digest scalar | `prism-d1-schema-v1` | this supplement §3.2 | AGE-1: 1 (GoalInputSchemaBindingV1.goalSchemaDigest); AGE-2: 14 (ProposalGrammarBindingV1.grammarSchemaDigest, ProposalGrammarBindingV1.actionDirectiveSchemaDigest, …); AGE-3: 9 (ParameterConstructionBindingV1.parameterSchemaDigest, ParameterConstructionBindingV1.canonicalOutputSchemaDigest, …); AGE-4: 5 (ContentObjectDescriptorV1.contentSchemaDigest, ContentObjectDescriptorV1.parameterSchemaDigest, …); AGE-5: 17 (ApprovalClassPolicyV1.subjectSchemaDigest, ApprovalClassPolicyV1.viewSchemaDigest, …) |
| `TrustedRootDigest` | D1 | sha-256 digest scalar | `prism-d1-trusted-root` | this supplement §3.2 | AGE-1: 1 (GoalTaskImportSetV1.trustedRootDigest) |
| `ActivationRequestId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AdmittedGoalRunV1.activationRequestId) |
| `AuthenticatedChannelCommand` | D2 | generic constructor | — | this supplement §3.3 | AGE-1: 1 (TaskAuthority.submitGoal()) |
| `AuthenticatedCoordinatorCommand` | D2 | generic constructor | — | this supplement §3.3 | AGE-2: 1 (RunCoordinator.next()) |
| `AuthenticatedCustodyCommand` | D2 | generic constructor | — | this supplement §3.3 | AGE-4: 3 (ContentCustody.prepare(), ContentCustody.readByValue(), …) |
| `AuthenticatedEffectCommand` | D2 | generic constructor | — | this supplement §3.3 | AGE-3: 1 (OutwardDestinationResolver.resolve()) |
| `AuthenticatedSubmissionLookup` | D2 | authenticated lookup envelope | — | this supplement §3.3 | AGE-1: 1 (TaskAuthority.resumeSubmission()) |
| `ConfiguredStorageRootRegistryDigestV1` | D2 | sha-256 digest scalar | `prism-d2-configured-storage-root-registry-v1` | this supplement §3.3 | AGE-4: 1 (TopologyCompletenessEvidenceV1.configuredRootRegistryDigest) |
| `DaemonEpoch` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AdmittedGoalRunV1.daemonEpoch); AGE-2: 1 (CoordinatorGenerationRecordV1.daemonEpoch); AGE-3: 10 (EffectReservationV1.daemonEpoch, EffectLifecycleStateV1.priorDaemonEpoch, …); AGE-4: 5 (StorageRootCatalogV1.daemonEpoch, TopologyCompletenessEvidenceV1.daemonEpoch, …); AGE-5: 7 (AuthenticatedAge5CommandV1.daemonEpoch, ApprovalGateV1.daemonEpoch, …) |
| `EpochMonotonicDeadlineV1` | D2 | epoch-fenced time value | — | this supplement §3.3 | AGE-3: 6 (EffectReservationV1.gateDeadline, EffectLifecycleStateV1.gateDeadline, …); AGE-4: 1 (ContentPublicationLeaseV1.monotonicDeadline); AGE-5: 8 (ApprovalSubjectV1.gateDeadline, ApprovalViewV1.gateDeadline, …) |
| `EpochMonotonicInstantV1` | D2 | epoch-fenced time value | — | this supplement §3.3 | AGE-3: 8 (EffectReservationV1.reservedAt, EffectPermitCommonV1.issuedAt, …); AGE-5: 5 (ApprovalChallengeV1.issuedAt, ApprovalGateLifecycleV1.expiredAt, …) |
| `HostAuthorityDomainId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-4: 3 (StorageRootScopeV1.hostAuthorityDomainId, StorageRootCatalogV1.hostAuthorityDomainId, …) |
| `HostTransactionContext` | D2 | opaque transaction context | — | this supplement §3.3 | AGE-2: 4 (RunCoordinationTransactionPort.acquireGeneration(), RunCoordinationTransactionPort.commitCheckpoint(), …); AGE-3: 8 (EffectAuthorityTransactionPort.reserve(), EffectAuthorityTransactionPort.attachApprovalGate(), …); AGE-4: 5 (ContentCustodyTransactionPort.commitReference(), ContentCustodyTransactionPort.addRetentionPin(), …); AGE-5: 8 (Age5TransactionPort.prepareApprovalGate(), Age5TransactionPort.commitApprovalDecision(), …) |
| `LiveMountInventoryDigestV1` | D2 | sha-256 digest scalar | `prism-d2-live-mount-inventory-v1` | this supplement §3.3 | AGE-4: 1 (TopologyCompletenessEvidenceV1.liveMountInventoryDigest) |
| `MountPolicyDigestV1` | D2 | sha-256 digest scalar | `prism-d2-mount-policy-v1` | this supplement §3.3 | AGE-4: 1 (PhysicalRootIdentityV1.mountPolicyDigest) |
| `OwnerCustodyDecisionDigest` | D2 | sha-256 digest scalar | `prism-d2-owner-custody-decision` | this supplement §3.3 | AGE-4: 4 (ContentRetentionPinReasonV1.ownerHoldDecisionDigest, ContentReadAuthorityV1.ownerCustodyDecisionDigest, …) |
| `OwnerDomainCatalogDigestV1` | D2 | sha-256 digest scalar | `prism-d2-owner-domain-catalog-v1` | this supplement §3.3 | AGE-4: 1 (TopologyCompletenessEvidenceV1.ownerDomainCatalogDigest) |
| `OwnershipLeaseIdentity` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AdmittedGoalRunV1.ownershipLeaseIdentity); AGE-2: 1 (CoordinatorGenerationRecordV1.ownershipLease); AGE-3: 5 (EffectReservationV1.ownershipLease, EffectPermitClaimV1.ownershipLease, …); AGE-4: 0 (import row only); AGE-5: 3 (AuthenticatedAge5CommandV1.ownershipLease, ApprovalGateV1.ownershipLease, …) |
| `PrincipalId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AuthenticatedGoalSubmissionV1.submitterPrincipalId); AGE-2: 3 (RunBehaviorContractV1.coordinatorPrincipalId, CoordinatorContentProducerBindingV1.coordinatorPrincipalId, …); AGE-3: 20 (GrantedOperationCommonV1.claimantPrincipalId, LocalCapabilityBindingV1.executorPrincipalId, …); AGE-4: 10 (ContentCustodyBindingV1.writerPrincipalId, ContentCustodyBindingV1.topologyAuthorityPrincipalId, …); AGE-5: 7 (AuthenticatedAge5CommandV1.principalId, ApprovalSubjectV1.claimantPrincipalId, …) |
| `ProductionEnvironmentId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AdmittedGoalRunV1.productionEnvironmentId); AGE-2: 0 (import row only); AGE-3: 1 (EffectReceiptV1.executionEnvironmentId) |
| `ProtectedRootPolicyDigestV1` | D2 | sha-256 digest scalar | `prism-d2-protected-root-policy-v1` | this supplement §3.3 | AGE-4: 1 (TopologyCompletenessEvidenceV1.protectedRootPolicyDigest) |
| `ProvisionedLocalCapabilityDigestV1` | D2 | sha-256 digest scalar | `prism-d2-provisioned-local-capability-v1` | this supplement §3.3 | AGE-3: 1 (LocalCapabilityBindingV1.provisionedCapabilityDigest) |
| `RoleId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AuthenticatedGoalSubmissionV1.submitterRoleId); AGE-2: 0 (import row only); AGE-3: 0 (import row only); AGE-4: 2 (ContentAccessPolicyEntryV1.principalRoleId, ContentReadReceiptV1.requesterRoleId); AGE-5: 6 (AuthenticatedAge5CommandV1.roleId, ApprovalClassPolicyV1.eligibleOperatorRoleIds, …) |
| `RootAccessPolicyDigestV1` | D2 | sha-256 digest scalar | `prism-d2-root-access-policy-v1` | this supplement §3.3 | AGE-4: 3 (StorageRootDescriptorV1.accessPolicyDigest, CustodyContinuityEvidenceV1.priorPrincipalPolicyDigest, …) |
| `RunId` | D2 | opaque identity scalar | — | this supplement §3.3 | AGE-1: 1 (AdmittedGoalRunV1.runId); AGE-2: 22 (CoordinatorContentProducerBindingV1.runId, ModelTurnIdentityV1.runId, …); AGE-3: 14 (ResolveOutwardDestinationRequestV1.runId, ResolvedOutwardDestinationV1.runId, …); AGE-4: 4 (PrepareContentRequestV1.runId, ContentDurabilityReceiptV1.runId, …); AGE-5: 19 (AuthenticatedAge5CommandV1.runId, ApprovalSubjectV1.runId, …) |
| `StorageInventoryPolicyDigestV1` | D2 | sha-256 digest scalar | `prism-d2-storage-inventory-policy-v1` | this supplement §3.3 | AGE-4: 1 (StorageRootCatalogV1.inventoryPolicyDigest) |
| `AdmissionAcknowledgementDigest` | D4 | sha-256 digest scalar | `prism-d4-admission-acknowledgement` | this supplement §3.4 | AGE-1: 0 (import row only) |
| `AdmissionCheckpointDigest` | D4 | sha-256 digest scalar | `prism-d4-admission-checkpoint` | this supplement §3.4 | AGE-1: 1 (AdmittedGoalRunV1.admissionCheckpointDigest); AGE-2: 5 (CoordinatorGenerationRecordV1.admissionCheckpointDigest, RunCoordinatorModeV1.admissionCheckpointDigest, …) |
| `D4RetentionReleaseAuthorityDigestV1` | D4 | sha-256 digest scalar | `prism-d4-retention-release-authority-v1` | this supplement §3.4 | AGE-4: 1 (RetentionPinReleaseAuthorityV1.d4ReleaseAuthorityDigest) |
| `EvidenceCheckpointDigest` | D4 | sha-256 digest scalar | `prism-d4-evidence-checkpoint` | this supplement §3.4 | AGE-4: 2 (ContentRetentionPinReasonV1.evidenceCheckpointDigest, ContentReferenceAttachmentV1.evidenceCheckpointDigest); AGE-5: 2 (RunTerminalResultV1.evidenceCheckpointDigest, SupplementalObservationV1.frozenEvidenceCheckpointDigest) |
| `ReferenceCommitTransactionId` | D4 | opaque identity scalar | — | this supplement §3.4 | AGE-2: 0 (import row only); AGE-3: 1 (CommitEffectReceiptCommandV1.referenceCommitTransactionId); AGE-4: 11 (ContentReferenceV1.referenceCommitTransactionId, ContentRetentionPinV1.transactionId, …); AGE-5: 3 (CommitVerificationAttemptCommandV1.referenceCommitTransactionId, CommitRunTerminalCommandV1.referenceCommitTransactionId, …) |
| `SettlementStateVersion` | D4 | monotonic state version | — | this supplement §3.4 | AGE-2: 8 (CoordinatorGenerationRecordV1.stateVersionAfterAcquisition, ProposalStateV1.stateVersion, …); AGE-3: 14 (EffectReservationRequestV1.expectedSettlementStateVersion, EffectReservationV1.stateVersionAfterCommit, …); AGE-4: 7 (ReleasedRetentionPinSetV1.settlementStateVersion, ReverseReferenceScanV1.settlementStateVersion, …); AGE-5: 18 (ApprovalGateV1.stateVersionAfterAttach, ApprovalGateStateV1.stateVersion, …) |
| `BoundedByteString` | D6 | length-prefixed bounded bytes | — | this supplement §3.5 | AGE-1: 2 (InstructionFragmentV1.bytes, InitialMessageV1.bytes); AGE-2: 5 (ParsedDirectiveCandidateV1.canonicalParameterCandidate, ParsedProposalV1.canonicalParameterCandidate, …); AGE-3: 1 (OpaqueDestinationIdentityV1.opaqueIdentityBytes); AGE-4: 1 (PrepareContentRequestV1.bytes); AGE-5: 8 (ApprovalSemanticValueV1.canonicalValue, ApprovalAdmittedSemanticValueV1.canonicalValue, …) |
| `CanonicalCodecBindingDigestV1` | D6 | sha-256 digest scalar | `prism-d6-canonical-codec-binding-v1` | this supplement §3.5 | AGE-1: 3 (TaskTemplateV1.canonicalCodecBindingDigest, GoalInputSchemaBindingV1.canonicalCodecBindingDigest, …); AGE-2: 1 (RunBehaviorContractV1.canonicalCodecBindingDigest); AGE-3: 0 (import row only); AGE-4: 1 (ContentCustodyBindingV1.canonicalCodecBindingDigest); AGE-5: 2 (ApprovalPolicyBindingV1.canonicalCodecBindingDigest, CompletionPolicyBindingV1.canonicalCodecBindingDigest) |
| `SchemaBundleDigestV1` | D6 | sha-256 digest scalar | `prism-d6-schema-bundle-v1` | this supplement §3.5 | AGE-1: 2 (TaskTemplateV1.requiredSchemaBundleDigest, GoalTaskImportSetV1.completeSchemaBundleDigest); AGE-2: 1 (RunBehaviorContractV1.schemaBundleDigest); AGE-3: 0 (import row only); AGE-4: 2 (ContentReaderContractV1.schemaBundleDigest, ContentCustodyBindingV1.schemaBundleDigest); AGE-5: 2 (ApprovalPolicyBindingV1.schemaBundleDigest, CompletionPolicyBindingV1.schemaBundleDigest) |
| `BoundedString` | shared | generic constructor | — | this supplement §3.1 | AGE-5: 5 (BoundedSemanticPathV1, BoundedImpactCodeV1, …) |
| `BrandedU64` | shared | generic constructor | — | this supplement §3.1 | AGE-5: 4 (ApprovalPolicyVersionV1, CompletionPolicyVersionV1, …) |
| `CanonicalSortedUniqueSetV1` | shared | generic constructor | — | this supplement §3.1 | AGE-2: 4 (RunBehaviorContractV1.coordinatorProducerProfiles, OperationProposalV1.inputContentReferences, …); AGE-3: 23 (RequestedTargetEnvelopeV1.permittedProviderRouteClassIds, RequestedTargetEnvelopeV1.permittedLocalCapabilityClassIds, …); AGE-4: 7 (TopologyCompletenessEvidenceV1.observedRootKeySet, ContentCustodyRequirementV1.allowedObjectKinds, …); AGE-5: 35 (ApprovalClassPolicyV1.eligibleOperatorRoleIds, ApprovalSubjectV1.sourceContentReferences, …) |
| `Digest` | shared | generic constructor | — | this supplement §3.1 | AGE-5: 23 (ApprovalPolicyBindingDigestV1, ApprovalSubjectDigestV1, …) |
| `DigestBytes` | shared | generic constructor | — | this supplement §3.1 | AGE-5: 5 (ApprovalGateRequestIdV1, ApprovalDecisionRequestIdV1, …) |
| `NonZeroBoundedU32` | shared | generic constructor | — | this supplement §3.1 | AGE-5: 6 (ApprovalSectionOrdinalV1, ApprovalValueOrdinalV1, …) |
| `NonZeroU64` | shared | non-zero u64 scalar | — | this supplement §3.1 | AGE-1: 5 (GoalValueLimitsV1.maxCanonicalBytes, GoalValueLimitsV1.maxNestingDepth, …); AGE-4: 14 (StorageRootCatalogV1.topologyVersion, RootRelationEvidenceV1.topologyVersion, …) |
| `AuthorizedTaskDisclosureRequest` | AGE-1 | port vocabulary (informal) | — | AGE-1 contract | AGE-1: 1 (TaskAuthority.discloseTask()) |
| `GoalSubmissionDecision` | AGE-1 | port vocabulary (informal) | — | AGE-1 contract | AGE-1: 2 (TaskAuthority.submitGoal(), TaskAuthority.resumeSubmission()) |
| `TaskDisclosure` | AGE-1 | port vocabulary (informal) | — | AGE-1 contract | AGE-1: 1 (TaskAuthority.discloseTask()) |
| `TemplateValidation` | AGE-1 | port vocabulary (informal) | — | AGE-1 contract | AGE-1: 1 (TaskAuthority.validateTemplate()) |
| `UntrustedTemplateBytes` | AGE-1 | port vocabulary (informal) | — | AGE-1 contract | AGE-1: 1 (TaskAuthority.validateTemplate()) |
| `AuthorizedIntegrityReconciliationRequest` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.reconcile()) |
| `ContentReconciliationReport` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.reconcile()) |
| `ContentRetentionDecision` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustodyTransactionPort.releaseRetentionPin()) |
| `InternalReferenceVerificationRequest` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.verifyReference()) |
| `PrepareContentDecision` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.prepare()) |
| `ReadContentDecision` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.readByValue()) |
| `ReferenceVerification` | AGE-4 | port vocabulary (informal) | — | AGE-4 contract | AGE-4: 1 (ContentCustody.verifyReference()) |

Row counts by family: D1 12, D2 25, D4 6, D6 3, shared 7, AGE-1 5, AGE-4 7;
65 rows total.

## 5. Attribution resolutions

The contracts' import tables carry three attribution conflicts and one family
of unlisted analogues. This mapping resolves each; the contract bytes are
unchanged, and this section is the package-level resolution record.

1. `PrincipalId` and `RoleId`: AGE-1 lists them under D1; AGE-2 through AGE-5
   list them under D2. Resolved to D2 — the accepted architecture assigns
   restricted principals and operator-channel authentication to D2 custody.
   AGE-1's D1 attribution is superseded by this mapping.
2. `AuthorizationPolicyDigest`: every contract lists it under D1; AGE-4 also
   lists it under D2. Resolved to D1 — the duplicate D2 listing in AGE-4 is
   recorded here as a resolved duplication, not a second owner.
3. `AuthenticatedChannelCommand`, `AuthenticatedCustodyCommand`, and
   `AuthenticatedSubmissionLookup` appear in no import table. Resolved to D2
   as members of the same post-authentication envelope family as the listed
   `AuthenticatedCoordinatorCommand` and `AuthenticatedEffectCommand`.
4. Twelve single-contract port vocabulary names (section 3.6) are resolved to
   their using contract; they are not external imports.

## 6. Non-authority boundary

This supplement:

- amends no AGE contract, architecture, baseline, registry, lock, generated
  constitution, or Plan A artifact byte;
- creates no law row, proof status, enforcement change, or release
  disposition;
- grants no runtime, service, provider, repository, publication, or
  implementation authority; and
- becomes package-ratifiable material only through the same external
  ratification gate and owner receipt protocol as the successor baseline.

Every candidate root defined here joins the exact A3 package. A missing,
duplicate, substituted, or unresolved import blocks reconciliation; the
refreshed package verifier enforces that closure mechanically.
