# D9 external-observability boundary amendment

Status: **draft for owner review**. The owner selected the proper D10
architecture on 2026-08-27. This record binds that selection to D9 for review;
it does not ratify D9 or D10 and authorizes no implementation.

This revision incorporates D10's governed experiment-submission path and the
ten Important hardening corrections. The hardening report remains bound to the
prior D10 blob; its Minor finding remains open.

Decision owners: D9 governed adaptation and D10 external observability.

---

## 1. Purpose

This amendment defines the only permitted interoperability boundary between an
external observability or evaluation backend and D9 governed adaptation.

Prism may export a safe derivative of committed evidence to a backend such as
Langfuse. D9 may submit one exact authorized candidate and dataset package
through a dedicated consumer-side gateway, then import the exact resulting
read-only experiment or score snapshot as untrusted evaluation evidence. No
direction conveys approval, resolver, promotion, or Prism runtime authority.

This is a boundary-only amendment. It deliberately leaves the D9 draft bytes
unchanged so the existing hardening report still identifies its exact target.
The two Critical and eight Important D9 findings remain unresolved and blocking.

---

## 2. Content-digest record

| Record | `git hash-object` digest |
|---|---|
| Ratified D1-D7 architecture | `04e8e79a8cb89186da7032b696e832e1cf2d994d` |
| Current D8 draft | `0b832517a6a6d79561f52400c1444c40c0a96c8f` |
| Current D9 draft, unchanged by this amendment | `9adc942fc629bfb04a30163c4348c01f1a692d5a` |
| D9 hardening report | `c1fadeefc7560d7aeea322b108aa0f47813f4c56` |
| Prior D10 draft reviewed by hardening | `54f8fa6f4b13f2205e78c48606c1be40235edf58` |
| D10 hardening report | `bf37144fc017e023f40d2f059ec85174651b14d8` |
| Amended D10 draft referenced by this amendment | `6db3ac85fd71897fff3f57987dcefae513e557a4` |

These are Git blob identities computed from the exact working-tree files. The
D8, D9, D10, and both boundary documents remain unratified working-tree
artifacts. A digest records bytes; it does not grant legal, constitutional,
execution, evaluation, or promotion authority.

Any D10 change after this record requires updating the amended D10 digest here
before owner review. Any D9 reconciliation creates a new D9 digest and must
state how each binding rule below was incorporated.

---

## 3. Binding boundary decisions

### 3.1 External telemetry is derivative, not D4 evidence

D4's committed evidence chain and terminal result remain authoritative. A
Langfuse trace, OpenTelemetry span, score, annotation, dashboard, alert, or
experiment cannot complete, fail, reject, reopen, retry, or otherwise settle a
Prism run.

D10 export begins only after a D4 record commits and its checkpoint verifies.
External storage never repairs missing evidence or becomes the only copy of a
required proof or receipt.

### 3.2 D9 imports an exact snapshot, never a live object

D9 may accept external evaluation evidence only through D10's read-only adapter.
The imported bundle must bind:

- exact backend adapter and instance identity;
- exact project and object identity;
- immutable native object version or stable canonical snapshot bytes and digest;
- exact candidate or baseline subject digest resolved locally;
- exact evaluator code/config digest;
- exact dataset item-set digest;
- exact governed-submission authorization and receipt when the candidate or
  dataset originated locally;
- complete pagination, filtering, sampling, and truncation evidence;
- all item and aggregate scores, including failures and missing results; and
- the API/schema version and retrieval receipt.

`latest`, mutable labels, dashboard aggregates, screenshots, copied scores,
partially fetched pages, and unresolved aliases fail closed.

If the backend does not expose an immutable native version, the adapter must
perform two complete canonical reads after the experiment is terminal. The
object set, pagination boundary, update metadata, and digest must match before
it creates the local snapshot. Concurrent mutation or unstable ordering fails.

### 3.3 External evidence is input, never instruction or authority

Imported prompt text, annotations, evaluator prose, model judgments, tool
output, and metadata remain untrusted content. They cannot become instructions
for the importer, evaluator, reviewer, owner channel, resolver, or promotion
pipeline merely because Langfuse or another backend stored them.

A backend score or experiment result may satisfy only the evidence slot named
by a pinned D9 charter. It cannot serve as:

- constitutional proof;
- a hard-constraint waiver;
- independent review;
- readable owner approval;
- a pure resolver decision;
- a destination-write receipt; or
- promotion authority.

### 3.4 Prompt management does not become a Prism prompt plane

No active or future Prism run fetches a canonical prompt by Langfuse name,
label, environment, cache entry, or `latest` version. Updating a Langfuse prompt
or deployment label has no Prism effect.

Backend prompt bytes may be used only as isolated experimental candidate input
after D9 retrieves the exact bytes, creates a local content digest, stores them
in quarantine, scans them, and binds them to an admitted charter. The backend's
prompt identity, score, label, or deployment state grants nothing.

Write-capable Langfuse MCP, CLI, skill, agent, webhook, evaluator, and generic
API operations remain outside Prism execution principals and outside the D9
trusted promotion path. The sole exception is the narrow experiment-submission
gateway below, which is a separate consumer service principal and has no prompt
or promotion methods.

### 3.5 Experiment submission is governed staging, not promotion

For locally produced D9 candidate or dataset content, only D10's
`ExperimentSubmissionGateway` may create external dataset, dataset-item,
experiment, or score objects that later satisfy a charter's
governed-submission evidence slot. A human UI action, generic SDK, agent, CLI,
MCP server, webhook, or untracked API call cannot substitute for this path.

Before egress, a credential-free pure authorizer must bind an admitted charter,
owner-ratified external-data policy, exact candidate, dataset, evaluator, and
final-package digests, independent scan receipts, exact backend adapter and
project, object-kind allowlist, limits, expiry, and one-time operation ID. The
gateway runs under a dedicated owner-domain service principal, re-verifies the
staged package, and holds a separately scoped credential or method-allowlisting
proxy. It cannot choose or transform bytes, choose or run an evaluator, fetch or
label a prompt, write a canonical adaptation destination, approve, resolve, or
promote.

The gateway records an immutable receipt that binds the authorization and
package to exact external object IDs, versions, item counts, response class,
and reconciliation result. A possible write followed by acknowledgement loss
must be reconciled by exact operation and object identity before retry. The
read-only adapter must match the imported snapshot to this receipt before D9
may claim that the external experiment evaluated the submitted package.

### 3.6 D9 cannot learn directly from sampled production telemetry

Operational trace sampling may omit successful runs or portions of a workload.
D9 may treat sampled telemetry as a learning signal, but it cannot claim the
sample is a complete, representative, or adversarial evaluation set.

Production traces become evaluation items only through a separately governed
curation step that proves eligibility, removes or synthesizes sensitive
content, records inclusion and exclusion criteria, assigns dataset roles, and
freezes exact item bytes under a dataset snapshot digest.

### 3.7 Backend availability never changes Prism routing or authority

An exporter, collector, backend, or external evidence adapter outage cannot:

- block D1-D8 execution or D4 settlement;
- select a different provider, route, model, prompt, evaluator, or backend;
- trigger a retry of a model or outward effect;
- weaken D9 evidence or approval requirements; or
- fall back to a moving external object.

If a D9 charter requires external evidence and that exact evidence is
unavailable, mutable, incomplete, or uncertain, the candidate remains
quarantined or is rejected.

### 3.8 D9 hardening remains blocking

This amendment does not resolve any existing D9 hardening finding. In
particular, D10 depends on D9 being corrected so:

- the owner approves a safe deterministic rendering of the actual candidate
  content, not only its digest;
- quarantine permits isolated noncanonical evaluation while forbidding active
  or canonical loading;
- rollback has no undefined bypass;
- secret scanning has an independent promotion-time control;
- the candidate lifecycle resolves `ambiguous` explicitly;
- prior Task 6 scope is amended or preserved deliberately;
- approved output enters the existing Brain or `agent-config` promotion
  pipeline instead of a parallel direct writer;
- D8 emits generic artifacts and D9 performs consumer-side packaging; and
- future-run guarantees match the version-pinning support of each destination.

D10 Plan M3 cannot begin until those corrections are incorporated into a new D9
digest and verified against the current hardening report.

---

## 4. Required D9 reconciliation changes

When D9 is amended, its new bytes must incorporate this boundary in the
following places:

| D9 section | Required change |
|---|---|
| Status and Section 2 | Cite D10 and this boundary without treating either as ratified early; preserve D4/D7 ratification as a Plan M1 prerequisite. |
| Section 8.1 | Include external traces, scores, annotations, experiments, and prompt bytes in “evidence is input, never instruction.” |
| Section 9 | Place the pure submission authorizer, gateway, and read-only external evidence adapter outside the public kernel and outside all trusted promotion components. |
| Section 13 | Bind the submission target, egress policy, operation, exact package, scans, receipt, external object, dataset snapshot, evaluator, subject, API/schema, completeness, limits, and sampling identities in the charter and evaluation bundle. |
| Section 14 | Require reviewers to treat imported backend prose and scores as untrusted evidence. |
| Section 17 | Store immutable submission authorization/receipt and canonical imported snapshot digests, not a moving backend link as sole evidence. |
| Section 18 | Add ungoverned submission, possible-write uncertainty, unavailable, mutable, incomplete, oversized, limit-breaching, mismatched, and uncertain external evidence as fail-closed cases. |
| Section 19 | Add only the pure submission-authorizer, exact gateway, and read-only evidence interfaces; do not give D9 a generic backend client. |
| Section 20 | Preserve “score is not authority” and add exact-submission, exact-snapshot, and streaming-limit requirements using valid enforcement kinds. |
| Section 21 | Gate governed submission and external-evidence import on D10 Plan M3, reconciled D9 schemas, and owner-ratified external-data policy. |
| Sections 22 and 23 | Prohibit runtime prompt fetching and add ungoverned egress, sampling, secret leakage, credential, replay, resource-exhaustion, backend-compromise, and mutable-object risks. |

This amendment does not itself edit the D9 draft because doing so would detach
the existing hardening report from the bytes it reviewed.

---

## 5. Public-kernel and dependency boundary

The D1-D7 architecture receives two additive seams only after an owner-ratified
D4/D7 amendment: one backend-neutral read-only projection contract over
committed D4 evidence, and one dedicated owner-bound exporter-principal class
authenticated to that contract through OS peer credentials and daemon ACLs. It
gains no:

- Langfuse package or schema;
- OpenTelemetry collector or backend credential;
- prompt-management client;
- evaluator, score, dataset, or experiment authority;
- experiment-submission gateway or write credential;
- D9 candidate or promotion contract; or
- callback from an observability backend into settlement.

The D10 projector, alias-key custodian, collector configuration, Langfuse
adapter, submission authorizer, experiment-submission gateway, external
evidence reader, deployment target, credentials, retention policy, and D9
canonicalizer remain consumer-side. The gateway has no D4 access and does not
add another D1-D7 seam.

Every exporter principal, projection reader, alias key, collector receiver and
pipeline, submission gateway, backend project, and external reader is bound to
one authenticated Prism owner domain. Routing derives from the authenticated
transport identity, never payload claims. No external object or alias may
correlate, submit, or import across owner domains.

---

## 6. Deployment boundary

The architecture selection does not select a deployment host.

The current homelab NUC is documented at 16 GB RAM, while the current Langfuse
self-hosted stack requires several services whose published minimums exceed
that capacity in aggregate. A production deployment there is not authorized.

The remaining proper targets are:

1. a dedicated or measured-capacity X1 deployment for real redacted traces; or
2. Langfuse Cloud for synthetic or proven-redacted data after external data,
   retention, and credential custody approval.

Plan M1 uses a local no-network OTEL sink and therefore requires neither target.

---

## 7. Ratification requirements

The owner may ratify this boundary only together with or after reviewing D10.
Ratification means:

1. D4 remains the only authoritative run evidence source.
2. Observability export is read-after-commit and one-way.
3. The D4 read contract and exporter-principal class are explicit D1-D7 seams
   that require a separate owner-ratified D4/D7 amendment before Plan M1.
4. Only the pure authorizer and dedicated gateway may submit locally produced
   experiment content, and the gateway cannot write prompts or canonical
   adaptation destinations.
5. Langfuse is a replaceable consumer backend, not a Prism authority service.
6. D9 imports only exact immutable read-only snapshots under streaming limits.
7. Scores, prompts, annotations, labels, and experiments never confer proof,
   approval, resolver, or promotion authority.
8. Runtime prompt fetching from Langfuse is prohibited.
9. The deployment target remains a separate owner decision.
10. The current D9 hardening findings remain blocking.

Recorded owner decision:

- **Status:** architecture selected for drafting; ratification pending
- **Date:** 2026-08-27
- **Owner:** Vora Technologies, LLC
- **Decision:** OTEL collector plus redaction, Langfuse backend, governed
  experiment-submission gateway, and read-only D9 evidence adapter. No
  deployment target selected.

Ratification authorizes incorporating this boundary into a corrected D9 draft
and authoring Plan M after D10 review. It does not authorize implementation,
installation, external transmission, service deployment, evaluation,
promotion, destination writes, provider calls, push, publication, or public
claims.
