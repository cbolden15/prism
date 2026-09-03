# Prism Harness external-observability interoperability design specification (D10 draft)

Status: **draft for owner review**. The owner selected the proper architecture
on 2026-08-27: a provider-neutral OpenTelemetry path, redaction before external
export, Langfuse as a replaceable backend, a separately privileged governed
experiment-submission gateway, and a read-only D9 evidence adapter. This
selection authorizes drafting only.

This draft was amended on 2026-08-27 to address the Critical and ten Important
findings in the hardening report. That report remains bound to the prior D10
blob `54f8fa6f4b13f2205e78c48606c1be40235edf58`; its Minor estimate-citation
finding remains open.

Decision owner: D10 external observability and evaluation-evidence
interoperability.

This document does not authorize implementation, package installation, service
deployment, a live provider call, external data transmission, destination
access, D9 promotion, push, publication, or a public support claim.

---

## 1. Purpose

Prism has authoritative settlement and evidence, but operators also need to see
how runs behave across time: which step was slow, which route was expensive,
where a tool failed, whether a candidate improved a pinned evaluation, and
whether a regression appeared after a change.

That is an observability problem. It is not a new authority system.

D10 defines three bounded consumer-side paths. The first projects
already-committed Prism evidence into OpenTelemetry, applies a default-deny data
policy, and sends the safe projection to an optional backend such as Langfuse.
The second submits an exactly authorized experimental candidate and dataset
package through a separately privileged gateway. The third retrieves the exact
created experiment or score snapshot as untrusted D9 evaluation evidence.

The core rule is:

> An observability backend may describe what happened. It cannot decide what
> happened, what is allowed, what becomes canonical, or what gets promoted.

---

## 2. Source of truth and precedence

Precedence for this document, highest first:

1. The ratified D1-D7 architecture specification,
   `2026-08-26-prism-harness-architecture-design-spec.md`.
2. The ratified invariant law and proof-status amendment,
   `2026-08-27-invariant-law-proof-status-amendment.md`.
3. The D8 and D9 drafts, their hardening reports, and the D8-D9 boundary
   amendment. None is treated as ratified merely because D10 references it.
4. `2026-08-27-prism-harness-d9-external-observability-boundary-amendment.md`.
5. This document.

Where a higher source conflicts with D10, the higher source wins. D10 cannot
weaken admission, owner-domain isolation, effect permits, settlement,
constitutional proof, release authority, or D9 promotion requirements.

---

## 3. Decision summary

1. **D4 remains authoritative.** Telemetry is derived only from committed,
   checkpoint-verified evidence. A trace is never settlement evidence merely
   because a backend stored it.
2. **Export is read-after-commit.** A read-only evidence projection reader sits
   outside D4's write transaction. Langfuse, an OpenTelemetry collector, or an
   exporter can never delay, approve, reject, or rewrite settlement.
3. **OpenTelemetry is the interoperability contract.** Public Prism code gains
   no Langfuse SDK, Langfuse schema, prompt client, evaluator client, or backend
   credential.
4. **Privacy is default-deny.** The projector emits a small closed schema. Raw
   prompts, responses, tool payloads, repository content, paths, credentials,
   private endpoints, and unapproved artifact bytes are absent before data
   reaches the collector.
5. **Redaction has two layers.** The projector enforces a typed allowlist. The
   collector independently allowlists and redacts before any external export.
   A redaction failure drops telemetry and never falls back to unredacted data.
6. **Langfuse is replaceable.** It is one consumer-side backend adapter. Its
   unavailability or removal cannot make the harness nonconforming.
7. **External evaluation is untrusted input.** D9 may import an immutable
   snapshot of an exact experiment, dataset, evaluator, and score bundle. It
   may not import `latest`, a mutable deployment label, or an evaluator's claim
   as proof or promotion authority.
8. **Experiment submission is a governed outward effect.** Only a dedicated
   consumer-side gateway may write an authorized candidate and dataset package
   to an external experiment store. A pure authorizer, exact digests,
   owner-ratified egress policy, one-time operation identity, independent scans,
   and an immutable receipt bind every submission.
9. **Prompt management is outside the runtime authority path.** Langfuse-hosted
   prompts may be experimental candidate material only. Active Prism runs never
   fetch canonical prompts from Langfuse.
10. **Deployment is a separate decision.** The current 16 GB homelab host is not
   an admitted production target for the documented Langfuse stack. X1 or cloud
   placement remains pending capacity, privacy, retention, and operations
   review.

---

## 4. Position in the program

D10 is cross-cutting but not first-release authority. Its implementation series
is Plan M and does not enter Plans A through L.

```text
Plan D: durable settlement and evidence
              |
              v
Plan M1: committed-evidence projection and OTEL conformance
              |
              v
Plan M2: redacted Langfuse observability pilot

Plan K: D8 work programs             Plan L1: D9 evidence contracts
              |                                  |
              +----------------+-----------------+
                               v
                 Plan M3: governed experiment submission
                 and read-only evaluation-evidence import
```

Plan M1 cannot begin until Plan D exposes a supported committed-evidence read
contract and the exporter principal is ratified. Plan M2 depends on M1 and a
separately approved backend target. Plan M3 depends on the reconciled and
ratified D9 evidence schema plus an owner-ratified external-data policy; the
current D9 hardening findings remain blocking.

The earlier estimate of one to three days describes one synthetic,
non-production end-to-end pilot after these seams exist. It is not an estimate
for completing D1-D10, hardening a self-hosted Langfuse deployment, or enabling
D9 promotion.

---

## 5. Scope

D10 covers:

- a read-only, checkpoint-verifying projection contract over committed D4
  evidence;
- deterministic conversion from typed evidence to a closed telemetry schema;
- stable run, program, task, operation, and content aliases suitable for an
  external backend;
- OpenTelemetry trace export through a local collector;
- collector-side allowlisting, redaction, bounded buffering, sampling, and
  backend routing;
- a Langfuse backend adapter for traces, sessions, observations, costs, and
  evaluation views;
- a governed, separately credentialed path for submitting exact experimental
  candidate and dataset packages;
- backend failure, retry, replay, deletion, and retention semantics;
- an exact, read-only external evaluation snapshot adapter for D9; and
- proof obligations showing that observability cannot become authority.

---

## 6. Non-goals

D10 does not add:

- a second settlement ledger, evidence chain, audit log, or source of terminal
  truth;
- direct reads from D4's SQLite tables or any private implementation module;
- raw transcript, prompt, response, source, stdout, stderr, tool payload,
  provider payload, path, hostname, private endpoint, credential, or secret
  export;
- model, provider, plugin, route, grant, budget, evaluator, or destination
  selection based on backend availability;
- runtime prompt fetching, prompt caching, deployment-label resolution, or
  prompt promotion through Langfuse;
- write-capable Langfuse MCP, CLI, skill, API, or agent access inside a Prism
  execution principal;
- untracked human, agent, UI, CLI, MCP, SDK, or API upload of candidate or
  dataset content that D9 later treats as admissible external evidence;
- automatic creation of D9 candidates from sampled traces;
- use of a score, annotation, judge result, dashboard, alert, or experiment
  result as constitutional proof, owner approval, resolver output, or promotion
  authority;
- observability-driven retry of a provider or outward effect;
- a production Langfuse deployment on the current homelab NUC; or
- implementation of D8, D9, or Plan M.

---

## 7. Vocabulary

| Term | Meaning |
|---|---|
| Observability plane | Consumer-side components that project committed Prism evidence into telemetry and optional external backends. It has no Prism authority. |
| Evidence projection reader | A supported read-only D4 contract that returns only committed, checkpoint-verifiable evidence pages. It does not expose the settlement database. |
| Telemetry projector | A deterministic component that converts allowed evidence fields into a closed, backend-neutral telemetry batch. |
| Telemetry policy | A pinned closed schema, classification table, aliasing rule, redaction rule, sampling rule, and size bound. |
| Content alias | A keyed, versioned pseudonym derived from a canonical internal identifier or digest. It permits local correlation without exporting the source value. |
| Export cursor | Consumer-side progress over committed evidence sequence numbers. It grants no write authority over D4. |
| OTEL collector | A local OpenTelemetry collector that receives OTLP, applies independent policy, and routes accepted telemetry to one or more backends. |
| Exporter principal | A dedicated owner-domain consumer service principal that alone may call `EvidenceProjectionReader` and submit projected telemetry to its bound collector receiver. It is not a Prism execution principal. |
| Observability backend | A replaceable store and UI, such as Langfuse, that receives the safe telemetry projection. |
| Experiment submission manifest | A backend-neutral, content-addressed package binding one admitted D9 charter, exact candidate, dataset, evaluator, target project, permitted object kinds, egress policy, limits, and one-time operation ID. |
| Experiment submission authorizer | A credential-free pure consumer component that either rejects a manifest or returns an exact authorization after verifying the charter, owner-ratified egress policy, package digest, and independent scan receipts. |
| Experiment submission gateway | A dedicated owner-domain consumer service principal that holds one project-scoped submission credential and executes only an exact authorized manifest. It cannot choose content, run an evaluator, approve, resolve, or promote. |
| Experiment submission receipt | An immutable local record binding authorization, operation, package, external object IDs and versions, outcome, and reconciliation state. |
| External evidence reference | An exact backend adapter, project alias, object kind, object ID, API/schema version, and version or immutable snapshot identity. Never `latest`. |
| External evaluation snapshot | Canonical bytes containing an exact experiment, dataset item set, evaluator/config identity, subject binding, scores, and retrieval receipt. |
| External evidence adapter | A read-only consumer component that fetches and canonicalizes one exact external evaluation snapshot for D9. |
| Backend prompt | Prompt bytes stored by an observability backend. They are not canonical Prism prompts and have no runtime authority. |

---

## 8. Design principles

### 8.1 Evidence first, telemetry second

D4 commits the run, terminal state, and evidence checkpoint before D10 can see
the record. Telemetry cannot repair missing D4 evidence or make an incomplete
run complete.

### 8.2 Pull across the authority boundary

The observability plane pulls committed records through a narrow read contract.
D4 never calls Langfuse and never runs backend code inside settlement. This
keeps backend latency, credentials, retries, and failure outside the authority
root.

### 8.3 Minimize before redacting

The projector starts from an allowlist rather than copying an event and deleting
known bad fields. Redaction is defense in depth after minimization, not the
primary control.

### 8.4 Correlation is not identity authority

Trace IDs, span IDs, session IDs, baggage, tags, and backend object IDs are
diagnostic labels. D1-D9 never use them to authenticate a caller, locate an
owner domain, admit a run, consume a permit, settle a result, validate proof, or
promote a candidate.

### 8.5 External evaluation is a snapshot

An external object may be edited, rescored, relabeled, deleted, or served under
a changing API. D9 therefore consumes one canonical snapshot and its digest,
not a live backend object.

### 8.6 Deletion does not rewrite Prism history

Derivative telemetry may expire or be deleted under backend policy. D4's
authoritative evidence remains governed by its own retention and deletion
rules. A backend deletion is never evidence that a Prism event did not occur.

---

## 9. Target topology and trust boundaries

```text
Prism authority plane                         consumer observability plane
---------------------                         ----------------------------
D1 admission
     |
D2 custody ---- D3 broker
     |              |
     +------ D4 settlement + evidence
                       |
                       | committed, checkpoint-verified pages only
                       v
              EvidenceProjectionReader  <---- read-only public contract
                       ^
                       | authenticated owner-bound exporter principal
                       v
              TelemetryProjector -----> owner-bound OTEL collector
              closed projection         complete-envelope policy
                                                  |
                                         +--------+--------+
                                         |                 |
                                         v                 v
                                    Langfuse          future backend
                                         ^
                                         | exact authorized package only
                                         |
D9 admitted charter -> pure submission authorizer
                               |
                               v
                  ExperimentSubmissionGateway
                  separate principal + credential
                                         |
                                         | exact read-only snapshot
                                         v
                                ExternalEvidenceAdapter
                                         |
                                         v
                                 D9 evidence intake
                                         |
                              quarantine and owner gates
```

The arrows are one-way at each trust boundary. No backend has a callback into
admission, settlement, the provider broker, proof registration, owner approval,
or promotion resolution.

Two additive D1-D7 seams require an owner-ratified D4 and D7 amendment before
Plan M1. The first is `EvidenceProjectionReader`, a supported read contract over
the D4 deep module. The second is the dedicated exporter-principal class and
its OS-authenticated binding to that contract. Neither seam exposes SQL,
transactions, mutable records, private artifact bytes, or backend concepts.
The experiment-submission path is consumer-side D9 infrastructure and has no D4
access, so it does not add a third D1-D7 seam.

Each reader instance is authenticated and bound to one owner domain and one
exporter principal. The D4 daemon derives both from OS peer credentials and a
per-owner socket or equivalent daemon ACL; it never trusts owner identity in a
read request. D4 rejects cross-domain cursors and pages. Alias keys, collector
receivers and pipelines, backend projects, submission gateways, and external
evidence readers are bound to the same owner domain so telemetry cannot become
a cross-owner correlation channel.

---

## 10. Supported interfaces

Exact schemas belong to Plan M. These sketches establish ownership:

```ts
interface EvidenceProjectionReader {
  readCommitted(input: {
    afterSequence: bigint;
    limit: number;
    expectedCheckpoint?: string;
  }): Promise<CommittedEvidencePage>;
}

interface TelemetryProjector {
  project(
    page: CommittedEvidencePage,
    policy: TelemetryPolicy,
  ): TelemetryProjection;
}

interface TelemetryExporter {
  export(batch: TelemetryBatch): Promise<TelemetryExportReceipt>;
}

interface ExperimentSubmissionAuthorizer {
  authorize(input: ExperimentSubmissionAdmission):
    | AuthorizedExperimentSubmission
    | RejectedExperimentSubmission;
}

interface ExperimentSubmissionGateway {
  submit(
    authorization: AuthorizedExperimentSubmission,
  ): Promise<ExperimentSubmissionReceipt>;
  reconcile(operationId: string): Promise<ExperimentSubmissionReceipt>;
}

interface ExternalEvaluationEvidenceReader {
  fetchExact(ref: ExternalEvidenceRef): Promise<ExternalEvidenceSnapshot>;
}

interface ExternalEvidenceCanonicalizer {
  canonicalize(
    snapshot: ExternalEvidenceSnapshot,
    policy: ExternalEvidencePolicy,
  ): ImportedEvaluationBundle;
}
```

`EvidenceProjectionReader` verifies sequence continuity and the D4 checkpoint
before returning a page. It exposes only record families and fields permitted by
the public evidence contract. The caller does not submit an owner-domain ID;
the daemon derives it from the authenticated exporter principal and filters the
page before it crosses the read boundary.

The projector is pure for the same evidence page and policy digest. The exporter
receives only projected telemetry. The experiment-submission authorizer is pure
and credential-free. It verifies an admitted charter, owner-ratified egress
policy, exact source and package digests, target adapter and project, object-kind
allowlist, expiry, size limits, one-time operation ID, and independent secret
and content-policy scan receipts. Authorization fails closed on any mismatch.

The gateway runs as a dedicated owner-domain service principal, can read only
the content-addressed submission staging area, re-verifies the package and scan
receipts immediately before egress, and holds a credential distinct from both
the OTLP ingest and read-only import credentials. It may invoke only the exact
dataset, dataset-item, experiment, and score methods named by the authorization.
If the backend credential is broader, a method-allowlisting egress proxy is
mandatory. The gateway uses the operation ID as its local idempotency key,
reconciles an uncertain write before retry, and emits an immutable receipt. It
cannot change package bytes, select a target, fetch or label a prompt, choose or
run an evaluator, approve, resolve, or promote.

The external evidence reader has read-only network authority for one admitted
backend and project. It accepts only external object identities bound by a
successful submission receipt when D9 relies on locally submitted content.
The canonicalizer has no network or destination authority.

If a backend cannot provide an enforceable read-only credential, its reader must
sit behind a method-allowlisting proxy that permits only the exact read API. If
neither control is available, the backend is inadmissible for D9 evidence
import.

---

## 11. Trace and span model

The backend-neutral mapping is:

| Prism concept | OpenTelemetry projection | Langfuse view |
|---|---|---|
| One admitted run | One trace with a root run span | Trace |
| D8 `programId`, when present | Root-span program alias | Session correlation |
| Policy, admission, launch, model turn, tool operation, verification, settlement | Child spans or span events under the run trace | Observations |
| Provider observation | Generation-shaped span with allowed route and usage fields | Generation observation |
| Tool receipt | Tool-shaped span with operation class and status, never raw arguments or output | Tool observation |
| Terminal state | Root-span status and closed terminal attribute | Trace outcome |
| D9 experiment snapshot | Separate experiment correlation with exact subject alias | Experiment and scores |

The mapping does not add session semantics to the public kernel. A D8
`programId` remains a consumer correlation identity. Langfuse's session object
does not become a Prism object.

Parentage comes from trusted run and operation relationships in committed
evidence, never from caller-supplied trace headers. Missing or inconsistent
parentage produces a projection error and no invented relationship.

---

## 12. Telemetry schema and data classification

Every field is classified before implementation:

| Class | Treatment |
|---|---|
| `telemetry-safe` | May be projected after type, length, and vocabulary validation. |
| `local-correlation` | Replaced with a keyed content alias before projection. |
| `local-only` | Never leaves authoritative or separately governed local storage. |
| `secret` | Never enters the projection. A detection causes field or batch rejection under policy. |

The initial `telemetry-safe` surface is limited to:

- schema, service, release, execution-class, and environment versions;
- closed run, lifecycle, effect, and terminal status values;
- monotonic sequence and attempt counters within bounded ranges;
- timestamps and durations already admitted by the evidence schema;
- route class, provider ID, model ID, and normalized token/cost telemetry when
  their disclosure policy permits them;
- closed operation and plugin-kind labels;
- boolean proof of receipt presence, cleanup state, ambiguity, and policy
  rejection class; and
- backend-neutral error classes that contain no raw message.

The initial `local-correlation` surface includes owner domain, run, program,
task, plugin, operation, artifact, candidate, and content-digest identities.
Each becomes:

```text
alias = HMAC-SHA-256(key[telemetry-alias-key-version], canonical-value)
```

The owner-domain-specific key and canonical value stay local. The alias key is
a credential-equivalent secret. The key version is recorded in the local
projection receipt. Rotation creates new aliases and does not silently join old
and new identities.

The following are always `local-only` or `secret`:

- prompts, messages, completions, model reasoning, transcripts, and backend
  prompt bodies;
- tool arguments, tool output, stdout, stderr, provider payloads, and retrieved
  documents;
- source code, repository content, diffs, filesystem paths, home paths,
  hostnames, private endpoints, and raw artifact references;
- credentials, API keys, session tokens, cookies, authorization headers,
  environment values, OpenTelemetry exporter headers, telemetry alias keys,
  and local alias maps;
- personal data not covered by a separate owner-ratified collection policy; and
- raw constitutional proof artifacts, owner approval content, and D9 candidate
  bytes.

Unknown fields are rejected. They are never stringified into a generic
`metadata` map.

This classification governs telemetry projection. Candidate, dataset, and
evaluator bytes remain prohibited from telemetry. They may cross the separate
experiment-submission boundary only when the exact content-addressed package is
authorized under Section 10; that exception never permits those bytes in OTLP.

### 12.1 Alias-key custody

Each owner domain has a distinct alias-key ring governed as follows:

1. A cryptographically secure generator creates at least 256 bits inside the
   owner-domain secret store. Key bytes never enter arguments, environment
   variables, logs, evidence, telemetry, or backup manifests.
2. The active key is encrypted at rest in an OS-protected or owner-domain secret
   store and is readable only by the bound exporter principal. Other consumers
   use a narrow local alias-resolution contract and never receive key bytes.
3. A non-secret registry records key ID, version, owner domain, algorithm,
   creation time, state (`active`, `retired`, `compromised`, or `destroyed`),
   retirement time, and destruction receipt.
4. The initial maximum key age is 90 days. Rotation also occurs immediately on
   suspected exporter/projector compromise, owner-domain transfer, ACL failure,
   or secret-store restore. A new key is active before any further export.
5. Retired keys remain encrypted only for the pinned replay and local
   reconciliation window, then are destroyed. Backups are encrypted under a
   separate recovery key, restore only into the same owner domain and ACL, and
   force rotation before export resumes. Local alias mappings follow the
   owner-ratified evidence-import retention policy and are never exported.

---

## 13. OpenTelemetry transport and collector policy

Prism emits OTLP to a collector inside the selected local trust boundary. The
collector is the only component allowed to hold a telemetry-backend ingest
credential. The experiment-submission gateway holds a different credential and
cannot use the OTLP pipeline.

The initial policy requires:

1. One collector process, receiver, pipeline, and backend project per owner
   domain. The local default is a Unix socket with restrictive ownership for
   exactly one exporter principal. A cross-host receiver requires mTLS with a
   distinct client identity for that principal. Plain or server-TLS-only
   listeners are prohibited.
2. Receiver and backend-project selection derives only from the authenticated
   socket or mTLS peer identity. OTLP resource attributes, aliases, headers, and
   baggage never choose an owner domain, pipeline, or project.
3. Each authenticated principal has pinned request, decompressed-payload, span,
   rate, concurrency, batch, memory, retry, and durable-queue limits. A limit
   failure is isolated to that principal and cannot evict another owner's data.
4. A complete closed OTLP-envelope schema is enforced at receiver ingress, not
   only an attribute allowlist.
5. Independent redaction and secret-pattern rejection run after schema
   validation and before backend export.
6. Stable trace and span IDs identify one logical projection batch. Replay
   behavior follows the backend admission profile in Section 15 and never
   assumes that IDs imply backend deduplication.
7. Deterministic sampling uses the local run alias, with all `failed`,
   `rejected`, and `ambiguous` terminal runs retained when policy and capacity
   permit.
8. Explicit drop, partial-acceptance, duplicate-uncertainty, and policy-failure
   counters contain no dropped or rejected data.
9. Logs and metrics remain disabled until each signal receives its own closed
   envelope schema.

A shared collector is outside the initial profile. A later shared deployment
requires an owner-ratified isolation amendment that preserves distinct client
identities, server-side identity-to-pipeline/project routing, per-principal
queues and limits, and negative A-to-B and B-to-A injection and exhaustion
tests.

For traces, the initial complete-envelope schema pins resource and scope schema
URLs, allows only fixed resource keys and instrumentation scope name/version,
uses closed span and event-name vocabularies, accepts only the defined span
kind, parentage, timestamps, status code, and allowed attributes, and bounds
every string, list, event count, attribute count, and batch count. Status
descriptions are empty. Tracestate and links are absent. Event attributes use a
separate closed allowlist. Unknown resource, scope, span, event, status, link,
or tracestate content rejects the batch; it is never sanitized into generic
metadata. If the selected collector distribution cannot enforce the whole
envelope, Plan M must add a narrow admission processor or proxy before the OTLP
receiver and prove the same behavior.

Conformance fixtures place prohibited data in every envelope location,
including resource and scope fields, span and event names, status description,
span and event attributes, links, tracestate, and schema URLs. Each fixture
must be rejected before a backend credential can be used.

Redaction fails closed for export. If the collector cannot prove the outgoing
batch satisfies policy, it drops the batch. This fail-closed behavior applies
to telemetry transmission only. Prism execution and settlement remain
available because observability is not in their critical path.

OpenTelemetry baggage is empty by default. Trace context may correlate trusted
internal components, but Prism clears untrusted incoming baggage and never
propagates internal baggage to providers or other untrusted external services.

---

## 14. Export, retry, and recovery semantics

The exporter stores a consumer-side cursor and projection receipt. The
collector uses a durable owner-bound queue and receipt index. Neither writes D4
state.

```text
read committed evidence page
        |
        v
verify checkpoint and project deterministically
        |
        v
send stable OTEL batch + batch digest
        |
        v
collector validates entire envelope
        |
        v
durably enqueue + issue owner-bound receipt
        |
        +----> exporter advances D4-derived cursor
        |
        v
backend delivery: delivered | partial | failed | unknown
        |
        v
durable delivery or gap receipt under backend admission profile
```

The collector receipt binds the authenticated owner and exporter principal,
policy digest, telemetry batch digest, exact D4 evidence range, accepted and
rejected counts, durable queue identity, and receipt time. Its closed states are
`durable-accepted`, `partial`, `failed`, and `unknown`. A transport success or
in-memory enqueue is not `durable-accepted`.

The exporter advances its D4-derived cursor only on a verified
`durable-accepted` receipt for the exact batch and evidence range. On an unknown
collector acknowledgement it queries the durable receipt index by owner and
batch digest before any replay. Startup reconciliation compares D4 ranges,
exporter projection receipts, collector queue receipts, and terminal backend
delivery or gap receipts. Missing or conflicting links stop export and surface
a local fault.

The collector owns backend delivery after durable acceptance. OpenTelemetry
partial success is recorded as `partial`, including rejected counts and the
whole affected batch range, and is not retried because OTLP forbids retrying a
populated partial-success response. A known failure retries only when the
protocol classifies it as retryable and the bounded policy allows it. An unknown
backend acknowledgement replays only for a backend admitted as
`idempotent-replay`; for `at-most-once-uncertain`, it records `unknown` and a
local telemetry gap rather than risking duplicate data.

The D4 evidence ledger remains the recoverable source, while the collector's
bounded durable queue covers the interval after cursor advance. Export lag and
delivery uncertainty are visible local operational state. No unbounded outbox
is permitted.

| Failure | Required result |
|---|---|
| D4 checkpoint mismatch | Export nothing; operator-visible local fault |
| Unknown evidence field | Reject projection page; do not stringify or bypass policy |
| Alias-key unavailable | Export nothing; do not fall back to raw identifiers |
| Collector unavailable | Prism continues; cursor does not advance |
| Redaction or policy processor failure | Drop or reject telemetry; never send unredacted batch |
| Collector acknowledgement lost | Reconcile the durable receipt by owner and batch digest before replay or cursor advance |
| Backend partial success | Record the affected batch and rejected count as partial; do not retry the partial request |
| Backend timeout or lost acknowledgement | Replay only under `idempotent-replay`; otherwise record unknown delivery and a local gap |
| Retry budget exhausted | Record a local gap and lag receipt; never retry a Prism effect |
| Backend deletion or retention expiry | No change to D4 evidence or settlement |
| Exporter or projector compromise | Revoke backend credential, rotate the alias key, mark old aliases compromised, quarantine old alias mappings, rebuild from committed evidence under the new key, and reconcile before export resumes |

No telemetry failure changes a run state, consumes a dispatch permit, retries a
provider call, weakens evidence requirements, or selects a different backend.

---

## 15. Langfuse adapter rules

Langfuse is admitted only as an `ObservabilityBackend` implementation.

Every backend adapter declares and proves one delivery profile:

- `idempotent-replay`: replaying an identical batch upserts or deduplicates by
  stable trace and span ID, and duplicate-batch conformance tests produce one
  visible observation and unchanged aggregates; or
- `at-most-once-uncertain`: the backend does not provide that guarantee, so an
  unknown acknowledgement is never retried and every affected batch remains
  visibly uncertain in local receipts.

An adapter may not infer replay safety from stable IDs. Langfuse v4's published
data model states that re-ingested trace and observation IDs can create
duplicates rather than updates, so its default D10 profile is
`at-most-once-uncertain` unless the exact selected deployment passes a later
deduplication conformance test. D10 makes no exactly-once telemetry claim for
that profile.

Allowed capabilities:

- ingest redacted OTLP traces;
- display trace, span, generation, tool, cost, latency, and status projections;
- group run traces by an aliased D8 program identity;
- store experimental datasets, exact experiment runs, annotations, and scores
  only through the governed submission path below; and
- serve exact objects through the read-only external evidence adapter.

Prohibited capabilities in the Prism runtime path:

- fetching a prompt by name, label, environment, or `latest`;
- using Langfuse client caching as Prism prompt version pinning;
- changing a prompt deployment label to affect an admitted or future Prism run;
- allowing a Langfuse skill, CLI, MCP server, agent, evaluator, webhook, or UI
  action to call a Prism owner-approval or promotion interface;
- treating Langfuse project roles as Prism owner-domain roles;
- storing backend API credentials in plugins, task definitions, evidence, or
  trace attributes; and
- querying or modifying Langfuse's underlying PostgreSQL or ClickHouse schema
  directly.

### 15.1 Governed experiment submission

For locally produced D9 candidate or dataset content, the
`ExperimentSubmissionGateway` is the only component permitted to create or
modify external dataset, dataset-item, experiment, or score objects. Objects
created through a human UI, generic SDK, agent, CLI, MCP server, webhook, or
untracked API call cannot satisfy the corresponding governed-submission slot in
a D9 charter.

The path is:

1. D9 freezes candidate, dataset, evaluator, and submission-package bytes and
   records their exact digests. Dataset curation or synthesis occurs before
   this freeze; the gateway never silently changes experiment semantics.
2. Independent secret and content-policy scanners inspect the final package.
   Any redaction or deterministic transformation creates new bytes and a new
   digest that the charter and manifest must bind.
3. The pure authorizer validates the admitted charter, owner-ratified external
   data policy, target adapter and project, allowed object kinds, exact source
   and package digests, scan receipts, limits, expiry, and one-time operation
   ID.
4. The dedicated gateway re-verifies the authorization and staged package,
   consumes the operation ID in its local anti-replay ledger, and invokes only
   the allowlisted backend methods with its separately scoped credential.
5. A known pre-write rejection records no external effect. After a possible
   write, acknowledgement loss triggers read-side reconciliation by exact
   operation and object identity before any retry; blind retry is prohibited.
6. The gateway records an immutable receipt with authorization and package
   digests, target identity, exact external object IDs and native versions,
   item counts, response class, and reconciliation result.
7. The external evidence reader must match the later snapshot to that receipt
   before D9 can claim the external experiment evaluated the submitted package.

The submission credential is project-scoped and separate from the collector
ingest and evidence-reader credentials. If native credential scopes also permit
prompt management, project administration, deletion, or unrelated writes, a
method-allowlisting proxy must block those methods. If neither native scope nor
proxy can enforce the object-kind boundary, the backend is inadmissible for
governed submission.

A prompt version stored in Langfuse may enter an isolated D9 evaluation only
after exact bytes are fetched, content-addressed, scanned, and bound as
quarantined candidate input. Its Langfuse name, label, score, or deployment
state grants no authority.

---

## 16. Read-only D9 evaluation-evidence import

The external adapter accepts an owner- or charter-pinned reference:

```ts
interface ExternalEvidenceRef {
  backendAdapterDigest: string;
  backendInstanceAlias: string;
  projectAlias: string;
  objectKind: "experiment" | "experiment-item-set" | "score-set";
  objectId: string;
  expectedNativeVersion?: string;
  snapshotPolicyDigest: string;
  apiSchemaVersion: string;
  expectedSubjectAlias: string;
  expectedEvaluatorDigest: string;
  expectedDatasetSnapshotDigest: string;
  limitsDigest: string;
}

interface ExternalEvidenceLimits {
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxPages: number;
  maxItems: number;
  maxFieldBytes: number;
  maxNestingDepth: number;
  perRequestDeadlineMs: number;
  totalDeadlineMs: number;
}
```

The admitted charter pins `limitsDigest` to exact limits no greater than the
owner-domain operator maxima. The reader checks response headers when present,
counts compressed and decompressed bytes while streaming, and applies page,
item, field-length, nesting-depth, per-request, and total-deadline limits before
canonical-byte persistence or full-object construction. It never buffers an
unbounded response. Any breach stops retrieval and emits a bounded fail-closed
receipt containing only the limit class, configured maximum, observed bounded
counter, exact reference digest, and time; attacker-controlled response text is
excluded.

The object ID must be exact. Empty, label-based, date-relative, search-result,
or `latest` references fail closed. When the backend exposes an immutable
native version, `expectedNativeVersion` is required and must match. When it
does not, the pinned snapshot policy requires two complete canonical reads
after the experiment is terminal. Both reads must return the same object set,
pagination boundary, update metadata, and digest before the adapter creates the
local immutable snapshot. Each read independently enforces the pinned limits.
Any concurrent mutation or unstable ordering fails.

The imported bundle records:

- the exact external reference and adapter digest;
- retrieval time and authenticated backend-instance alias;
- canonical response bytes and digest;
- every dataset item identity and the canonical dataset snapshot digest;
- exact evaluator code/config identity and digest;
- exact candidate or baseline subject binding resolved through the local alias
  map;
- item-level and aggregate scores, including failed and missing items;
- sampling, filtering, pagination, and truncation evidence;
- external annotations distinguished from deterministic measurements;
- an import receipt and independent local schema-validation result; and
- any uncertainty that prevents the bundle from satisfying a D9 charter.

The adapter follows pagination to the charter-pinned page and item limits and
proves whether the snapshot is complete. A dashboard aggregate, sampled trace
view, manually copied score, or UI screenshot is not a complete evaluation
bundle.

The reader requests metadata and typed scores only unless the charter and data
policy explicitly require item inputs or outputs. Any required content enters
an external-evidence quarantine, passes independent secret and content-policy
scanning, and never enters a reviewer or evaluator prompt as instructions.
Flagged secret-bearing bytes are rejected and handled by D9's required secure
purge and tombstone rule rather than retained in ordinary deduplication storage.

Imported bytes remain untrusted. D9's scanner, evaluator-integrity checks,
independent review, readable owner approval, pure resolver, and existing
promotion pipeline remain separate. A positive score is never sufficient.

If required external evidence is unavailable, mutable, incomplete, mismatched,
or uncertain, the candidate remains quarantined or rejected. D9 does not fall
back to another project, evaluator, dataset, provider, model, or latest version.

---

## 17. Sampling, datasets, and objective integrity

Operational traces may be sampled. D9 evaluation datasets may not silently
inherit that sample and call it representative.

Before production traces become dataset items, a separate curation step must:

- prove the source run and evidence eligibility;
- remove or synthesize sensitive content under a ratified policy;
- record inclusion and exclusion criteria;
- deduplicate against every previously seen item;
- assign evaluation, holdout, or adversarial role before candidate work;
- freeze exact item bytes and ordering under a dataset snapshot digest; and
- keep holdout content inaccessible to candidate generators where the charter
  requires it.

Langfuse may store and display this dataset snapshot only after the governed
submission path binds it to an exact manifest and receipt. It is not the
canonical identity merely because it is hosted there. The D9 charter binds the
local snapshot digest, submission receipt, and exact external object reference.

Online evaluators are useful for finding possible regressions. Their findings
are learning signals, not deterministic truth. A promotion decision requires
the admitted offline evaluation and every hard constraint named by D9.

---

## 18. Deployment boundary and capacity decision

Langfuse's current self-hosted architecture uses web and worker containers,
PostgreSQL, ClickHouse, Redis or Valkey, and S3-compatible object storage. Its
published minimums exceed the current homelab NUC's documented 16 GB RAM when
considered as one production stack.

Deployment options remain:

| Option | Use | Current decision |
|---|---|---|
| Dedicated or capacity-verified X1 self-host | Real redacted traces kept inside owner infrastructure | Proper private-data target, pending measured capacity, storage, backup, upgrade, and isolation review |
| Langfuse Cloud | Synthetic or proven-redacted pilot with low operational overhead | Allowed only after external-transmission and retention approval |
| Current 16 GB homelab NUC | Full production Langfuse stack | Rejected unless later measurements and an explicit owner amendment prove a supported profile |
| No Langfuse, local OTEL test sink | Contract and privacy verification | Required first backend for Plan M1 |

No plan may infer a deployment target from the D10 architecture selection. A
deployment decision must bind the host, capacity evidence, data classes,
retention, backups, encryption, network exposure, upgrade procedure, and
rollback.

---

## 19. Authority matrix

| Component | May | May not |
|---|---|---|
| D4 evidence module | Commit authoritative evidence and expose verified read pages | Call a telemetry backend or trust backend data |
| Evidence projection reader | Return committed allowed evidence pages | Mutate D4, expose SQL, or return private artifact bytes |
| Exporter principal | Authenticate to its owner-bound D4 read contract and collector receiver | Act as a Prism execution principal, claim an owner in payload data, read another owner, or hold submission credentials |
| Alias-key custodian | Generate, store, rotate, back up, restore, and destroy one owner-domain key ring under Section 12.1 | Export key bytes, share a key across owners, or grant key access beyond the exporter principal |
| Telemetry projector | Produce deterministic closed telemetry | Add generic metadata or backend authority |
| OTEL collector | Authenticate one exporter principal, enforce the full envelope, durably queue, redact, sample, and export | Route by payload identity, call Prism authority interfaces, hold a submission credential, or send a policy-failed batch |
| Experiment submission authorizer | Purely validate one exact manifest against admitted charter, egress policy, and scans | Hold credentials, change bytes, make a network call, approve, resolve, or promote |
| Experiment submission gateway | Submit and reconcile one exact authorized package with a scoped credential and immutable receipt | Choose content, target, evaluator, prompt label, approval, resolver result, or promotion |
| Langfuse | Store and display derivative telemetry and gateway-submitted experiments | Settle runs, admit work, approve, resolve, promote, or become canonical storage |
| External evidence reader | Fetch one exact admitted external object | Write backend data, resolve `latest`, or choose an evaluator |
| External canonicalizer | Validate and content-address a snapshot | Treat a score as proof or promotion authority |
| D9 evaluator/reviewer | Consume an admitted imported bundle as evidence | Trust backend identity, choose canonical state, or promote |
| Owner approval channel | Approve exact readable D9 candidate content | Delegate approval to Langfuse, a judge, or a metric |

---

## 20. Proposed invariants

These are D10-local proposal IDs. They do not enter Plan A's PNH-INV-01 through
PNH-INV-46 baseline. Constitutional IDs require a later owner-ratified successor
baseline and collision review with D8 and D9.

| ID | Statement | Enforcement kind |
|---|---|---|
| D10-INV-01 | No telemetry backend, collector, exporter, trace context, span, score, annotation, alert, or dashboard can admit, authorize, settle, prove, approve, resolve, promote, publish, or retry Prism work. | `runtime-adversarial` |
| D10-INV-02 | No observability component imports, reads, writes, or reaches settlement storage except through the supported read-only evidence projection contract. | `static-structure` |
| D10-INV-03 | Exported telemetry satisfies the complete pinned OTLP-envelope schema; raw prompts, payloads, content, paths, private endpoints, credentials, status descriptions, links, tracestate, and unknown fields are absent before backend export. | `runtime-adversarial` |
| D10-INV-04 | Collector redaction or policy failure drops telemetry and never falls back to unredacted export, while backend failure cannot change Prism terminal state or repeat an outward effect. | `runtime-adversarial` |
| D10-INV-05 | Public Prism packages contain no Langfuse dependency, schema, credential, prompt resolver, evaluator client, deployment label, or backend-specific authority path. | `static-structure` |
| D10-INV-06 | Every D9 external evaluation import binds exact canonical snapshot bytes, backend adapter and instance identity, dataset snapshot, evaluator digest, subject digest, completeness evidence, and API/schema version; moving or `latest` references fail closed. | `runtime-adversarial` |
| D10-INV-07 | No external score, experiment, evaluator, annotation, prompt version, or deployment label is sufficient constitutional proof, D9 owner approval, resolver output, or promotion authority. | `runtime-adversarial` |
| D10-INV-08 | Trace and baggage values are diagnostic only, are sanitized at trust boundaries, and are never used as Prism authentication, owner-domain, admission, permit, settlement, proof, or promotion identity. | `runtime-adversarial` |
| D10-INV-09 | Projection reads only committed checkpoint-verified evidence through the authenticated owner-bound exporter principal; alias keys, collector routing, backend projects, submission gateways, and readers never join or accept a claimed identity from another owner domain. | `runtime-adversarial` |
| D10-INV-10 | A locally produced candidate or dataset reaches an external experiment store only through a pure exact-manifest authorization and the dedicated gateway; its credential and receipt can never fetch a runtime prompt, approve, resolve, write a canonical adaptation destination, or promote. | `runtime-adversarial` |

---

## 21. Plan M: external observability interoperability

Plan M is optional and outside the ratified D1-D7 first-release path.

### Milestone M1: committed-evidence projection and OTEL conformance

Scope:

- supported D4 `EvidenceProjectionReader` contract;
- owner-ratified D4/D7 exporter-principal and OS peer-authentication amendment;
- in-memory and durable reader conformance over committed checkpoints;
- closed complete-envelope schema and classification policy;
- deterministic projector, governed alias-key custody, trace/span mapping, and
  cursor;
- per-owner authenticated local OTLP collector, durable queue and receipts, and
  a no-network test sink; and
- adversarial tests for D10-INV-01 through D10-INV-05, D10-INV-08, and
  D10-INV-09.

Exit gate: one synthetic local and one synthetic provider-shaped run project to
stable traces; every prohibited envelope-field fixture fails before backend
export; A-to-B and B-to-A owner injection and queue-exhaustion tests fail; the
cursor advances only after a durable owner-bound receipt; startup reconciliation
detects a removed or conflicting receipt; collector outage leaves D4 results
unchanged; and no external network call occurs.

### Milestone M2: redacted Langfuse pilot

Scope:

- separately approved Langfuse target, ingest credential custody, and network
  egress policy;
- explicit `idempotent-replay` or `at-most-once-uncertain` backend profile;
- Langfuse OTLP backend configuration in the collector;
- synthetic-data privacy, outage, replay, retention, deletion, and upgrade
  rehearsal;
- trace, D8 program, tool, generation, cost, latency, and terminal-state views;
- current-tree and emitted-payload secret scans; and
- backend removal test proving Prism remains conforming.

Exit gate: one synthetic end-to-end run is useful in Langfuse and contains none
of the prohibited fields. Duplicate-batch replay produces one visible
observation and unchanged aggregates before an `idempotent-replay` profile is
approved. An `at-most-once-uncertain` profile instead proves that unknown
acknowledgements are not retried and are visible in local receipts. Backend
deletion changes no D4 evidence or Prism effect.

### Milestone M3: governed submission and read-only D9 evaluation-evidence import

Scope:

- pure experiment-submission authorizer, content-addressed staging, dedicated
  gateway principal, scoped credential or method proxy, anti-replay ledger,
  reconciliation, and immutable submission receipts;
- exact read-only API or method-allowlisting proxy;
- external evidence reference and snapshot schemas;
- charter-pinned compressed/decompressed, page, item, field, nesting, and
  deadline limits with streaming enforcement;
- dataset, evaluator, subject, pagination, completeness, and score bindings;
- native-version or double-read stability enforcement;
- canonicalization and immutable import receipts;
- external-content quarantine, secret scanning, purge, and tombstone behavior;
- isolated prompt-candidate experiment support without runtime prompt fetching;
- integration with the reconciled D9 evidence intake; and
- adversarial tests for D10-INV-06, D10-INV-07, and D10-INV-10.

Exit gate: the gateway submits one exact synthetic candidate and dataset package
and its receipt matches the content-addressed D9 evaluation bundle imported by
the reader. Ungoverned objects, forbidden write methods, acknowledgement-loss
blind retry, mutated, incomplete, differently scored, wrong-project,
wrong-dataset, wrong-evaluator, cross-owner, secret-bearing, oversized,
compression-bomb, over-deep, deadline, unstable double-read, and `latest`
references fail. Even a passing score cannot invoke approval or promotion.

---

## 22. Main risks and controls

| Risk | Control |
|---|---|
| Raw prompts or secrets leak into traces | Typed default-deny projector, aliasing, collector allowlist, independent redaction, emitted-payload scan |
| OTLP sender spoofs another owner or floods a shared queue | One owner-bound collector receiver by default, peer-authenticated server-side routing, per-principal limits, bidirectional negative tests |
| Alias key leaks or survives compromise | Credential-equivalent custody, per-owner key rings, 90-day maximum age, event rotation, encrypted backup, destruction receipts, compromised-alias quarantine |
| Backend becomes a second source of truth | D4-only authority, read-after-commit projection, derivative-data labels, no callback path |
| Observability outage blocks work | Pull-based exporter outside settlement, bounded retries, local lag receipt |
| Collector acknowledges before durable custody | Cursor advances only on a durable owner- and batch-bound receipt; startup reconciles D4, exporter, queue, and delivery records |
| Backend replay creates duplicate observations | Explicit backend delivery profile; tested dedupe for replay or no retry after unknown acknowledgement with visible uncertainty |
| Retry duplicates an external provider effect | Export replays committed evidence only with stable telemetry IDs; it never calls D3 or D4 effect APIs |
| Forged trace headers influence identity | Ignore untrusted parentage, clear baggage, derive relationships from committed evidence |
| Sampling hides regressions | Preserve explicit sample policy; retain terminal faults where possible; prohibit completeness claims from sampled telemetry |
| Mutable external experiment is treated as fixed | Exact snapshot, canonical digest, complete pagination, evaluator and dataset binding, no `latest` |
| Langfuse prompt management bypasses D9 | No runtime prompt client; prompt bytes re-enter quarantine as exact candidate content |
| Candidate or dataset reaches Langfuse through an ungoverned path | Pure exact-manifest authorization, independent final-package scans, dedicated gateway and principal, scoped methods, anti-replay ledger, immutable receipt |
| Backend credential enables broad writes | Separate ingest, submission, and read credentials; method proxies where native scopes are broader; no credential in Prism execution principals |
| Malicious external evidence exhausts the reader | Charter-pinned byte, decompression, page, item, field, depth, and deadline limits enforced while streaming |
| Self-hosting overwhelms the current NUC | Current target rejected; verify X1 or approve cloud before deployment |
| Backend deletion erases perceived history | D4 remains canonical; deletion receipt affects derivative telemetry only |
| Vendor lock-in | OTLP contract, backend-neutral schema, Langfuse adapter outside public Prism packages, backend removal test |

---

## 23. Verification criteria for this document

D10 is ready for ratification only when:

1. D4 evidence remains the sole authoritative source and export is visibly
   read-after-commit.
2. The two additive D1-D7 seams are the bounded read-only projection contract
   and its dedicated OS-authenticated exporter-principal class; their D4/D7
   amendment is explicit and no backend callback enters the public kernel.
3. Collector ingress binds authenticated peer identity to exactly one owner,
   receiver, pipeline, and project with per-principal limits and cross-owner
   negative tests.
4. Alias-key generation, storage, access, rotation, retention, backup, restore,
   destruction, and compromise response are closed and owner-bound.
5. The complete OTLP envelope is closed, classified, size-bounded, and free of
   every raw field prohibited by D4.
6. Cursor advance requires durable collector custody, startup reconciliation is
   defined, partial success is not retried, and backend replay behavior matches
   a tested admission profile.
7. Collector policy failure is fail-closed for transmission and fail-open for
   Prism availability.
8. Trace context and baggage have no authority role.
9. Langfuse prompt management, agents, MCP, CLI, deployment labels, and scores
   cannot affect an admitted or future canonical Prism prompt.
10. Locally produced experiment content can reach the backend only through the
    pure authorizer and dedicated gateway, and the immutable submission receipt
    matches the later read-only snapshot.
11. D9 imports exact immutable external snapshots and rejects moving references,
   incomplete pagination, or mismatched subject, dataset, evaluator, project,
   and schema identity.
12. External evidence limits are charter-pinned and enforced while streaming
    before persistence or full buffering.
13. Sampling limits are explicit and sampled telemetry cannot satisfy a
   completeness claim.
14. The current NUC is not implied as the deployment target.
15. Every current D8 and D9 hardening blocker remains visible and unresolved
    unless separately amended and verified.

---

## 24. Hardening reconciliation record

The amendment addresses the surviving findings in report order without
changing the hardening report bytes:

| Report order | Finding | Amended sections |
|---|---|---|
| Critical | No governed candidate/dataset submission path | 1, 3, 5-7, 9-10, 12, 15-17, 19-23 |
| Important 1 | Collector ingress lacks authenticated owner/principal binding | 9, 13, 19-23 |
| Important 2 | Alias-key custody is undefined | 7, 12.1, 19, 22-23 |
| Important 3 | Compromise recovery omits alias-key rotation | 12.1, 14, 22 |
| Important 4 | Exporter principal is undefined | 7, 9-10, 19, 21, 23 |
| Important 5 | Dataset `train` role is ungrounded | 17 |
| Important 6 | Backend replay safety is assumed | 13-15, 21-23 |
| Important 7 | D10-INV-02 mixes enforcement kinds | 20 |
| Important 8 | Collector acknowledgement can lose telemetry | 13-14, 21-23 |
| Important 9 | Collector policy omits OTLP envelope fields | 13, 20-23 |
| Important 10 | External reader has no pre-buffer limits | 16, 21-23 |

The Minor dangling estimate-citation finding remains open and is not represented
as closed by this amendment.

---

## 25. Source records

Local architecture records:

- `2026-08-26-prism-harness-architecture-design-spec.md`
- `2026-08-26-prism-harness-goal-execution-design-spec.md`
- `2026-08-26-prism-harness-goal-execution-design-spec.hardening.md`
- `2026-08-27-prism-harness-d8-governed-adaptation-boundary-amendment.md`
- `2026-08-27-prism-harness-governed-adaptation-design-spec.md`
- `2026-08-27-prism-harness-governed-adaptation-design-spec.md.hardening.md`

External references reviewed on 2026-08-27:

- [OpenTelemetry handling sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/)
- [OpenTelemetry collector configuration security](https://opentelemetry.io/docs/security/config-best-practices/)
- [OpenTelemetry collector authenticator extensions](https://opentelemetry.io/docs/collector/extend/custom-component/extension/authenticator/)
- [OpenTelemetry collector processors](https://opentelemetry.io/docs/collector/components/processor/)
- [OpenTelemetry context-propagation security](https://opentelemetry.io/docs/concepts/context-propagation/)
- [OpenTelemetry OTLP specification](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry OTLP exporter specification](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)
- [Langfuse observability setup](https://langfuse.com/docs/observability/get-started)
- [Langfuse masking guidance](https://langfuse.com/docs/observability/features/masking)
- [Langfuse experiments API](https://langfuse.com/docs/api-and-data-platform/features/experiments-api)
- [Langfuse datasets](https://langfuse.com/docs/evaluation/experiments/datasets)
- [Langfuse trace and observation update semantics](https://langfuse.com/faq/all/tracing-data-updates)
- [Langfuse access control](https://langfuse.com/docs/administration/rbac)
- [Langfuse prompt management](https://langfuse.com/docs/prompt-management/overview)
- [Langfuse self-hosted architecture](https://langfuse.com/handbook/product-engineering/architecture)
- [Langfuse self-hosted scaling](https://langfuse.com/self-hosting/configuration/scaling)

---

## 26. Owner ratification record

Before Plan M authoring, the owner should record one of:

- **Ratified:** accept D10 and its D9 boundary amendment.
- **Ratified with amendments:** name each changed section and selected option.
- **Not ratified:** return to design review.

Recorded owner decision:

- **Status:** architecture selected for drafting; ratification pending
- **Date:** 2026-08-27
- **Owner:** Vora Technologies, LLC
- **Decision:** Provider-neutral OTEL collector plus redaction, Langfuse backend,
  governed experiment-submission gateway, and read-only D9
  evaluation-evidence adapter. Deployment target remains undecided.

Ratification authorizes writing Plan M only. It does not authorize
implementation, installation, external transmission, service deployment,
provider calls, D9 evaluation or promotion, push, publication, or public
claims.
