# Prism Harness AGE-4 Content Custody contract specification

Date: 2026-08-27

Status: **contract draft**. This document is authorized for drafting by the
accepted autonomous goal-execution architecture. It grants no implementation,
schema-migration, invariant-activation, installation, provider-call,
publication, retention-purge, or public-claim authority.

Decision area: AGE-4 Content Custody.

Accepted parent architecture digest:
`5fc1443f9d8e740d4811a02d9e3a5dd637a12184`.

## 1. Purpose

AGE-4 defines how autonomous runs publish, reference, read, retain, reconcile,
and eventually delete immutable runtime content without turning a content
handle into execution or destination authority.

It answers six questions:

- Which runtime byte kinds may enter custody?
- How are bytes proven durable before D4 can refer to them?
- How does one root catalog prevent cross-kind and cross-owner aliasing?
- Which principals may read which objects, and for what purpose?
- How do crashes leave only safe orphans instead of broken authority?
- How can retained content expire without rewriting settlement history?

## 2. Source of truth and precedence

When sources disagree, use this order:

1. Runtime, developer, user, and owner authority.
2. The ratified invariant registry and lock.
3. The ratified D1 through D7 architecture and binding amendments.
4. The accepted autonomous goal-execution architecture at the digest above.
5. Its owner acceptance record.
6. This contract after package ratification.
7. Future AGE-2, AGE-3, and AGE-5 contracts for the identities they own.
8. Current implementation and historical drafts.

The frozen D8 store schemas are non-normative. AGE-4 uses one custody system
and one topology catalog rather than separate loop and artifact stores.

## 3. Scope

AGE-4 owns:

- the closed runtime-content object-kind union;
- byte and object identity;
- prepared durable candidates and publication durability receipts;
- D4-committed owner- and run-scoped content references;
- one content-custody binding per owner domain in the first production profile;
- one host-wide topology catalog covering every relevant storage root kind;
- by-value read authorization and read verification receipts;
- retention pins, release, purge eligibility, deletion records, and tombstones;
- startup reconciliation and content-integrity closure behavior;
- in-memory and durable adapter conformance; and
- AGE-4 canonical schemas and digest domains.

## 4. Non-goals and ownership exclusions

AGE-4 does not own:

- task-template, goal, instruction, or admission identity;
- turn, proposal, action, operation, or verification-attempt identity;
- effect reservation, permit, deadline, receipt truth, budget, or recovery;
- approval-view semantics, operator decisions, completion, terminal outcome, or
  evidence-chain meaning;
- filesystem capabilities used by a task executor;
- artifact application, work-program selection, adaptation promotion,
  installation, publication, or release;
- provider credentials, routes, or broker sessions; or
- a general filesystem, path, object-listing, or arbitrary query API.

D4 remains the only authority writer that may attach an AGE-4 reference to a
run, effect receipt, checkpoint, decision, verification attempt, or terminal
record. AGE-4 owns the reference schema and custody rules, not settlement
meaning.

## 5. Contract vocabulary

| Term | Meaning |
|---|---|
| Content custody | The daemon-hosted module that publishes immutable runtime bytes and returns bounded by-value reads |
| Custody instance | One owner-domain-scoped logical store under an exact adapter, principal, topology, schema, and access binding |
| Content object | Immutable bytes plus one closed semantic kind and schema identity |
| Prepared candidate | Durably installed and verified bytes held under a provisional publication lease but not yet attached to D4 authority |
| Content reference | An opaque owner- and run-scoped identity committed by the D4 transaction writer after candidate verification |
| Topology catalog | One versioned host-wide catalog of custody, task, protected, credential, consumer-writer, synchronized, and replicated roots |
| Root relation | A measured physical relationship between two catalog roots, independent of pathname spelling |
| Retention pin | D4-committed reason that prevents deletion of a referenced object |
| Tombstone | Immutable proof that an eligible object was intentionally deleted after all authority and retention preconditions closed |

## 6. Imported and exported contracts

### 6.1 Imports

AGE-4 imports these types without redefining their internals:

| Owner | Imported type | AGE-4 use |
|---|---|---|
| D1 | `OwnerDomainId`, `ExecutionBindingDigest`, `DependencyClosureDigest`, `SchemaDigestV1`, `AuthorizationPolicyDigest` | Owner partition, schema identity, and exact executable identity |
| D2 | `RunId`, `DaemonEpoch`, `OwnershipLeaseIdentity`, `PrincipalId`, `RoleId`, `HostAuthorityDomainId`, `OwnerCustodyDecisionDigest`, `AuthorizationPolicyDigest`, `EpochMonotonicDeadlineV1`, `MountPolicyDigestV1`, `RootAccessPolicyDigestV1`, `StorageInventoryPolicyDigestV1`, `OwnerDomainCatalogDigestV1`, `ConfiguredStorageRootRegistryDigestV1`, `LiveMountInventoryDigestV1`, `ProtectedRootPolicyDigestV1`, `HostTransactionContext` | Fencing, principal authentication, host policy and inventory, owner custody decisions, and one-writer transaction |
| D4 | `SettlementStateVersion`, `EvidenceCheckpointDigest`, `ReferenceCommitTransactionId`, `D4RetentionReleaseAuthorityDigestV1` | Atomic reference, retention attachment, and pin-release authority |
| AGE-2 | `RunCheckpointDigestV1`, `ConversationStateDigestV1`, `CoordinatorContentProducerBindingDigestV1` | Replay-content use binding and coordinator producer lineage |
| AGE-3 | `ContentProducerBindingDigestV1`, `EffectReservationDigestV1`, `EffectReceiptDigestV1` | Producer and receipt lineage |
| AGE-5 | `ApprovalSubjectDigestV1`, `VerificationAttemptDigestV1`, `VerificationParameterProducerBindingDigestV1`, `SupplementalObservationDigestV1` | Operator-view, verification-content lineage, and supplemental evidence custody |
| D6 contract package | `CanonicalCodecBindingDigestV1`, `SchemaBundleDigestV1` | Exact encoding and generated closed schemas |

An unresolved imported digest blocks package ratification, not parallel contract
drafting.

### 6.2 Exports

AGE-4 exports:

- `StorageRootCatalogV1` and `StorageRootCatalogDigestV1`;
- `ContentCustodyRequirementV1` and
  `ContentCustodyRequirementDigestV1`;
- `ContentCustodyAllowanceV1` and `ContentCustodyAllowanceDigestV1`;
- `ContentCustodyBindingV1` and `ContentCustodyBindingDigestV1`;
- `ContentCustodyContinuityV1` and `ContentCustodyContinuityDigestV1`;
- `ContentReaderContractV1` and `ContentReaderContractDigestV1`;
- `ContentRetentionPolicyV1` and `ContentRetentionPolicyDigestV1`;
- `ContentAccessPolicyV1` and `ContentAccessPolicyDigestV1`;
- `RuntimeContentProducerBindingV1` and
  `RuntimeContentProducerBindingDigestV1`;
- `ContentPublicationRequestIdV1`;
- `ContentByteDigestV1`;
- `ContentObjectDescriptorV1`, `ContentObjectDescriptorDigestV1`, and
  `ContentObjectDigestV1`;
- `PreparedContentCandidateV1` and its digest;
- `ContentDurabilityReceiptV1` and its digest;
- `ContentReferenceV1` and `ContentReferenceDigestV1`;
- `ContentReadReceiptV1` and its digest;
- `ContentRetentionPinV1` and its digest;
- `ContentDeletionAuthorizationV1` and its digest;
- `ContentDeletionObservationV1` and its digest;
- `ContentDeletionRecordV1` and its digest; and
- the `ContentCustody` interface and adapter conformance suite.

These export names satisfy the exact AGE-1 through AGE-5 package imports.

## 7. Trust and principal model

### 7.1 Production principals

The first production profile uses distinct authenticated principals:

| Principal role | Allowed operation | Forbidden authority |
|---|---|---|
| Custody writer | Prepare immutable content under one owner binding | D4 settlement, general reads, deletion, destination writes |
| Host topology authority | Measure and commit root catalogs, custody bindings, and continuity records | Publishing content, D4 settlement, ordinary reads, deletion |
| D4 transaction writer | Commit references, pins, release records, deletion authorizations, and tombstones inside the host transaction | Supplying, changing, or deleting content bytes |
| Custody reclaimer | Delete one exact object after a D4 deletion authorization and flush the resulting metadata change | Selecting objects, releasing pins, creating authorization, general reads |
| Run replay reader | Read exact references for the same admitted run by value | Other runs, artifacts for export, paths, writes |
| Effect-input reader | Read exact action parameters for one bound executor request | Listing, other objects, writes, approval decisions |
| Operator-view reader | Read exact approval-subject content by value | General owner content, writes, decisions |
| Verification-input reader | Read exact verifier subject content by value | Mutation, repair, export, writes |
| Artifact-export reader | Export one exact artifact after separate owner authorization | Other kinds, destination application, promotion |
| Integrity reader | Reopen and verify objects during publication and reconciliation | Returning bytes to ordinary callers |

The custody service never runs as the admitting user, a provider broker, a task
executor, or a publication principal. Task code receives no custody root,
mount, path, database handle, or listing capability.

### 7.2 Owner partition

Every command derives `ownerDomainId`, principal, and role from the authenticated
local channel. Caller bytes cannot select them. A reference for one owner is
unresolvable under another owner even when both owners publish identical bytes.

Cross-owner physical deduplication is forbidden in the first production
profile.

## 8. Canonical data and digest law

### 8.1 Closed values

Every AGE-4 record is a generated closed schema. Unknown fields, duplicate
keys, alternate union tags, invalid primitive forms, and trailing bytes reject
before hashing, publication, reference commitment, or read.

All sizes, ordinals, versions, and counts are exact bounded unsigned integers.
Floating-point values are forbidden in authority-bearing AGE-4 records.

### 8.2 Collections

Catalogs declare one semantic key, sort by canonical key bytes, and reject
duplicate key bytes before map construction. Ordered evidence sequences
preserve order and reject duplicate sequence numbers. Semantic sets sort by
complete canonical element bytes and reject duplicates.

### 8.3 Digest construction

Metadata digests use:

```text
UTF8(domain) || 0x00 || canonical(root-record)
```

`ContentByteDigestV1` is SHA-256 over the exact content bytes with no text or
media normalization. Metadata uses the contract-package canonical codec.

| Digest | Domain |
|---|---|
| `PhysicalRootIdentityDigestV1` | `prism-age4-physical-root-identity-v1` |
| `StorageRootCatalogDigestV1` | `prism-age4-storage-root-catalog-v1` |
| `ContentCustodyRequirementDigestV1` | `prism-age4-custody-requirement-v1` |
| `ContentCustodyAllowanceDigestV1` | `prism-age4-custody-allowance-v1` |
| `ContentCustodyBindingDigestV1` | `prism-age4-custody-binding-v1` |
| `ContentCustodyContinuityDigestV1` | `prism-age4-custody-continuity-v1` |
| `ContentReaderContractDigestV1` | `prism-age4-reader-contract-v1` |
| `TopologyCompletenessEvidenceDigestV1` | `prism-age4-topology-completeness-v1` |
| `RootRelationEvidenceDigestV1` | `prism-age4-root-relation-evidence-v1` |
| `CustodyContinuityEvidenceDigestV1` | `prism-age4-custody-continuity-evidence-v1` |
| `ContentRetentionPolicyDigestV1` | `prism-age4-retention-policy-v1` |
| `ContentAccessPolicyDigestV1` | `prism-age4-access-policy-v1` |
| `RuntimeContentProducerBindingDigestV1` | `prism-age4-runtime-content-producer-binding-v1` |
| `ContentObjectDescriptorDigestV1` | `prism-age4-object-descriptor-v1` |
| `ContentObjectDigestV1` | `prism-age4-content-object-v1` |
| `ContentDurabilityReceiptDigestV1` | `prism-age4-durability-receipt-v1` |
| `PreparedContentCandidateDigestV1` | `prism-age4-prepared-candidate-v1` |
| `ContentReferenceDigestV1` | `prism-age4-content-reference-v1` |
| `ContentReadReceiptDigestV1` | `prism-age4-read-receipt-v1` |
| `ContentReadRequestDigestV1` | `prism-age4-read-request-v1` |
| `ContentRetentionPinDigestV1` | `prism-age4-retention-pin-v1` |
| `ReleasedRetentionPinSetDigestV1` | `prism-age4-released-pin-set-v1` |
| `ReverseReferenceScanDigestV1` | `prism-age4-reverse-reference-scan-v1` |
| `ContentDeletionAuthorizationDigestV1` | `prism-age4-deletion-authorization-v1` |
| `ContentDeletionObservationDigestV1` | `prism-age4-deletion-observation-v1` |
| `ContentDeletionRecordDigestV1` | `prism-age4-deletion-record-v1` |

Every digest field must resolve to a named root in the complete schema bundle.

### 8.4 Local scalar contracts

| Type | Canonical constraint |
|---|---|
| `ContentCustodyInstanceIdV1` | Exactly 16 daemon-generated random bytes, encoded as 32 lowercase hexadecimal characters |
| `StorageRootKeyV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `ContentPublicationRequestIdV1` | Exactly 16 trusted-producer random bytes, encoded as 32 lowercase hexadecimal characters |
| `ContentPublicationLeaseIdV1` | Exactly 16 daemon-generated random bytes, encoded as 32 lowercase hexadecimal characters |
| `ContentMetadataTransactionIdV1` | Exactly 16 daemon-generated random bytes, encoded as 32 lowercase hexadecimal characters |
| `ContentReconciliationIdV1` | Exactly 16 integrity-module random bytes, encoded as 32 lowercase hexadecimal characters |
| `ContentDeletionOperationIdV1` | Exactly 16 daemon-generated random bytes, encoded as 32 lowercase hexadecimal characters |
| `FilesystemTypeV1` | Initial closed value `apfs` |
| `FilesystemInstanceIdV1` | Opaque 1 to 255-byte operating-system filesystem identity |
| `VolumeIdentityV1` | Opaque 1 to 255-byte operating-system volume identity |
| `MountIdentityV1` | Opaque 1 to 255-byte operating-system mount identity |
| `FileObjectIdV1` | Opaque 1 to 255-byte operating-system file-object identity |
| `BoundedMediaTypeV1` | Lowercase ASCII media type, 1 to 127 bytes, with no parameters outside the closed descriptor arm |
| `ContentByteDigestV1` | Exactly 32 SHA-256 bytes |

`CanonicalSortedUniqueSetV1<T>` is an opaque generated-schema brand. Raw
arrays do not satisfy it. Every AGE-4 metadata digest alias is an opaque digest
byte string produced only by its named domain and root schema.

## 9. Unified storage-root topology

### 9.1 Root classes and scope

```ts
type StorageRootClassV1 =
  | "content-custody"
  | "task-capability"
  | "protected"
  | "credential"
  | "consumer-writer"
  | "synchronized"
  | "replicated";

type StorageRootScopeV1 =
  | { kind: "owner-domain"; ownerDomainId: OwnerDomainId }
  | { kind: "host-global"; hostAuthorityDomainId: HostAuthorityDomainId };
```

The catalog includes every configured root in these classes across every owner
domain. An unclassifiable root blocks topology closure.

### 9.2 Physical identity

The first production adapter defines:

```ts
interface PhysicalRootIdentityV1 {
  schema: "prism-age4-physical-root-identity-v1";
  platformProfile: "macos-local-volume-v1";
  filesystemType: FilesystemTypeV1;
  filesystemInstanceId: FilesystemInstanceIdV1;
  volumeIdentity: VolumeIdentityV1;
  mountIdentity: MountIdentityV1;
  rootFileObjectId: FileObjectIdV1;
  backingKind: "local-block" | "network" | "fuse" | "unknown";
  mountPolicyDigest: MountPolicyDigestV1;
  measurementExecutableBindingDigest: ExecutionBindingDigest;
  measurementDependencyClosureDigest: DependencyClosureDigest;
}
```

Path strings, aliases, labels, and mount names are diagnostic only and do not
participate as physical identity.

### 9.3 Root descriptor

```ts
interface StorageRootDescriptorV1 {
  schema: "prism-age4-storage-root-descriptor-v1";
  rootKey: StorageRootKeyV1;
  rootClass: StorageRootClassV1;
  scope: StorageRootScopeV1;
  physicalIdentity: PhysicalRootIdentityV1;
  accessPolicyDigest: RootAccessPolicyDigestV1;
}
```

`rootKey` is the semantic key. The catalog rejects duplicate root keys and any
two descriptors that claim the same physical root under different keys.

### 9.4 Relation matrix

Every unordered root pair has one measured relation:

```ts
type RootRelationV1 =
  | "same-root"
  | "same-filesystem"
  | "contains"
  | "contained-by"
  | "disjoint-filesystem"
  | "unknown";
```

Pair keys sort the two root keys by canonical bytes. Missing, duplicate,
directionally inconsistent, or unknown relations fail catalog validation.

### 9.5 Catalog root

```ts
interface StorageRootCatalogV1 {
  schema: "prism-age4-storage-root-catalog-v1";
  hostAuthorityDomainId: HostAuthorityDomainId;
  topologyVersion: NonZeroU64;
  daemonEpoch: DaemonEpoch;
  inventoryPolicyDigest: StorageInventoryPolicyDigestV1;
  probeExecutableBindingDigest: ExecutionBindingDigest;
  probeDependencyClosureDigest: DependencyClosureDigest;
  completenessEvidenceDigest: TopologyCompletenessEvidenceDigestV1;
  roots: readonly StorageRootDescriptorV1[];
  relations: readonly StorageRootRelationRecordV1[];
}
```

The completeness evidence binds the owner-domain ACL catalog, configured root
registry, live volume and mount inventory, and protected-root policy. A partial
scan cannot produce a valid catalog.

### 9.6 Content-root admission rule

One `content-custody` root is admitted per owner domain in the first production
profile. It must:

- use `backingKind: "local-block"`;
- own a unique filesystem instance and volume identity;
- be `disjoint-filesystem` from every task, protected, credential,
  consumer-writer, synchronized, replicated, and other-owner custody root;
- use no network, FUSE, bind, overlay, synchronization, or replication path;
- deny task, consumer-writer, provider-broker, and ordinary owner principals;
  and
- match the exact physical identity in the custody binding.

The underlying block device may host several independently identified local
volumes. The filesystem and volume identity, not the physical disk device, is
the isolation boundary.

### 9.7 Topology change

Adding, removing, remounting, relabeling, or changing the physical identity or
access policy of any root increments `topologyVersion` and invalidates every
affected custody binding. Admission and new writes remain closed until a new
complete catalog and binding are committed.

A stale catalog may be used only to explain why authority is closed.

`StorageRootRelationRecordV1` has this exact shape:

```ts
interface StorageRootRelationRecordV1 {
  schema: "prism-age4-storage-root-relation-v1";
  lowerRootKey: StorageRootKeyV1;
  upperRootKey: StorageRootKeyV1;
  relation: RootRelationV1;
  measurementEvidenceDigest: RootRelationEvidenceDigestV1;
}
```

`lowerRootKey` must be canonically less than `upperRootKey`. Self-pairs,
reversed pairs, missing pairs, and duplicate pairs reject.

### 9.8 Topology evidence roots

```ts
interface TopologyCompletenessEvidenceV1 {
  schema: "prism-age4-topology-completeness-v1";
  hostAuthorityDomainId: HostAuthorityDomainId;
  daemonEpoch: DaemonEpoch;
  ownerDomainCatalogDigest: OwnerDomainCatalogDigestV1;
  configuredRootRegistryDigest: ConfiguredStorageRootRegistryDigestV1;
  liveMountInventoryDigest: LiveMountInventoryDigestV1;
  protectedRootPolicyDigest: ProtectedRootPolicyDigestV1;
  observedRootKeySet: CanonicalSortedUniqueSetV1<StorageRootKeyV1>;
  probeExecutableBindingDigest: ExecutionBindingDigest;
  probeDependencyClosureDigest: DependencyClosureDigest;
}

interface RootRelationEvidenceV1 {
  schema: "prism-age4-root-relation-evidence-v1";
  daemonEpoch: DaemonEpoch;
  topologyVersion: NonZeroU64;
  lowerRootKey: StorageRootKeyV1;
  lowerPhysicalIdentityDigest: PhysicalRootIdentityDigestV1;
  upperRootKey: StorageRootKeyV1;
  upperPhysicalIdentityDigest: PhysicalRootIdentityDigestV1;
  measuredRelation: RootRelationV1;
  probeExecutableBindingDigest: ExecutionBindingDigest;
  probeDependencyClosureDigest: DependencyClosureDigest;
}

interface CustodyContinuityEvidenceV1 {
  schema: "prism-age4-custody-continuity-evidence-v1";
  ownerDomainId: OwnerDomainId;
  custodyInstanceId: ContentCustodyInstanceIdV1;
  priorPhysicalRootIdentityDigest: PhysicalRootIdentityDigestV1;
  currentPhysicalRootIdentityDigest: PhysicalRootIdentityDigestV1;
  priorReaderContractDigest: ContentReaderContractDigestV1;
  currentReaderContractDigest: ContentReaderContractDigestV1;
  priorPrincipalPolicyDigest: RootAccessPolicyDigestV1;
  currentPrincipalPolicyDigest: RootAccessPolicyDigestV1;
  verificationExecutableBindingDigest: ExecutionBindingDigest;
  verificationDependencyClosureDigest: DependencyClosureDigest;
}
```

Completeness requires the observed root-key set to equal the canonical root set
derived from all four imported inventories. Relation evidence must match the
pair and relation record exactly. Continuity evidence is valid only when both
physical identity digests, both reader contracts, and both principal policies
are equal.

## 10. Content-custody binding

### 10.1 Template requirement

AGE-1 task templates bind this AGE-4-owned request envelope:

```ts
interface ContentCustodyRequirementV1 {
  schema: "prism-age4-custody-requirement-v1";
  allowedObjectKinds: CanonicalSortedUniqueSetV1<ContentObjectKindTagV1>;
  maxObjectBytes: NonZeroU64;
  maxRunRetainedBytes: NonZeroU64;
  retentionPolicyDigest: ContentRetentionPolicyDigestV1;
  accessPolicyDigest: ContentAccessPolicyDigestV1;
}
```

The requirement grants nothing. D1 proves that the admitted custody binding,
run allowance, allowed object kinds, retention policy, and access policy are
equal to or narrower than this exact envelope.

The admitted task binds the exact narrower value:

```ts
interface ContentCustodyAllowanceV1 {
  schema: "prism-age4-custody-allowance-v1";
  allowedObjectKinds: CanonicalSortedUniqueSetV1<ContentObjectKindTagV1>;
  maxObjectBytes: NonZeroU64;
  maxRunRetainedBytes: NonZeroU64;
  retentionPolicyDigest: ContentRetentionPolicyDigestV1;
  accessPolicyDigest: ContentAccessPolicyDigestV1;
}
```

Allowed kinds must be a set subset. Numeric limits must be less than or equal
to the requirement. Policy digests must match exactly. No runtime caller can
raise an allowance.

### 10.2 Admitted binding

```ts
interface ContentReaderContractV1 {
  schema: "prism-age4-reader-contract-v1";
  protocol: "prism-age4-read-by-value-v1";
  adapterExecutableBindingDigest: ExecutionBindingDigest;
  adapterDependencyClosureDigest: DependencyClosureDigest;
  accessPolicyDigest: ContentAccessPolicyDigestV1;
  schemaBundleDigest: SchemaBundleDigestV1;
}
```

```ts
interface ContentCustodyBindingV1 {
  schema: "prism-age4-custody-binding-v1";
  ownerDomainId: OwnerDomainId;
  custodyInstanceId: ContentCustodyInstanceIdV1;
  rootKey: StorageRootKeyV1;
  physicalRootIdentityDigest: PhysicalRootIdentityDigestV1;
  storageRootCatalogDigest: StorageRootCatalogDigestV1;
  adapterExecutableBindingDigest: ExecutionBindingDigest;
  adapterDependencyClosureDigest: DependencyClosureDigest;
  readerContractDigest: ContentReaderContractDigestV1;
  writerPrincipalId: PrincipalId;
  topologyAuthorityPrincipalId: PrincipalId;
  integrityReaderPrincipalId: PrincipalId;
  reclaimerPrincipalId: PrincipalId;
  d4TransactionWriterPrincipalId: PrincipalId;
  accessPolicyDigest: ContentAccessPolicyDigestV1;
  retentionPolicyDigest: ContentRetentionPolicyDigestV1;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  schemaBundleDigest: SchemaBundleDigestV1;
  maxObjectBytes: NonZeroU64;
  maxOwnerRetainedBytes: NonZeroU64;
}
```

Every field participates in `ContentCustodyBindingDigestV1`. D1 binds that
digest into AGE-1 task identity. No caller supplies a custody instance, root,
adapter, principal, limit, or policy during goal submission or runtime.

Startup recomputes the binding from measured host state. Drift closes
admission, publication, reference commitment, and ordinary reads. Integrity
reconciliation reads remain available under the integrity principal.

### 10.3 Binding continuity

An unrelated topology update changes the catalog and custody-binding digests.
It does not rewrite existing references. Ordinary reads resume only after the
host topology authority commits:

```ts
interface ContentCustodyContinuityV1 {
  schema: "prism-age4-custody-continuity-v1";
  ownerDomainId: OwnerDomainId;
  custodyInstanceId: ContentCustodyInstanceIdV1;
  priorBindingDigest: ContentCustodyBindingDigestV1;
  currentBindingDigest: ContentCustodyBindingDigestV1;
  priorTopologyDigest: StorageRootCatalogDigestV1;
  currentTopologyDigest: StorageRootCatalogDigestV1;
  unchangedPhysicalRootIdentityDigest: PhysicalRootIdentityDigestV1;
  continuityEvidenceDigest: CustodyContinuityEvidenceDigestV1;
  transactionId: ContentMetadataTransactionIdV1;
}
```

Continuity requires the same owner, custody instance, physical root, reader
protocol, object schema, and principal policy. It cannot bridge a root move,
owner change, physical identity change, adapter semantics change, or unknown
relation. References chain through zero or more exact continuity records to the
current valid binding. The chain is canonical, acyclic, and complete.

Moving content to a new physical root is a future migration contract and is
not supported by version 1.

## 11. Runtime-content object model

### 11.1 Closed object kinds

```ts
type ContentObjectKindTagV1 =
  | "model-observation"
  | "tool-observation"
  | "verification-observation"
  | "action-parameters"
  | "model-feedback"
  | "artifact-immutable"
  | "artifact-typed-patch";

type ContentObjectDescriptorV1 =
  | {
      kind: "model-observation";
      contentSchemaDigest: SchemaDigestV1;
      mediaType: BoundedMediaTypeV1;
    }
  | {
      kind: "tool-observation";
      contentSchemaDigest: SchemaDigestV1;
      mediaType: BoundedMediaTypeV1;
    }
  | {
      kind: "verification-observation";
      contentSchemaDigest: SchemaDigestV1;
      mediaType: BoundedMediaTypeV1;
    }
  | {
      kind: "action-parameters";
      parameterSchemaDigest: SchemaDigestV1;
      mediaType: "application/prism-canonical-value";
    }
  | {
      kind: "model-feedback";
      feedbackSchemaDigest: SchemaDigestV1;
      mediaType: "application/prism-canonical-value";
    }
  | {
      kind: "artifact-immutable";
      artifactSchemaDigest: SchemaDigestV1;
      mediaType: BoundedMediaTypeV1;
    }
  | {
      kind: "artifact-typed-patch";
      patchSchemaDigest: SchemaDigestV1;
      mediaType: "application/prism-canonical-value";
    };
```

The tagged union makes invalid artifact-kind and patch-schema combinations
unrepresentable. Unknown kinds reject before any write.

### 11.2 Object identity

```ts
interface ContentObjectIdentityV1 {
  schema: "prism-age4-content-object-v1";
  ownerDomainId: OwnerDomainId;
  custodyInstanceId: ContentCustodyInstanceIdV1;
  descriptorDigest: ContentObjectDescriptorDigestV1;
  contentByteDigest: ContentByteDigestV1;
  byteLength: NonZeroU64;
}
```

`ContentObjectDigestV1` hashes this root. The owner domain participates in
object identity even when another owner stores identical bytes.

Zero-byte content is not an object. An operation with no content must use the
AGE-3 descriptor-authorized `no-content` receipt arm rather than publishing an
empty object.

## 12. Publication request and idempotency

### 12.1 Closed runtime producer lineage

```ts
type RuntimeContentProducerSourceV1 =
  | {
      kind: "effect-result";
      effectResultProducerBindingDigest: ContentProducerBindingDigestV1;
    }
  | {
      kind: "run-coordinator";
      coordinatorProducerBindingDigest: CoordinatorContentProducerBindingDigestV1;
    }
  | {
      kind: "completion-verification";
      verificationParameterProducerBindingDigest: VerificationParameterProducerBindingDigestV1;
    };

interface RuntimeContentProducerBindingV1 {
  schema: "prism-age4-runtime-content-producer-binding-v1";
  ownerDomainId: OwnerDomainId;
  source: RuntimeContentProducerSourceV1;
}
```

`RuntimeContentProducerBindingDigestV1` hashes the complete root. AGE-4 owns
this closed union. It has no generic, caller-defined, or extension arm. D4
constructs the root by value from one exact imported producer binding and
requires the outer owner domain to match the imported binding's owner domain.

The `effect-result` arm carries AGE-3 result-content lineage. The
`run-coordinator` arm carries AGE-2 model-dispatch, parsed-action, or feedback
lineage. The `completion-verification` arm carries AGE-5 verification-parameter
lineage. Each imported digest must resolve in its owning contract catalog and
must match the run, custody, descriptor, schema, principal, executable, and
maximum-byte constraints required by that arm. A producer kind cannot
substitute for the exact imported binding.

### 12.2 Request

```ts
interface PrepareContentRequestV1 {
  schema: "prism-age4-prepare-content-request-v1";
  publicationRequestId: ContentPublicationRequestIdV1;
  runId: RunId;
  custodyBindingDigest: ContentCustodyBindingDigestV1;
  custodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  producerBindingDigest: RuntimeContentProducerBindingDigestV1;
  descriptor: ContentObjectDescriptorV1;
  expectedByteLength: NonZeroU64;
  expectedContentByteDigest: ContentByteDigestV1;
  bytes: BoundedByteString;
}
```

The authenticated channel supplies owner domain, writer principal, daemon
epoch, and current ownership lease. Caller bytes cannot replace those fields.

The semantic uniqueness key is
`(ownerDomainId, custodyInstanceId, publicationRequestId)`. Identical replay
returns the same prepared candidate. The same key with a different descriptor,
producer, length, digest, or bytes conflicts before installation.

### 12.3 Bounds

The writer rejects before staging when bytes differ from the declared length or
digest, exceed the custody or task limit, would exceed the owner's reserved
retained-byte allowance, use an unknown schema, or do not match the descriptor's
canonical-value requirement.

The producer never selects a backing path or object filename.

## 13. Durable publication protocol

The durable adapter performs this exact order:

1. Authenticate writer, owner domain, custody binding, epoch, lease, producer,
   and publication request.
2. Revalidate the current topology and custody-binding digests.
3. Create a writer-owned staging object inside the admitted custody root.
4. Write all bytes and flush file data and metadata.
5. Verify staged length and byte digest.
6. Atomically install by digest with no replacement.
7. If an object already exists at that identity, reopen it and require exact
   descriptor, length, and byte digest parity.
8. Flush the containing directory and any durable object index.
9. Reopen through the production integrity reader and verify the complete
   object identity.
10. Commit the prepared-candidate metadata and durability receipt under one
    daemon writer transaction.
11. Return the prepared candidate only after that transaction acknowledges.

The durability receipt records the binding, topology, writer principal,
publication request, object identity, install outcome (`created` or
`existing-identical`), flush protocol version, reader verification, daemon
epoch, and metadata transaction identity. It contains no raw bytes or paths.

```ts
interface ContentDurabilityReceiptV1 {
  schema: "prism-age4-durability-receipt-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  publicationRequestId: ContentPublicationRequestIdV1;
  custodyBindingDigest: ContentCustodyBindingDigestV1;
  custodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  topologyDigest: StorageRootCatalogDigestV1;
  writerPrincipalId: PrincipalId;
  producerBindingDigest: RuntimeContentProducerBindingDigestV1;
  objectDigest: ContentObjectDigestV1;
  installOutcome: "created" | "existing-identical";
  flushProtocol: "prism-age4-durable-publish-v1";
  integrityReaderPrincipalId: PrincipalId;
  readbackObjectDigest: ContentObjectDigestV1;
  daemonEpoch: DaemonEpoch;
  metadataTransactionId: ContentMetadataTransactionIdV1;
}
```

A hash collision, same-identity byte mismatch, impossible existing-object
shape, or post-install readback mismatch closes all custody writes and
production admission as an integrity incident.

## 14. Prepared candidate

```ts
interface PreparedContentCandidateV1 {
  schema: "prism-age4-prepared-candidate-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  publicationRequestId: ContentPublicationRequestIdV1;
  custodyBindingDigest: ContentCustodyBindingDigestV1;
  custodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  producerBindingDigest: RuntimeContentProducerBindingDigestV1;
  objectDigest: ContentObjectDigestV1;
  durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
  publicationLease: ContentPublicationLeaseV1;
}
```

```ts
interface ContentPublicationLeaseV1 {
  schema: "prism-age4-publication-lease-v1";
  publicationLeaseId: ContentPublicationLeaseIdV1;
  daemonEpoch: DaemonEpoch;
  publicationRequestId: ContentPublicationRequestIdV1;
  objectDigest: ContentObjectDigestV1;
  durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
  monotonicDeadline: EpochMonotonicDeadlineV1;
}
```

The candidate does not participate in its own lease preimage. The lease binds
the request, object, and durability receipt instead, avoiding a digest cycle.

The publication lease is valid only in its daemon epoch and only for the exact
candidate. It prevents orphan collection while D4 decides whether to commit a
reference. It grants no read, execution, receipt, checkpoint, or terminal
authority.

An epoch change expires the publication lease. The durable candidate remains
reconcilable and may receive a new lease after full readback and D4
reverse-reference lookup. Reverification never changes object identity.

## 15. D4 reference commitment

### 15.1 Atomic boundary

The prepared candidate is durable but non-authoritative. Only the D4
transaction writer can create a `ContentReferenceV1`.

Inside the same host transaction that attaches content to a receipt,
checkpoint, decision source, verification attempt, artifact emission, or
terminal record, D4 must:

1. authenticate the current owner, epoch, lease, and state version;
2. verify the candidate and durability receipt through the AGE-4 internal port;
3. confirm the object, topology, custody, descriptor, producer, and task
   bindings match the importing authority record;
4. insert or replay the run-scoped reference;
5. add the required retention pin;
6. attach the reference digest to the importing D4 record; and
7. commit all D4 and AGE-4 metadata or none.

The object bytes are already durable, so a failed transaction leaves an
unreferenced candidate, never authority pointing to absent bytes.

### 15.2 Reference schema

```ts
interface ContentReferenceV1 {
  schema: "prism-age4-content-reference-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  custodyBindingDigest: ContentCustodyBindingDigestV1;
  custodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  producerBindingDigest: RuntimeContentProducerBindingDigestV1;
  objectDigest: ContentObjectDigestV1;
  descriptorDigest: ContentObjectDescriptorDigestV1;
  contentByteDigest: ContentByteDigestV1;
  byteLength: NonZeroU64;
  durabilityReceiptDigest: ContentDurabilityReceiptDigestV1;
  committedTopologyDigest: StorageRootCatalogDigestV1;
  retentionPolicyDigest: ContentRetentionPolicyDigestV1;
  accessPolicyDigest: ContentAccessPolicyDigestV1;
  referenceCommitTransactionId: ReferenceCommitTransactionId;
}
```

The semantic uniqueness key is `(ownerDomainId, runId, objectDigest)`. Exact
replay returns the same reference. Conflict in any other field closes the
transaction.

No path, mount, filename, row key, writer handle, endpoint, or destination
identity appears in the reference.

## 16. Retention pins

### 16.1 Pin schema

```ts
type ContentRetentionPinReasonV1 =
  | { kind: "nonterminal-run"; runCheckpointDigest: RunCheckpointDigestV1 }
  | { kind: "effect-receipt"; effectReceiptDigest: EffectReceiptDigestV1 }
  | { kind: "approval-source"; approvalSubjectDigest: ApprovalSubjectDigestV1 }
  | { kind: "verification-attempt"; verificationAttemptDigest: VerificationAttemptDigestV1 }
  | { kind: "supplemental-observation"; supplementalObservationDigest: SupplementalObservationDigestV1 }
  | { kind: "terminal-evidence"; evidenceCheckpointDigest: EvidenceCheckpointDigest }
  | { kind: "owner-hold"; ownerHoldDecisionDigest: OwnerCustodyDecisionDigest };

interface ContentRetentionPinV1 {
  schema: "prism-age4-retention-pin-v1";
  ownerDomainId: OwnerDomainId;
  referenceDigest: ContentReferenceDigestV1;
  reason: ContentRetentionPinReasonV1;
  retentionPolicyDigest: ContentRetentionPolicyDigestV1;
  transactionId: ReferenceCommitTransactionId;
}
```

Pin uniqueness is `(referenceDigest, complete canonical reason bytes)`. A pin
is idempotent and never silently replaced.

### 16.2 Initial retention policy

The first production contract supports only:

```ts
type ContentRetentionPolicyV1 =
  | {
      schema: "prism-age4-retention-policy-v1";
      mode: "retain-until-owner-purge";
      allowOrphanCollection: true;
    }
  | {
      schema: "prism-age4-retention-policy-v1";
      mode: "retain-forever";
      allowOrphanCollection: true;
    };
```

There is no automatic wall-clock deletion of referenced content in version 1.
This avoids cross-epoch deadline interpretation and premature destruction.

Owner purge is a separate authenticated non-model operation. It remains
unauthorized until an implementation plan and operator contract explicitly
cover it.

### 16.3 Orphan collection

A prepared candidate with no committed reference may be collected only when:

- its publication lease is absent or expired in the current epoch;
- D4's complete reverse-reference scan at one settled state version finds no
  reference or in-flight attachment;
- no current writer request can replay into an unacknowledged candidate state;
- topology and object integrity are readable; and
- the deletion transaction records the exact candidate and scan digests.

Crash or uncertainty in any check retains the object.

### 16.4 Pin-release and reverse-reference roots

```ts
interface ReleasedRetentionPinSetV1 {
  schema: "prism-age4-released-pin-set-v1";
  ownerDomainId: OwnerDomainId;
  referenceDigest: ContentReferenceDigestV1;
  releasedPinDigests: CanonicalSortedUniqueSetV1<ContentRetentionPinDigestV1>;
  settlementStateVersion: SettlementStateVersion;
  releaseTransactionId: ReferenceCommitTransactionId;
}

interface ReverseReferenceScanV1 {
  schema: "prism-age4-reverse-reference-scan-v1";
  ownerDomainId: OwnerDomainId;
  objectDigest: ContentObjectDigestV1;
  settlementStateVersion: SettlementStateVersion;
  referenceDigests: CanonicalSortedUniqueSetV1<ContentReferenceDigestV1>;
  inFlightTransactionIds: CanonicalSortedUniqueSetV1<ReferenceCommitTransactionId>;
  scanTransactionId: ContentMetadataTransactionIdV1;
}
```

An orphan-deletion scan requires both sets empty. A referenced-owner-purge scan
requires the exact purged reference as the only historical reference and no
in-flight transaction. The released-pin set must contain every pin known at the
same or an earlier settlement state version. Any mismatch retains the object.

## 17. Content access policy

### 17.1 Closed purposes

```ts
type ContentReadPurposeV1 =
  | "run-replay"
  | "effect-input"
  | "operator-approval-view"
  | "verification-input"
  | "artifact-export"
  | "integrity-reconciliation";
```

`ContentAccessPolicyV1` is a canonical keyed catalog from purpose to exact
principal role, allowed object kinds, maximum response bytes, and required
authority-binding digest type. Unknown purposes and wildcards reject.

```ts
interface ContentAccessPolicyEntryV1 {
  schema: "prism-age4-access-policy-entry-v1";
  purpose: ContentReadPurposeV1;
  principalRoleId: RoleId;
  allowedObjectKinds: CanonicalSortedUniqueSetV1<ContentObjectKindTagV1>;
  maxResponseBytes: NonZeroU64;
  requiredAuthorityKind: ContentReadAuthorityV1["kind"];
}

interface ContentAccessPolicyV1 {
  schema: "prism-age4-access-policy-v1";
  ownerDomainId: OwnerDomainId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  entries: readonly ContentAccessPolicyEntryV1[];
}
```

`purpose` is the semantic key. Entries sort by canonical purpose bytes and
reject duplicates.

### 17.2 Read request

```ts
type ContentReadAuthorityV1 =
  | {
      kind: "run-replay";
      runCheckpointDigest: RunCheckpointDigestV1;
      conversationStateDigest: ConversationStateDigestV1;
    }
  | { kind: "effect-input"; effectReservationDigest: EffectReservationDigestV1 }
  | { kind: "operator-approval-view"; approvalSubjectDigest: ApprovalSubjectDigestV1 }
  | { kind: "verification-input"; verificationAttemptDigest: VerificationAttemptDigestV1 }
  | { kind: "artifact-export"; ownerCustodyDecisionDigest: OwnerCustodyDecisionDigest }
  | { kind: "integrity-reconciliation"; reconciliationId: ContentReconciliationIdV1 };

interface ReadContentByValueRequestV1 {
  schema: "prism-age4-read-by-value-request-v1";
  referenceDigest: ContentReferenceDigestV1;
  purpose: ContentReadPurposeV1;
  authority: ContentReadAuthorityV1;
  expectedDescriptorDigest: ContentObjectDescriptorDigestV1;
  expectedContentByteDigest: ContentByteDigestV1;
  maxResponseBytes: NonZeroU64;
}
```

`ContentReadRequestDigestV1` hashes `ReadContentByValueRequestV1`.

The authenticated channel supplies owner domain, principal, role, and current
daemon epoch. The reader verifies the reference, a complete continuity chain
to the current custody binding, active pin or permitted terminal retention,
purpose mapping, authority binding, object kind, length, and digest before
returning bytes.

The response contains bytes by value and a `ContentReadReceiptV1` binding the
request, principal, purpose, reference, object, topology, and verification
result. It exposes no path or reusable general read handle.

```ts
interface ContentReadReceiptV1 {
  schema: "prism-age4-read-receipt-v1";
  ownerDomainId: OwnerDomainId;
  requesterPrincipalId: PrincipalId;
  requesterRoleId: RoleId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  requestDigest: ContentReadRequestDigestV1;
  referenceDigest: ContentReferenceDigestV1;
  purpose: ContentReadPurposeV1;
  objectDigest: ContentObjectDigestV1;
  topologyDigest: StorageRootCatalogDigestV1;
  returnedByteLength: NonZeroU64;
  returnedContentByteDigest: ContentByteDigestV1;
  verificationResult: "verified";
}
```

### 17.3 Purpose rules

- `run-replay` requires the same run and exact checkpoint or conversation-state
  binding.
- `effect-input` requires the exact AGE-3 executor request and only
  `action-parameters` content.
- `operator-approval-view` requires the exact AGE-5 approval subject and only
  its declared source references.
- `verification-input` requires the exact verification attempt and read-only
  verifier subject.
- `artifact-export` accepts only artifact kinds and a separate authenticated
  owner export authorization. It grants no destination writer.
- `integrity-reconciliation` returns no bytes to the external caller and is
  available only to the custody integrity principal.

## 18. Content lifecycle

```text
absent
  +-- staging
        |-- discarded-safe
        +-- installed-durable
              +-- prepared-candidate
                    |-- referenced
                    |     |-- retained
                    |     +-- purge-eligible
                    |           +-- deletion-authorized
                    |                 +-- deleted-tombstone
                    +-- orphan-eligible
                          +-- deletion-authorized
                                +-- deleted-orphan-record
```

Bytes never change after `installed-durable`. A new byte value creates a new
object digest.

`purge-eligible` requires all pins released through exact D4 or owner
transitions and the retention policy to allow purge. D4 commits
`deletion-authorized` before any byte deletion. The custody reclaimer then
deletes only that object, flushes the containing directory and index, and
returns one authenticated observation. D4 commits the final tombstone from
that observation. Historical D4 records remain byte-identical.

A read of a valid tombstoned reference returns `retention-expired` with the
deletion-record digest. A read after deletion authorization but before final
tombstone returns `retention-expired-deletion-pending` with the authorization
digest. A reference with neither readable bytes nor a valid authorization or
tombstone is an integrity failure, not ordinary retention expiry.

The deletion target is a closed union:

```ts
type ContentDeletionTargetV1 =
  | {
      kind: "orphan";
      candidateDigest: PreparedContentCandidateDigestV1;
      reverseReferenceScanDigest: ReverseReferenceScanDigestV1;
    }
  | {
      kind: "referenced-owner-purge";
      referenceDigest: ContentReferenceDigestV1;
      ownerCustodyDecisionDigest: OwnerCustodyDecisionDigest;
      releasedPinSetDigest: ReleasedRetentionPinSetDigestV1;
      reverseReferenceScanDigest: ReverseReferenceScanDigestV1;
    };

interface ContentDeletionAuthorizationV1 {
  schema: "prism-age4-deletion-authorization-v1";
  ownerDomainId: OwnerDomainId;
  custodyBindingDigest: ContentCustodyBindingDigestV1;
  objectDigest: ContentObjectDigestV1;
  target: ContentDeletionTargetV1;
  deletionOperationId: ContentDeletionOperationIdV1;
  authorizedByPrincipalId: PrincipalId;
  authorizationTransactionId: ReferenceCommitTransactionId;
}

interface ContentDeletionObservationV1 {
  schema: "prism-age4-deletion-observation-v1";
  authorizationDigest: ContentDeletionAuthorizationDigestV1;
  deletionOperationId: ContentDeletionOperationIdV1;
  reclaimerPrincipalId: PrincipalId;
  objectDigest: ContentObjectDigestV1;
  outcome: "bytes-absent-after-delete";
  directoryFlushProtocol: "prism-age4-delete-flush-v1";
  topologyDigest: StorageRootCatalogDigestV1;
  observationTransactionId: ContentMetadataTransactionIdV1;
}

interface ContentDeletionRecordV1 {
  schema: "prism-age4-deletion-record-v1";
  ownerDomainId: OwnerDomainId;
  objectDigest: ContentObjectDigestV1;
  authorizationDigest: ContentDeletionAuthorizationDigestV1;
  observationDigest: ContentDeletionObservationDigestV1;
  tombstoneTransactionId: ReferenceCommitTransactionId;
}
```

`ContentDeletionOperationIdV1` is exactly 16 daemon-generated random bytes,
encoded as 32 lowercase hexadecimal characters. It is stable through response
loss. The reclaimer receives no path; it resolves the exact object under the
authorization-bound custody instance.

If power fails after deletion but before observation or tombstone commitment,
restart reuses the authorization and operation ID, verifies that the exact
object is absent, flushes metadata again, and returns the same semantic
observation. It never treats an authorized deletion as unexplained corruption.

## 19. Interfaces

### 19.1 Internal transaction commands

```ts
type ContentReferenceAttachmentV1 =
  | { kind: "run-checkpoint"; runCheckpointDigest: RunCheckpointDigestV1 }
  | { kind: "effect-receipt"; effectReceiptDigest: EffectReceiptDigestV1 }
  | { kind: "approval-source"; approvalSubjectDigest: ApprovalSubjectDigestV1 }
  | { kind: "verification-attempt"; verificationAttemptDigest: VerificationAttemptDigestV1 }
  | { kind: "supplemental-observation"; supplementalObservationDigest: SupplementalObservationDigestV1 }
  | { kind: "terminal-evidence"; evidenceCheckpointDigest: EvidenceCheckpointDigest };

interface CommitContentReferenceRequestV1 {
  schema: "prism-age4-commit-reference-request-v1";
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  candidateDigest: PreparedContentCandidateDigestV1;
  custodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  attachment: ContentReferenceAttachmentV1;
  initialPinReason: ContentRetentionPinReasonV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface AddContentRetentionPinRequestV1 {
  schema: "prism-age4-add-retention-pin-request-v1";
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  referenceDigest: ContentReferenceDigestV1;
  reason: ContentRetentionPinReasonV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

type RetentionPinReleaseAuthorityV1 =
  | {
      kind: "d4-transition";
      d4ReleaseAuthorityDigest: D4RetentionReleaseAuthorityDigestV1;
    }
  | {
      kind: "owner-custody-decision";
      ownerCustodyDecisionDigest: OwnerCustodyDecisionDigest;
    };

interface ReleaseContentRetentionPinRequestV1 {
  schema: "prism-age4-release-retention-pin-request-v1";
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  referenceDigest: ContentReferenceDigestV1;
  pinDigest: ContentRetentionPinDigestV1;
  releaseAuthority: RetentionPinReleaseAuthorityV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface AuthorizeContentDeletionRequestV1 {
  schema: "prism-age4-authorize-deletion-request-v1";
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  objectDigest: ContentObjectDigestV1;
  target: ContentDeletionTargetV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}

interface DeleteAuthorizedContentRequestV1 {
  schema: "prism-age4-delete-authorized-content-request-v1";
  authorizationDigest: ContentDeletionAuthorizationDigestV1;
  expectedObjectDigest: ContentObjectDigestV1;
}

interface RecordContentDeletionRequestV1 {
  schema: "prism-age4-record-deletion-request-v1";
  referenceCommitTransactionId: ReferenceCommitTransactionId;
  authorizationDigest: ContentDeletionAuthorizationDigestV1;
  observationDigest: ContentDeletionObservationDigestV1;
  expectedSettlementStateVersion: SettlementStateVersion;
}
```

The attachment and initial pin must describe the same importing authority
record. A D4 transition release must prove that record no longer requires the
pin. An owner decision can release only owner-hold or purge-eligible pins and
cannot erase a live run, receipt, verification, or evidence dependency.

### 19.2 Public and internal ports

```ts
interface ContentCustody {
  prepare(
    input: AuthenticatedCustodyCommand<PrepareContentRequestV1>,
  ): Promise<PrepareContentDecision>;

  readByValue(
    input: AuthenticatedCustodyCommand<ReadContentByValueRequestV1>,
  ): Promise<ReadContentDecision>;

  verifyReference(
    input: InternalReferenceVerificationRequest,
  ): Promise<ReferenceVerification>;

  reconcile(
    input: AuthorizedIntegrityReconciliationRequest,
  ): Promise<ContentReconciliationReport>;
}

interface ContentCustodyTransactionPort {
  commitReference(
    tx: HostTransactionContext,
    input: CommitContentReferenceRequestV1,
  ): Promise<ContentReferenceV1>;

  addRetentionPin(
    tx: HostTransactionContext,
    input: AddContentRetentionPinRequestV1,
  ): Promise<ContentRetentionPinV1>;

  releaseRetentionPin(
    tx: HostTransactionContext,
    input: ReleaseContentRetentionPinRequestV1,
  ): Promise<ContentRetentionDecision>;

  authorizeDeletion(
    tx: HostTransactionContext,
    input: AuthorizeContentDeletionRequestV1,
  ): Promise<ContentDeletionAuthorizationV1>;

  recordDeletion(
    tx: HostTransactionContext,
    input: RecordContentDeletionRequestV1,
  ): Promise<ContentDeletionRecordV1>;
}

interface ContentReclaimer {
  deleteAuthorized(
    input: AuthenticatedCustodyCommand<DeleteAuthorizedContentRequestV1>,
  ): Promise<ContentDeletionObservationV1>;
}
```

The transaction port is internal to the host daemon and callable only by the
D4 transaction writer. It is not exposed to run coordinators, plugins,
executors, brokers, operator renderers, or consumers.

The reclaimer port authenticates only the exact reclaimer principal bound to
the current custody binding. It accepts a committed deletion authorization,
never a caller-selected object or path, and cannot commit a tombstone.

No interface lists arbitrary content, resolves a path, returns a write handle,
or applies an artifact.

## 20. Crash, power-loss, and recovery semantics

| Durable point | Recovery |
|---|---|
| Before staged bytes flush | Discard staging object; no candidate or reference |
| After data flush, before install | Discard or resume same request after verifying staging bytes |
| After install, before directory or index flush | Treat candidate as uncommitted; startup reopens and verifies before any reuse |
| After full flush, before candidate metadata | Reconcile as unindexed durable object; reissue only for identical request and bytes |
| Candidate metadata committed, response lost | Identical request returns the same candidate |
| Candidate committed, D4 transaction never starts | Candidate remains provisional, then may become orphan-eligible |
| D4 transaction fails | No reference or pin; durable candidate remains safe orphan |
| D4 transaction commits, response lost | Identical transaction lookup returns the same reference and pin |
| Deletion authorization commits, response lost | Exact replay returns the same authorization and operation ID |
| Reclaimer crashes before deletion | Authorization remains pending; exact operation resumes |
| Reclaimer deletes bytes, response is lost | Exact operation verifies absence, flushes metadata again, and returns the same semantic observation |
| Deletion observation commits, tombstone transaction fails | Authorization and observation remain pending; D4 retries only the tombstone transaction |
| Tombstone commits, response lost | Exact replay returns the same tombstone |
| Reference exists, bytes missing, no authorization or tombstone | Integrity incident; close admission, publication, and ordinary reads |
| Topology changes or binding drifts | Close admission and new writes until complete reproof; integrity reconciliation only |

Every transition has fault injection immediately before and after data flush,
metadata flush, install, candidate commit, reference commit, pin change,
readback, and deletion.

## 21. Downstream and artifact boundary

An artifact is an AGE-4 object kind, not destination authority.

An authorized export reads one exact retained artifact by value. The export
receipt proves only which bytes left custody under which owner decision. It
does not grant a consumer writer, D9 candidate identity, quarantine state,
promotion decision, installation, execution, or publication.

D9 must create its own consumer-side identity after import. Work-program
selection and AGE-5 approval do not override this boundary.

Model observations, action parameters, feedback, and tool or verification
observations are not artifact-exportable in the initial policy.

## 22. Proposed AGE-4 invariant refinements

Final IDs belong to the successor constitutional baseline.

| Alias | Statement | Proof class |
|---|---|---|
| AGE4-INV-01 | One host-wide topology catalog covers every custody, task, protected, credential, consumer-writer, synchronized, and replicated root across owners, and a stale or incomplete catalog grants no admission or write authority. | Runtime adversarial |
| AGE4-INV-02 | Each production owner uses one dedicated local custody filesystem and volume identity disjoint from every prohibited root and other-owner custody root. | Runtime adversarial |
| AGE4-INV-03 | D4 cannot commit a content reference until bytes are flushed, installed, metadata-flushed, reopened, and verified under the exact custody and topology binding. | Runtime adversarial |
| AGE4-INV-04 | Only the custody writer publishes bytes, the topology authority commits topology records, the D4 transaction writer commits references and deletion authority, and the reclaimer deletes an exactly authorized object; no task or consumer principal receives a backing path or write handle. | Static plus runtime adversarial |
| AGE4-INV-05 | Every read is by value for one exact reference, owner, principal, purpose, authority binding, kind, length, and digest. | Runtime adversarial |
| AGE4-INV-06 | Referenced content cannot be deleted while any live or retained pin exists; D4 authorization precedes reclaimer deletion, and D4 commits the final tombstone from an authenticated deletion observation without mutating settlement history. | Runtime adversarial |
| AGE4-INV-07 | A content reference or artifact export never grants apply, promotion, installation, execution, destination-write, or publication authority. | Static plus runtime adversarial |
| AGE4-INV-08 | An existing reference can cross a topology-version change only through a complete acyclic continuity chain proving unchanged custody root, reader contract, and principal policy. | Runtime adversarial |

## 23. Conformance requirements

AGE-4 contract closure requires:

1. Two independent codecs reproduce every metadata digest and reject alternate
   schemas, unknown fields, duplicate keys, wrong relation order, and malformed
   union arms.
2. Production-path topology tests provision cross-kind and cross-owner aliases,
   same-filesystem roots, hard links, mount substitutions, network and FUSE
   mounts, synchronized roots, stale catalogs, and incomplete inventories. All
   fail before admission or write.
3. Power-loss tests interrupt every publication and reference-commit point.
   Durable D4 authority never points to absent bytes.
4. Principal tests attempt cross-owner reads, wrong-purpose reads, kind
   substitution, stale authority bindings, path discovery, listing, write-handle
   escape, and direct backing-root access.
5. Retention tests race pin creation, release, terminal settlement, owner hold,
   orphan scan, purge, read, epoch loss, and response loss. Live references are
   never deleted and replay returns identical records.
6. The same interface suite passes against the in-memory and durable adapters.
   Only the durable adapter may claim production conformance.

## 24. Draft closure record

- Contract status: AGE-1 through AGE-5 package interfaces reconciled; draft
  package remains unratified.
- AGE-1 import-name reconciliation: exact requirement, allowance, binding,
  retention, and access-policy names resolved.
- Imported AGE-2 contract: checkpoints, conversation state, and exact
  coordinator producer binding resolved.
- Imported AGE-3 contract: exact effect-result producer, reservation, and
  receipt roots resolved.
- Imported AGE-5 contract: approval, verification, completion-verification
  producer, and supplemental-observation roots resolved.
- Integrated custody seams: closed producer lineage and supplemental
  attachment and retention arms applied.
- Successor constitutional baseline: not authored.
- Independent hardening: not run.
- Implementation and purge authority: none.

AGE-4 has no remaining cross-contract name, producer-lineage, or supplemental-
custody seam inside this five-contract package. The next authorized milestone
is the successor constitutional baseline under a separate instruction. This
record is not an implementation plan.
