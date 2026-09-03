# Prism Harness AGE-1 Task Authority contract specification

Date: 2026-08-27

Status: **contract draft**. This document is authorized for drafting by the
accepted autonomous goal-execution architecture. It grants no implementation,
schema-migration, invariant-activation, provider-call, installation,
publication, or public-claim authority.

Decision area: AGE-1 Task Authority.

Accepted parent architecture digest:
`5fc1443f9d8e740d4811a02d9e3a5dd637a12184`.

## 1. Purpose

AGE-1 defines how reusable owner policy and one submitted goal become the exact
immutable task identity inside an admitted autonomous run.

It answers five questions:

- What is a reusable task template?
- What may an authenticated submitter vary for one run?
- Which bytes form the initial model conversation?
- Which imported authority bundles must task identity bind?
- How does D1 return the same admitted run after response loss?

AGE-1 does not run an agent, reserve an effect, store runtime content, approve
an operation, verify completion, or settle a run.

## 2. Source of truth and precedence

When sources disagree, use this order:

1. Runtime, developer, user, and owner authority.
2. The ratified invariant registry and lock.
3. The ratified D1 through D7 architecture and binding amendments.
4. The accepted autonomous goal-execution architecture at the digest above.
5. Its owner acceptance record.
6. This contract after package ratification.
7. Future AGE-2, AGE-3, AGE-4, and AGE-5 contracts for the types they own.
8. Current implementation and historical drafts.

The frozen D8 pair is non-normative. No D8 schema, plan name, or amendment
history is imported by this contract.

## 3. Scope

AGE-1 owns:

- non-executable task-template identity and immutable revisions;
- instruction bundles and initial-conversation composition;
- goal-input schema bindings and authenticated goal submissions;
- task-template owner-ratification and future-submission availability records;
- the AGE-1 portion of admission validation;
- the complete root shape of `GoalTaskIdentityV1`;
- the complete root shape of `AdmittedGoalRunV1`;
- AGE-1 canonical record schemas and digest domains; and
- response-loss replay for submission and admission identity.

## 4. Non-goals and ownership exclusions

AGE-1 does not own:

- turns, proposal queues, checkpoints, conversation replay, or feedback state;
- operation grants, destination resolution, budgets, deadlines, permits,
  receipts, or effect recovery;
- content bytes, publication, references, topology proof, reads, retention, or
  deletion;
- approval views, challenges, decisions, verification attempts, or completion
  policy execution;
- execution-class definitions, daemon leases, provider credentials,
  settlement, constitutional proof, or release; or
- encapsulated execution, work programs, adaptation, or observability.

AGE-1 binds digests owned by those areas. Binding a digest does not transfer
ownership of the referenced contract.

## 5. Contract vocabulary

| Term | Meaning |
|---|---|
| Task template | An immutable, non-executable owner-ratified recipe that fixes instructions, accepted goal shape, requested authority envelope, behavior executables, policies, and completion requirements |
| Template revision | One immutable template value; changing any field creates a new revision and digest |
| Instruction bundle | Ordered immutable UTF-8 instruction and context fragments used to compose the initial conversation |
| Goal-input schema | A closed schema and exact validator binding for the only per-run data a submitter may provide |
| Goal submission command | Caller-supplied submission identity, selected template digest, and canonical goal value; it contains no authenticated identity fields |
| Authenticated goal submission | The command plus owner domain, principal, role, and policy identity derived by the trusted local channel |
| Goal task identity | The run-independent digest binding one exact template, goal, composition, and imported authority package |
| Admitted goal run | D1's opaque run authority binding the goal task identity to one activation, run, daemon epoch, lease, and production snapshot |
| Imported contract digest | An opaque digest whose root schema belongs to another AGE area or ratified D1 through D7 contract |

## 6. Imported and exported contracts

### 6.1 Imports

AGE-1 imports these types without redefining their internals:

| Owner | Imported type | AGE-1 use |
|---|---|---|
| D1 | `OwnerDomainId`, `PrincipalId`, `RoleId`, `AuthorizationPolicyDigest`, `OwnerRegistryDecisionDigest`, `SchemaDigestV1`, `TrustedRootDigest`, `RegistryDigest`, `PluginSetDigest`, `EffectiveGrantDigest`, `ExecutionBindingCatalogDigest`, `ProviderBrokerBindingCatalogDigest`, `ExecutionBindingDigest`, `DependencyClosureDigest` | Existing admission authority, owner decision, schema identity, and executable identity |
| D2 | `ActivationRequestId`, `RunId`, `DaemonEpoch`, `OwnershipLeaseIdentity`, `ProductionEnvironmentId` | One activation and its fenced custody identity |
| D4 | `AdmissionCheckpointDigest`, `AdmissionAcknowledgementDigest` | Atomic promotion and acknowledgement |
| AGE-2 | `RunBehaviorContractDigestV1` | Turn, parser, serializer, proposal, operation-ID, and feedback semantics |
| AGE-3 | `RequestedAuthorityEnvelopeDigestV1`, `GrantedOperationCatalogDigestV1`, `EffectBudgetPolicyDigestV1`, `EffectDeadlinePolicyDigestV1` | Requested and admitted effect authority |
| AGE-4 | `ContentCustodyRequirementDigestV1`, `ContentCustodyAllowanceDigestV1`, `ContentCustodyBindingDigestV1`, `ContentRetentionPolicyDigestV1`, `ContentAccessPolicyDigestV1` | Requested and admitted runtime-content custody policy |
| AGE-5 | `ApprovalPolicyBindingDigestV1`, `CompletionPolicyBindingDigestV1` | Human-decision and completion semantics |
| D6 contract package | `CanonicalCodecBindingDigestV1`, `SchemaBundleDigestV1` | Exact encoding and generated closed schemas |

An unresolved imported digest makes this document draftable but not
package-ratifiable. The final implementation-ratification package must resolve
every imported type to one exact contract digest.

### 6.2 Exports

AGE-1 exports:

- `TaskTemplateV1` and `TaskTemplateDigestV1`;
- `TaskTemplateRatificationV1` and its digest;
- `TaskTemplateAvailabilityV1` and its digest;
- `GoalInputSchemaBindingV1` and its digest;
- `GoalSubmissionCommandV1`;
- `AuthenticatedGoalSubmissionV1` and `GoalSubmissionDigestV1`;
- `InstructionBundleV1` and `InstructionBundleDigestV1`;
- `InitialConversationV1` and `InitialConversationDigestV1`;
- `GoalTaskImportSetV1` and its digest;
- `GoalTaskIdentityV1` and `GoalTaskDigestV1`; and
- `AdmittedGoalRunV1` and `AdmittedGoalRunDigestV1`.

## 7. Canonical data rules

### 7.1 Closed values

Every AGE-1 record is a generated closed schema. Unknown fields, duplicate
keys, missing required fields, alternate union tags, noncanonical numeric
forms, and trailing bytes reject before hashing or admission.

All strings are valid UTF-8 scalar sequences. AGE-1 performs no Unicode,
newline, or whitespace normalization. Byte differences remain visible in the
digest.

All counts, lengths, ordinals, and revisions are unsigned integers with exact
schema bounds. Floating-point values are forbidden in authority-bearing AGE-1
records.

### 7.2 Collection rules

Ordered lists preserve semantic order and include that order in their digest.
Keyed catalogs declare one semantic key, sort by the canonical bytes of that
key, and reject duplicate key bytes before constructing a lookup map. Semantic
sets sort by the complete canonical element bytes and reject duplicates.

No decoder may repair ordering, discard duplicates, or apply first-wins or
last-wins behavior.

### 7.3 Digest construction

Every digest uses the contract-package canonical codec and this preimage:

```text
UTF8(domain) || 0x00 || canonical(root-record)
```

The initial domains are:

| Digest | Domain |
|---|---|
| `InstructionFragmentDigestV1` | `prism-age1-instruction-fragment-v1` |
| `InstructionBundleDigestV1` | `prism-age1-instruction-bundle-v1` |
| `GoalInputSchemaBindingDigestV1` | `prism-age1-goal-input-schema-binding-v1` |
| `TaskTemplateDigestV1` | `prism-age1-task-template-v1` |
| `TaskTemplateRatificationDigestV1` | `prism-age1-task-template-ratification-v1` |
| `TaskTemplateAvailabilityDigestV1` | `prism-age1-task-template-availability-v1` |
| `GoalSubmissionDigestV1` | `prism-age1-goal-submission-v1` |
| `InitialConversationDigestV1` | `prism-age1-initial-conversation-v1` |
| `GoalTaskImportSetDigestV1` | `prism-age1-goal-task-import-set-v1` |
| `GoalTaskDigestV1` | `prism-age1-goal-task-v1` |
| `AdmittedGoalRunDigestV1` | `prism-age1-admitted-goal-run-v1` |

The hash algorithm is selected by `CanonicalCodecBindingDigestV1`. A digest
field whose named contract is absent from the generated schema bundle fails
schema generation.

### 7.4 Local scalar and bounded-value contracts

| Type | Canonical constraint |
|---|---|
| `TaskTemplateIdV1` | Lowercase ASCII matching `[a-z][a-z0-9-]{0,63}` |
| `TaskTemplateRevisionV1` | Non-zero unsigned 64-bit integer |
| `InstructionFragmentIdV1` | Lowercase ASCII matching `[a-z][a-z0-9-]{0,63}` |
| `GoalSchemaIdV1` | Lowercase ASCII matching `[a-z][a-z0-9.-]{0,95}` |
| `GoalSubmissionIdV1` | Exactly 16 trusted random bytes, encoded as 32 lowercase hexadecimal characters |
| `BoundedByteString` | Length-prefixed bytes whose maximum comes from the enclosing schema |
| `CanonicalGoalValueV1` | Opaque brand created only by the exact goal-schema validator after canonical decoding and limit checks |

`GoalValueLimitsV1` has this exact shape:

```ts
interface GoalValueLimitsV1 {
  schema: "prism-age1-goal-value-limits-v1";
  maxCanonicalBytes: NonZeroU64;
  maxNestingDepth: NonZeroU64;
  maxCollectionMembers: NonZeroU64;
  maxStringBytes: NonZeroU64;
  maxBinaryBytes: NonZeroU64;
}
```

Every AGE-1 digest alias is an opaque digest byte string produced only by its
named domain and root schema. Raw strings cannot satisfy a digest type.

## 8. Task-template identity

### 8.1 Identifiers

`TaskTemplateIdV1` is an owner-chosen stable opaque identifier used for registry
lookup. It is not authority. Authority comes from the exact template digest and
owner-ratification record.

`TaskTemplateRevisionV1` is a non-zero unsigned 64-bit integer. Revisions are
strictly increasing for one `(ownerDomainId, taskTemplateId)` pair. A revision
is never overwritten or reused.

### 8.2 Root schema

Canonical field order for `TaskTemplateV1` is:

```ts
interface TaskTemplateV1 {
  schema: "prism-age1-task-template-v1";
  ownerDomainId: OwnerDomainId;
  taskTemplateId: TaskTemplateIdV1;
  revision: TaskTemplateRevisionV1;
  instructionBundle: InstructionBundleV1;
  goalInputSchemaBinding: GoalInputSchemaBindingV1;
  requestedAuthorityEnvelopeDigest: RequestedAuthorityEnvelopeDigestV1;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  contentCustodyRequirementDigest: ContentCustodyRequirementDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  requiredSchemaBundleDigest: SchemaBundleDigestV1;
}
```

The template contains no executable entrypoint, provider credential, raw
endpoint, caller-selected path, direct permit, operator decision, or mutable
default.

### 8.3 Revision law

Changing any field creates a new revision and digest. A new revision does not
modify, supersede, or widen an admitted run. Existing runs keep the exact
revision they admitted.

Two byte-identical template values under different revision numbers have
different digests because the revision is part of the root record.

## 9. Instruction bundle and initial composition

### 9.1 Instruction fragments

`InstructionFragmentV1` has this canonical field order:

```ts
interface InstructionFragmentV1 {
  schema: "prism-age1-instruction-fragment-v1";
  fragmentId: InstructionFragmentIdV1;
  role: "system-instruction" | "template-context";
  mediaType: "text/plain; charset=utf-8";
  bytes: BoundedByteString;
}
```

`fragmentId` is the semantic key inside the bundle. Bundle order is still
semantic, so the ordered fragment list rejects duplicate IDs without sorting.
Empty fragments and invalid UTF-8 reject. AGE-1 preserves every accepted byte,
including line endings and trailing newlines.

### 9.2 Instruction bundle

```ts
interface InstructionBundleV1 {
  schema: "prism-age1-instruction-bundle-v1";
  compositionAlgorithm: "prism-age1-initial-compose-v1";
  fragments: readonly InstructionFragmentV1[];
}
```

At least one `system-instruction` fragment is required.
`template-context` fragments may appear only after the last
`system-instruction` fragment. The list rejects duplicate fragment IDs and any
other role.

### 9.3 Goal rendering

`GoalInputSchemaBindingV1` binds the deterministic goal renderer used during
composition. It may change representation, not meaning. The renderer receives
only the validated canonical goal value and its schema binding. It receives no
registry, grant, route, credential, prior-run, or host-state input.

The renderer returns one non-empty UTF-8 byte string or a typed failure. It may
not emit additional messages or roles.

### 9.4 Initial conversation

`InitialConversationV1` is an ordered list of messages:

```ts
type InitialMessageSourceV1 =
  | {
      kind: "instruction-fragment";
      instructionFragmentDigest: InstructionFragmentDigestV1;
    }
  | {
      kind: "goal-submission";
      goalSubmissionDigest: GoalSubmissionDigestV1;
    };

interface InitialMessageV1 {
  schema: "prism-age1-initial-message-v1";
  role: "system-instruction" | "template-context" | "goal-input";
  source: InitialMessageSourceV1;
  bytes: BoundedByteString;
}

interface InitialConversationV1 {
  schema: "prism-age1-initial-conversation-v1";
  compositionAlgorithm: "prism-age1-initial-compose-v1";
  taskTemplateDigest: TaskTemplateDigestV1;
  goalSubmissionDigest: GoalSubmissionDigestV1;
  messages: readonly InitialMessageV1[];
}
```

Composition copies each instruction fragment into one message in bundle order,
then appends exactly one `goal-input` message from the admitted renderer.
Messages are never concatenated with delimiters. Role, tagged source, byte
length, and bytes all enter `InitialConversationDigestV1`.

Provider translation is outside AGE-1. It must preserve this ordered semantic
sequence exactly.

## 10. Goal-input schema binding

### 10.1 Root schema

```ts
interface GoalInputSchemaBindingV1 {
  schema: "prism-age1-goal-input-schema-binding-v1";
  goalSchemaId: GoalSchemaIdV1;
  goalSchemaDigest: SchemaDigestV1;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  validatorExecutableBindingDigest: ExecutionBindingDigest;
  validatorDependencyClosureDigest: DependencyClosureDigest;
  rendererExecutableBindingDigest: ExecutionBindingDigest;
  rendererDependencyClosureDigest: DependencyClosureDigest;
  limits: GoalValueLimitsV1;
}
```

`GoalValueLimitsV1` fixes maximum canonical bytes, nesting depth, collection
members, string bytes, and binary bytes. Each value is finite and non-zero.

### 10.2 Validation law

The validator accepts one closed canonical value. It rejects unknown fields,
duplicate keys, noncanonical ordering, out-of-range values, undeclared union
arms, implicit coercion, executable values, references outside the schema, and
any value over the admitted limits.

Defaults are forbidden. If a field may be omitted, that fact and its meaning
must be represented by the schema. The validator cannot read environment,
clock, network, filesystem, registry, or prior-run state.

Authority-shaped strings or objects remain goal data. No AGE-1 or D1 component
parses their prose to create a capability.

## 11. Goal submission

### 11.1 Caller command

```ts
interface GoalSubmissionCommandV1 {
  schema: "prism-age1-goal-submission-command-v1";
  submissionId: GoalSubmissionIdV1;
  taskTemplateDigest: TaskTemplateDigestV1;
  goalValue: CanonicalGoalValueV1;
}
```

The trusted CLI or consumer adapter creates `submissionId` from 128 bits of
trusted entropy before its first send and persists it through response loss.
The ID is idempotency input, not authority.

The caller does not send owner domain, principal, role, authorization policy,
registry bytes, trust-root path, grants, budgets, tools, routes, destinations,
executors, or completion policy.

### 11.2 Authenticated submission

After authenticating the local channel and authorizing the submit operation,
D1 constructs:

```ts
interface AuthenticatedGoalSubmissionV1 {
  schema: "prism-age1-authenticated-goal-submission-v1";
  submissionId: GoalSubmissionIdV1;
  ownerDomainId: OwnerDomainId;
  submitterPrincipalId: PrincipalId;
  submitterRoleId: RoleId;
  authorizationPolicyDigest: AuthorizationPolicyDigest;
  taskTemplateDigest: TaskTemplateDigestV1;
  goalInputSchemaBindingDigest: GoalInputSchemaBindingDigestV1;
  goalValue: CanonicalGoalValueV1;
}
```

`GoalSubmissionDigestV1` hashes `AuthenticatedGoalSubmissionV1`, not the caller
command. Authenticated owner, principal, role, and policy identity therefore
participate in task identity.

Authenticated identity fields come only from peer credentials and daemon
policy. Caller bytes cannot replace them.

The semantic uniqueness key is `(ownerDomainId, submissionId)`. The first
valid canonical submission commits. Identical replay returns the same
submission digest and admission lookup. The same key with different canonical
bytes conflicts without creating a second activation.

## 12. Template ratification and availability

### 12.1 Ratification record

A template is eligible for submission only when an existing D1 owner-registry
decision binds its exact digest:

```ts
interface TaskTemplateRatificationV1 {
  schema: "prism-age1-task-template-ratification-v1";
  ownerDomainId: OwnerDomainId;
  taskTemplateId: TaskTemplateIdV1;
  revision: TaskTemplateRevisionV1;
  taskTemplateDigest: TaskTemplateDigestV1;
  ownerRegistryDecisionDigest: OwnerRegistryDecisionDigest;
  registryDigest: RegistryDigest;
}
```

The owner-registry decision protocol remains D1 and D6 authority. AGE-1 does
not create a second operator-decision system.

### 12.2 Availability record

Future submission availability is append-only:

```ts
type TaskTemplateAvailabilityV1 =
  | {
      schema: "prism-age1-task-template-availability-v1";
      status: "available";
      taskTemplateDigest: TaskTemplateDigestV1;
      effectiveRegistryDigest: RegistryDigest;
    }
  | {
      schema: "prism-age1-task-template-availability-v1";
      status: "withdrawn-for-future-submissions";
      taskTemplateDigest: TaskTemplateDigestV1;
      ownerRegistryDecisionDigest: OwnerRegistryDecisionDigest;
    }
  | {
      schema: "prism-age1-task-template-availability-v1";
      status: "withdrawn-with-successor";
      taskTemplateDigest: TaskTemplateDigestV1;
      ownerRegistryDecisionDigest: OwnerRegistryDecisionDigest;
      successorTemplateDigest: TaskTemplateDigestV1;
    };
```

Withdrawal blocks new admission and cannot alter an admitted run. A successor
is informational and grants nothing.

## 13. Imported authority set

### 13.1 Template request versus admitted grant

The template binds one `RequestedAuthorityEnvelopeDigestV1` owned by AGE-3.
That value states the maximum authority D1 may consider. It grants nothing.

After Policy and D1 admission, the exact granted authority appears only in
`GoalTaskImportSetV1`:

```ts
interface GoalTaskImportSetV1 {
  schema: "prism-age1-goal-task-import-set-v1";
  trustedRootDigest: TrustedRootDigest;
  registryDigest: RegistryDigest;
  pluginSetDigest: PluginSetDigest;
  effectiveGrantDigest: EffectiveGrantDigest;
  executionBindingCatalogDigest: ExecutionBindingCatalogDigest;
  providerBrokerBindingCatalogDigest: ProviderBrokerBindingCatalogDigest;
  grantedOperationCatalogDigest: GrantedOperationCatalogDigestV1;
  effectBudgetPolicyDigest: EffectBudgetPolicyDigestV1;
  effectDeadlinePolicyDigest: EffectDeadlinePolicyDigestV1;
  runBehaviorContractDigest: RunBehaviorContractDigestV1;
  contentCustodyRequirementDigest: ContentCustodyRequirementDigestV1;
  contentCustodyAllowanceDigest: ContentCustodyAllowanceDigestV1;
  contentCustodyBindingDigest: ContentCustodyBindingDigestV1;
  contentRetentionPolicyDigest: ContentRetentionPolicyDigestV1;
  contentAccessPolicyDigest: ContentAccessPolicyDigestV1;
  approvalPolicyBindingDigest: ApprovalPolicyBindingDigestV1;
  completionPolicyBindingDigest: CompletionPolicyBindingDigestV1;
  canonicalCodecBindingDigest: CanonicalCodecBindingDigestV1;
  completeSchemaBundleDigest: SchemaBundleDigestV1;
}
```

Every field is required. Null, wildcard, latest-version, default-policy, and
ambient lookup forms are forbidden.

### 13.2 Subset rule

D1 asks AGE-3 to prove that granted operations and budgets are equal to or
narrower than the requested authority envelope. It asks AGE-4 to prove that the
exact custody allowance is equal to or narrower than the template requirement
and is served by the admitted custody binding.

Run behavior, retention, access, approval, completion, codec, and schema
digests must equal their exact template-bound values unless the owning contract
defines a separate template request and admitted-value pair. AGE-1 coordinates
these results but does not reproduce another area's comparison law.

If any owner cannot provide a complete proof, admission rejects. D1 never fills
an omitted policy with a default.

## 14. Goal task identity

`GoalTaskIdentityV1` is independent of activation, daemon epoch, and lease. It
therefore remains stable across response loss and process restart for the same
admitted task:

```ts
interface GoalTaskIdentityV1 {
  schema: "prism-age1-goal-task-v1";
  ownerDomainId: OwnerDomainId;
  taskTemplateDigest: TaskTemplateDigestV1;
  taskTemplateRatificationDigest: TaskTemplateRatificationDigestV1;
  goalSubmissionDigest: GoalSubmissionDigestV1;
  instructionBundleDigest: InstructionBundleDigestV1;
  initialConversationDigest: InitialConversationDigestV1;
  importSetDigest: GoalTaskImportSetDigestV1;
}
```

`GoalTaskDigestV1` is the digest of this root. It is the AGE-1 value occupying
the parent architecture's stable `taskDigest` role.

The root does not include timestamps, process IDs, attempt numbers, lease
generation, daemon epoch, diagnostic labels, or renderer layout.

## 15. Admitted goal run

### 15.1 Root schema

```ts
interface AdmittedGoalRunV1 {
  schema: "prism-age1-admitted-goal-run-v1";
  ownerDomainId: OwnerDomainId;
  runId: RunId;
  activationRequestId: ActivationRequestId;
  submissionId: GoalSubmissionIdV1;
  goalTaskDigest: GoalTaskDigestV1;
  taskTemplateDigest: TaskTemplateDigestV1;
  goalSubmissionDigest: GoalSubmissionDigestV1;
  initialConversationDigest: InitialConversationDigestV1;
  importSetDigest: GoalTaskImportSetDigestV1;
  daemonEpoch: DaemonEpoch;
  ownershipLeaseIdentity: OwnershipLeaseIdentity;
  admissionCheckpointDigest: AdmissionCheckpointDigest;
  productionEnvironmentId: ProductionEnvironmentId;
}
```

The activation transaction stores the canonical bytes of every AGE-1 root named
by these digests by value in owner-scoped admission attachment rows. Those rows
are part of the admitted snapshot but are excluded from evidence exports. A
restart rehydrates these committed bytes and never rereads a mutable template,
goal submission, renderer output, or registry alias. A digest without its exact
readable root is not a runnable snapshot.

### 15.2 Opaque construction

Only D1 may ask the D2/D4 activation transaction to create the snapshot. Public
callers receive a deeply frozen branded value after acknowledgement. No public
constructor accepts raw fields.

`AdmittedGoalRunDigestV1` binds the complete record. The acknowledgement
compares that exact digest.

## 16. Admission algorithm

D1 performs this ordered operation:

1. Authenticate the submission channel and construct the authenticated
   submission.
2. Resolve the exact owner trusted root, registry, template revision,
   ratification, and current availability.
3. Recompute every AGE-1 digest from source bytes and reject drift.
4. Validate the goal value with the bound pure validator and exact limits.
5. Render the goal and compose the initial conversation deterministically.
6. Ask D1 Policy and each imported contract owner to derive and validate the
   complete `GoalTaskImportSetV1`.
7. Compute `GoalTaskDigestV1`.
8. Create or resume one existing D1 `activationRequestId` mapped to
   `(ownerDomainId, submissionId, GoalTaskDigestV1)`.
9. Execute the inherited Policy-evaluation and host-activation sequence.
10. Promote one complete `AdmittedGoalRunV1` to
    `admission-pending-ack` in the D2/D4 transaction.
11. Rehydrate every named root, recompute the admitted-run digest, and
    acknowledge that exact digest.
12. Return the same opaque admitted run on identical replay.

No model, task-template text, goal value, validator, renderer, parser, plugin,
or caller can skip or reorder these steps.

## 17. Submission and admission states

### 17.1 Submission state

```text
received
  |-- conflicted             terminal, same id with different bytes
  |-- rejected-auth          terminal, no owner authority
  |-- rejected-template      terminal, unavailable or invalid template
  |-- rejected-goal          terminal, invalid goal value
  +-- activation-bound       stable activation request exists
```

### 17.2 Activation state

AGE-1 uses the existing D1/D4 activation states without adding alternatives:

```text
activation-bound
  +-- policy-evaluating
        |-- rejected
        +-- admission-pending-ack
              |-- rejected
              +-- admitted
```

An admitted record is immutable. A template withdrawal after
`admission-pending-ack` does not reinterpret the frozen snapshot. An
unacknowledged snapshot remains non-runnable and follows the inherited expiry
rule.

## 18. Interfaces

```ts
interface TaskAuthority {
  validateTemplate(input: UntrustedTemplateBytes): Promise<TemplateValidation>;
  submitGoal(
    input: AuthenticatedChannelCommand<GoalSubmissionCommandV1>,
  ): Promise<GoalSubmissionDecision>;
  resumeSubmission(
    input: AuthenticatedSubmissionLookup,
  ): Promise<GoalSubmissionDecision>;
  discloseTask(input: AuthorizedTaskDisclosureRequest): Promise<TaskDisclosure>;
}
```

`validateTemplate` is pure and grants nothing. `submitGoal` enters the D1
activation path only after channel authentication. `resumeSubmission` returns
the same submission, activation, rejection, or admitted identity.

`discloseTask` returns bounded identity and policy summaries. It does not
return credentials, private endpoints, raw trust-root paths, provider session
data, or operator authority.

## 19. Failure and recovery semantics

| Condition | Result |
|---|---|
| Unknown, unavailable, withdrawn, or unratified template | Reject before activation |
| Template ID resolves to a different digest or revision | Conflict; no fallback to latest |
| Invalid goal schema or validator binding | Reject template or submission before Policy |
| Goal value invalid or over limits | Reject submission; no activation |
| Renderer fails, drifts, reads ambient state, or emits invalid bytes | Reject before activation |
| Requested-to-granted subset proof absent | Reject; no default or partial grant |
| Imported contract digest unresolved or root unreadable | Reject before runnable admission |
| Submission response lost before activation | Same `(owner, submissionId)` resumes or conflicts by bytes |
| Activation response lost | Existing D1 activation lookup returns the same identity |
| Snapshot response lost before acknowledgement | Same digest rehydrates; no plugin launch |
| Acknowledgement response lost | Identical replay returns the admitted run |
| Template or registry changes after admission | Active run keeps frozen bytes; new submissions use current availability |

All safe errors use closed codes and bounded metadata. They contain no raw goal
value, instruction bytes, private path, provider payload, credential, or
environment dump.

## 20. Proposed AGE-1 invariant refinements

Final IDs belong to the successor constitutional baseline.

| Alias | Statement | Proof class |
|---|---|---|
| AGE1-INV-01 | Instruction and goal content never creates, selects, or widens authority; all authority comes from the complete import set inside the admitted task digest. | Static plus runtime adversarial |
| AGE1-INV-02 | A task template is non-executable, immutable by revision, and usable only with one exact owner-ratification and availability record. | Static plus runtime adversarial |
| AGE1-INV-03 | Goal submission can vary only the canonical value allowed by the exact template-bound goal schema; authenticated identity is derived outside caller bytes. | Runtime adversarial |
| AGE1-INV-04 | Initial composition is deterministic and binds message role, source digest, order, and exact bytes without delimiter parsing or normalization. | Runtime adversarial |
| AGE1-INV-05 | Every execution-relevant imported registry, grant, operation, custody, replay, approval, completion, codec, and schema identity is required in one task import set. | Static structure |
| AGE1-INV-06 | Identical submission and activation replay returns the same goal task and admitted run; conflicting bytes never mint a second activation. | Runtime adversarial |

## 21. Conformance requirements

AGE-1 contract closure requires:

1. Two independent codecs reproduce every AGE-1 digest and reject all alternate
   encodings, unknown fields, duplicates, and wrong collection order.
2. Golden vectors cover every instruction role, goal-schema limit, union arm,
   empty boundary, UTF-8 boundary, and one-field digest mutation.
3. Admission fixtures independently mutate each imported digest, template
   revision, ratification, availability, authenticated identity, and subset
   result. Every mutation rejects or changes task identity before launch.
4. Response-loss and crash tests cover submission commit, activation mapping,
   Policy evaluation, pending acknowledgement, acknowledgement, and return.
5. Static structure proves no prompt, goal, plugin, parser, renderer, or public
   caller can construct `AdmittedGoalRunV1` or bypass the imported-contract
   validation path.

## 22. Draft closure record

- Contract status: AGE-1 through AGE-5 package interfaces reconciled; draft
  package remains unratified.
- Imported AGE-2 contract: exact run-behavior export resolved.
- Imported AGE-3 contract: exact requested-authority, operation-catalog,
  budget-policy, and deadline-policy exports resolved.
- Imported AGE-4 contract: exact requirement, allowance, binding, retention,
  and access-policy exports resolved.
- Imported AGE-5 contract: exact approval-policy and completion-policy exports
  resolved.
- Successor constitutional baseline: not authored.
- Independent hardening: not run.
- Implementation authority: none.

AGE-1 has no remaining cross-contract name or ownership seam inside this
five-contract package. The next authorized milestone is the successor
constitutional baseline under a separate instruction. This record is not an
implementation plan.
