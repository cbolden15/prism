# Hermes → PNH pattern adoption report

**Date:** 2026-08-19
**Status:** Research report. This document recommends; it does not authorize implementation,
activation, or any change to the kernel plans. Verdicts here are candidate dispositions for
Caleb to accept or reject per pattern, consistent with the architecture doc's non-goals.

## Scope and method

Scope was set by direct interview before research began:

1. Re-evaluate all eight Hermes features the 2026-08-18 X1 follow-up plan rejected, this
   time against the PNH plugin architecture rather than the X1/Gate-E control plane.
2. Cover business agents (consulting business first, all functions), not only development.
3. Explore a graduated autonomy model for outward-facing actions.
4. Dig deepest on scheduling, self-improvement, and browser/computer use.
5. Output: ADOPT/IMITATE/REJECT per pattern plus a short suggested sequencing.

Sources: Hermes Agent releases v0.19.0 through v0.20.4 (v2026.8.18 — verified still the
latest as of this writing, matching the follow-up plan's pin), the current docs site
(fetched 2026-08-19: cron, goals, browser, computer use, bot mode, kanban, delegation,
code execution, webhooks, memory, skills, security, tool search, Google Workspace,
deliverable mode), the 2026-08-05 live subsystem audit
(`historical-agent-config/docs/specs/research/11-hermes-subsystem-audit.md`, against
0.20.0 on the mac mini), the Hermes intake, the PNH architecture doc, and the OpenHands
SDK intake.

Verdict vocabulary matches the follow-up plan: **ADOPT** = take the mechanism (behind PNH
contracts), **IMITATE** = take the pattern, reimplement inside PNH invariants, **REJECT** =
do not fold in. Every verdict below is constrained by the PNH security invariants: static
owner-approved plugin registry, brokers own all credentials, plugins narrow but never
expand authority, exact provider/model identity, fail-closed evidence, and no model-side
authorization of publication.

## What is already in flight (not re-litigated)

The 2026-08-18 follow-up plan already carries six Hermes-inspired patterns through its own
gate process: trusted completion policy, progressive tool disclosure (Tool Search),
read-only Code Mode, mechanical compaction anchors, proposal-routed learning, and the
lifecycle observer. This report does not reopen those; where new 0.20.x detail improves
them, it is noted inline as an amendment candidate.

## Part 1 — Re-evaluation of the eight rejected features

The X1 rejections were made against a control plane (Gate E/C3) that already owns
authority, budgets, and publication. PNH is a general harness whose consumers include
business agents with no Gate-E equivalent, so the calculus changes for several of them.

| # | Feature | X1 verdict | PNH verdict | PNH plugin mapping |
|---|---------|-----------|-------------|--------------------|
| 1 | Memory system | Reject | **IMITATE** | Context plugin (read) + proposal pipeline (write) |
| 2 | Skill auto-write / self-improvement | Reject | **IMITATE** | Proposal pipeline + trusted curator job |
| 3 | Smart approvals | Reject | **IMITATE (one-way valve only)** | Policy plugin |
| 4 | Provider fallback | Reject | **REJECT (broker-side credential rotation ADOPT)** | Broker internal |
| 5 | Dynamic plugins | Reject | **REJECT (admission scanning IMITATE)** | Registry tooling |
| 6 | Nested delegation | Reject | **IMITATE** | Kernel policy on task spawning |
| 7 | Dashboard | Reject | **IMITATE (read-only, later)** | Telemetry consumer |
| 8 | Scheduler (cron) | Reject | **ADOPT (as trusted task source)** | Consumer adapter |

### 1. Memory — IMITATE

What Hermes ships now: bounded curated memory (MEMORY.md + USER.md, capacity-managed,
substring-searchable), eight optional external providers (Honcho, Mem0, OpenViking, etc.)
that run alongside built-in memory, and — the important part — an independent
`write_approval` gate that stages memory and skill mutations for review instead of
committing them directly.

The X1 rejection was about conflict with the proposal-only learning rule and the Brain
layering. In PNH terms the conflict dissolves: memory *reads* are a Context plugin
contributing explicitly admitted context from an owner-curated store; memory *writes* are
proposals through the Task-6-style content-addressed pipeline. Hermes' own staging gate is
evidence the pattern works with writes decoupled from commits. What stays rejected:
autonomous, unreviewed memory writes and any external memory provider holding data the
broker didn't admit.

Business relevance: a consulting agent needs durable client context (rates, terms,
preferences, history). That is exactly an owner-curated context store read by a Context
plugin, with the agent proposing additions after each engagement.

### 2. Skill self-improvement — IMITATE

This is one of the three areas Caleb flagged. Hermes' closed learning loop has four parts:
autonomous skill creation from experience, skill self-improvement during use, the curator
(a background auxiliary-model job that prunes stale agent-created skills, consolidates
overlaps, archives with rollback, and never touches bundled/hub skills), and periodic
nudges to persist knowledge. 0.20.4 added NVIDIA SkillEvaluator Tier 1 advisory scanning
(license + security checks) on skill installs.

PNH bans model-authored *plugins* in production, but skills are data, not code with
authority. The loop maps cleanly:

- Skill drafts and skill edits are **proposals** (content-addressed, reviewed, promoted) —
  the pipeline the follow-up plan already builds.
- The curator becomes a **trusted maintenance job** over the approved skill registry:
  usage tracking, staleness detection, consolidation *proposals* (not silent mutation).
  Hermes' own guarantees (archives recoverable, auto-deletion never happens, pinning) are
  the right defaults.
- SkillEvaluator-style static scanning becomes an **admission gate at promotion time**.

What stays rejected: skills that execute at promotion, skills auto-promoted without review,
and self-modification of anything in the plugin registry.

### 3. Smart approvals — IMITATE, restricted to a one-way valve

Hermes' `approvals.mode: smart` lets a guardian LLM auto-approve risky commands, with
free-text `smart_policy` rules and unconditional `deny` globs evaluated before any bypass.
The 2026-08-05 audit found the decisive flaw: the approval system covers terminal commands
only, and `send_message_tool` (Telegram, Discord, Slack, WhatsApp, email) has zero approval
integration — a send-credentialed Hermes agent messages autonomously with no gate at all.

For PNH the split is:

- **REJECT**: any LLM with approval authority over outward actions. A model that can
  approve is a model that can be prompt-injected into approving.
- **IMITATE**: the LLM as a **one-way valve** — a classifier that may only *escalate* or
  *deny*, never approve. Approval authority lives in declarative policy (the PNH analog of
  `deny` globs, expressed as Policy plugins that narrow capability) and, above the
  autonomy threshold, in a human.
- **IMITATE**: `approvals.deny`-before-bypass ordering — hard denials evaluate before any
  autonomy level, including whatever "yolo" analog a dev mode has.

The send-tool gap is the strongest available validation of PNH's broker model: Hermes
bolted approvals onto tools and missed one; PNH routes every outward action through a
broker that cannot be bypassed because the worker never holds the credentials.

### 4. Provider fallback — REJECT stands, with one carve-out

PNH's invariants forbid substitution and fallback after authorization, full stop. Hermes'
fallback chain (auto-retry on a different model when the primary rate-limits) is exactly
what the invariant excludes.

Carve-out worth adopting: Hermes 0.20.0's credential pool does **reset-aware rotation
within the same provider/model identity** (stay on a fallback key until the rate-limit
window resets, then restore the primary). Rotating *credentials* for one exact route is a
broker implementation detail that never changes model identity, so it is compatible with
the invariant and useful for subscription-lane reliability. Task-level re-authorization
(a trusted flow issues a *new* grant for a different exact route when one is down) covers
the availability need without identity blur.

### 5. Dynamic plugins — REJECT stands; adopt the admission tooling

Nothing in 0.20.x changes the static-registry calculus; Hermes still installs plugins and
MCP servers at runtime. What is new and worth taking: plugin install security scanning
(0.20.3) and SkillEvaluator advisory scanning (0.20.4) as **registry admission tooling** —
trusted, offline checks run when Caleb approves something into the registry, not at task
time. Also worth taking as an implementation detail: the fingerprint-keyed on-disk MCP
tool-schema cache (0.20.0), which lets the Tool Search bridge serve schemas without booting
every server at session start.

### 6. Nested delegation — IMITATE

Hermes' delegation hardened considerably since the original rejection and now reads like a
capability-discipline case study: flat by default (`max_spawn_depth: 1`), nesting opt-in
per orchestrator role, leaf subagents blocked from `delegate_task`, `clarify`, `memory`,
`send_message`, and `cronjob`, toolsets inherited and not widenable per call, cancellation
follows session ownership, and only the final summary re-enters the parent context.

That is PNH's "plugins narrow, never expand" rule applied to task spawning. IMITATE as
kernel policy: a child task's capability grant is strictly a subset of its parent's, depth
is a policy limit, the tool-block list is a grant restriction, and cancellation is an
ownership property of the grant. The X1 rejection was about adding an uncontrolled
delegation layer under Gate E; a kernel-mediated spawn with monotonically narrowing grants
is a different thing and business agents will want it (research fan-out, per-client
workstreams).

### 7. Dashboard — IMITATE, read-only, later phase

Hermes ships a real dashboard/serve/desktop stack, hardened since June 2026 (loopback
default, real auth mandatory for public binds, `--insecure` a no-op) plus content-free
OTLP monitoring. The X1 rejection (control plane already owned by Gate E) doesn't apply to
observation. PNH already emits normalized telemetry events and evidence; a read-only
console is just another consumer of that stream. Verdict: IMITATE eventually — strictly
read-only, no verdict-write or task-create capability, same admission path as any consumer.
The Hermes hardening choices (loopback-first, auth-for-non-loopback, content-free
telemetry) are the right defaults to copy. Not a near-term item.

### 8. Scheduler — ADOPT as a trusted task source

The strongest reversal, and one of Caleb's three named interests. The X1 rejection was
"Gate E/C3 is the control plane"; PNH consumers (especially business agents) have no such
control plane, and a harness without a trigger layer can only ever be interactive.

What Hermes ships that is worth taking:

- One `cronjob` tool with action-style operations; natural-language scheduling in
  conversation. In PNH: the model may **propose** a schedule; a schedule becomes active
  only through owner approval or inside a pre-approved bounded envelope (see Part 3).
- Scheduler self-heal (0.20.3): EMFILE recovery, stale-claim reconciliation, wedged-job
  re-arm. Missed-fire surfacing (0.20.4). These are trusted-infrastructure behaviors PNH's
  scheduler should have from day one.
- **Continuable deliveries**: a cron result is fire-and-forget by default, but a job can
  opt into seeding its brief into a thread/DM session so a reply continues with context.
  Thread-per-run isolation for recurring jobs. This is the single best UX idea in the
  sweep for business agents (reply "chase it again but softer" to an invoice digest).
- Jobs can attach one or more skills; per-job delivery targets across platforms.

PNH shape: the scheduler is a **trusted consumer adapter** — a task source that submits
authorized task templates through normal admission, entirely outside the worker. The
worker never gains a "create standing job" capability directly; it gains "propose job",
and promotion is a policy decision. This mirrors, deliberately, the heal-stack pattern
already proven on the homelab (Alertmanager → dispatch → runbook → approval), and the X1
prohibition on new scheduled jobs stays intact because X1 is simply a consumer that
doesn't enable this adapter.

## Part 2 — New patterns not previously evaluated (0.19–0.20.4)

### Kanban durable task board — ADOPT the pattern

The sleeper hit of the sweep. Hermes kanban is a durable SQLite board shared across
profiles: atomic task claiming, parent→child dependencies, per-task model/provider
overrides, worker heartbeats, and a fully specified failure lifecycle — claim-TTL
reclamation, crash detection, `max_runtime` SIGTERM/SIGKILL with re-queue, stale detection
via heartbeat absence (explicitly *not* counted as worker fault), orphaned-card
reconciliation, retry counters, and a circuit breaker. Swarm topologies (workers →
verifier → synthesizer with a blackboard root card) commit atomically — readers see the
whole graph or none of it.

Two adoptions in one:

1. **The dispatcher event lifecycle** (spawned / heartbeat / reclaimed / crashed /
   timed_out / stale / reconciled) is a ready-made vocabulary for PNH's task evidence and
   the lifecycle observer. It answers at-most-once-execution questions the OpenHands
   intake flagged as unsolved.
2. **The board as business-ops backbone** — the 2026-08-05 audit left this as an open
   question; for the consulting business the answer is yes. Cards are leads, proposals,
   invoices, deliverables; dependencies are pipeline stages; the verifier/synthesizer
   topology is the review gate. In PNH the board is trusted state owned by the kernel
   side; workers interact through bounded tools (claim, progress, heartbeat, complete)
   that cannot forge another card's evidence.

### Goals: completion contracts and quality gates — fold into Task 2

The follow-up plan's completion policy (Task 2) predates the current goals doc. Three
mechanisms are worth folding in as amendments:

- **Quality gates**: a deterministic shell command must exit 0 before the LLM judge is
  even consulted; the gate's exit code and output tail become the continuation prompt.
  Deterministic evidence before model judgment is exactly PNH's ordering.
- **No-change replay**: a failed gate is not re-run if a git fingerprint shows the
  workspace unchanged — the recorded failure replays and the attempt counter advances. A
  stuck agent cannot burn wall-clock re-running an identical red suite.
- **Bounded gate retries with auto-pause** (default 3 retries, 5-minute timeout, then the
  goal pauses for a human).

One explicit divergence: Hermes' judge is **fail-open**. PNH completion must stay
fail-closed — a judge error is "not done", never "done". Keep the follow-up plan's zero
false-completion threshold.

### Bot Mode: named agents as configuration bundles — IMITATE

Bot Mode's design insight is that a "Bot" is not a new primitive — it is a profile:
isolated config, memory, skills, credentials, and history under one directory, with
routines as namespaced cron jobs and full CLI parity. The PNH translation: a named agent
is a **declarative bundle** = task template + exact model route + skill set + context
scope + capability manifest. No new runtime machinery; it is configuration over
primitives PNH already defines.

This is the packaging model for the business roster: `pipeline` (lead gen), `scribe`
(proposals/SOW), `ledger` (invoicing/bookkeeping), `concierge` (scheduling/client comms)
— each a reviewed bundle whose grants differ, not a fork of the harness. Group-chat
deliberation and the bot-to-bot teammate protocol (0.20.3) map onto existing multi-agent
debate patterns and are not harness features to build now; A2A v1.0 likewise stays out
until a real multi-node need exists — it broadens the attack surface for no current
consumer.

### Webhook trigger class — ADOPT as a trusted task source

The second half of the trigger layer. Hermes' webhook adapter: HTTP server, HMAC
signature validation per route (global secret as fallback), payload filters, script
transforms into agent prompts, prompt templates, and response routing back to the source
or to another platform. Named integrations include GitHub, GitLab, JIRA, and Stripe.

Same PNH shape as the scheduler: a trusted consumer adapter that validates, transforms,
and submits authorized task templates through admission. Business use is immediate:
Stripe `invoice.payment_failed` → dunning task; calendar webhook → prep brief; signed
form submission → lead-intake task.

### Computer use: the bounded capability manifest — IMITATE the mechanism broadly

Hermes 0.20.x integrates cua-driver for background desktop control with three immutable
launch modes, and the middle one is the important discovery: **bounded mode** takes a
capability manifest — apps, browser profile kinds, allowed origins, typed tools — that a
human reviews and approves once at launch; everything outside it fails closed inside the
driver; a missing or unreadable manifest fails loudly rather than silently downgrading;
modes cannot change after launch; logged-in browser profile access requires a separate
explicit grant that even yolo mode does not substitute for.

That is a complete, shipped implementation of the graduated-autonomy mechanism Part 3
proposes, and PNH should generalize it beyond computer use: reviewed-once, digest-pinned,
fail-closed capability manifests per task class, enforced by trusted code, immutable for
the task's lifetime. Computer use itself: high business value (portals with no API —
government sites, some client systems), high risk; defer the capability until the manifest
machinery exists, then admit it bounded-only.

### Browser automation — IMITATE, broker-shaped

Hermes browsers run as accessibility-tree snapshots with ref-ID interaction, multiple
cloud backends (Browserbase, Browser Use, Firecrawl), local CDP attach, per-task session
isolation, and auto-cleanup. The cloud modes are naturally broker-shaped: the browser
session lives remotely, the worker sees a bounded typed surface, and site credentials can
stay in the broker with the session. Local CDP attach to a logged-in daily-driver profile
is the risky variant — same treatment as computer use: bounded manifest, allowed origins,
read-only tiers first. Research-grade browsing (Tier 0, no login, no form submission) is
safe early; authenticated browsing waits for manifests.

### Smaller adoptions and rejections

| Pattern | Verdict | Note |
|---|---|---|
| Tool Search tier-1 listing mode | ADOPT into Task 3 | Keep the full name-level catalog visible, defer schemas only — Hermes' benchmarking showed listing mode matches eager task success; kills the discovery round trip that pure search costs. |
| MCP lazy schema cache | ADOPT into Task 3 | Fingerprint-keyed on-disk schema cache; no server boot at session start. |
| Deliverable mode | IMITATE | Generated files arrive as native attachments in the delivery channel, not paths. Consumer-adapter output behavior; matters for client-facing deliverables. |
| Sessions export | IMITATE, low priority | Markdown/HTML/trace exports with redaction pass. PNH evidence is already structured; add human-readable export formats when reporting needs them. |
| Office skills (docx/xlsx/pdf/pptx) | ADOPT as curated skill content | Owner-approved skill-registry entries; core for proposals, SOWs, invoices, spreadsheets. |
| Grounded citations / fact-check mode | IMITATE as skill + verifier node | Claims matched against actual page text; pairs with the existing verifier-node rules. Useful for contract review and client research. |
| Google Workspace integration | IMITATE, broker-split | Hermes holds OAuth tokens agent-side; PNH puts tokens in the broker and exposes typed operations (draft_email, send_email, read_sheet, create_event) so autonomy tiers can gate each verb separately. |
| Hooks / lifecycle events | Covered | PNH telemetry plugin kind already is this. |
| Heartbeat / recurring loops | Covered | Subsumed by completion policy + scheduler. |
| Mixture of Agents (/moa) | REJECT as harness feature | Judge-panel orchestration already exists as a workflow pattern; not core machinery. |
| A2A protocol | REJECT for now | Revisit if a genuine cross-node agent-to-agent need appears. |
| Voice, 20+ messaging platforms | Out of core | Consumer adapters, built per actual need. |

## Part 3 — Graduated autonomy for outward actions

The design question: business agents are outward-facing by nature, and per-action human
approval on everything makes them useless, while Hermes-style ungated sends are
disqualifying. The synthesis of the evidence gathered:

**Four tiers, declared per capability verb per task class:**

| Tier | Actions | Gate |
|---|---|---|
| 0 | Read-only: research, browsing (no login), reading mail/books/board state | None. Logged in evidence. |
| 1 | Internal writes: drafts in workspace, staged CRM records, categorized expenses, board card updates | None at action time; manifest-bounded; evidence + digest notification. |
| 2 | Reversible or low-blast-radius outward: calendar holds, internal status posts, thread replies within an existing engagement | Pre-approved envelope in a reviewed capability manifest (rate-limited, origin/recipient-scoped). |
| 3 | Irreversible outward: email to a client, invoice issuance, payment actions, contract or SOW dispatch, any new-recipient contact | Human approval per action or per reviewed batch. Broker executes; worker never holds the credential. |

**Mechanism (all pieces have shipped precedents):**

1. **Capability manifests** — per task class, owner-reviewed once, digest-pinned,
   immutable for the task lifetime, fail-closed and fail-loud (the cua-driver bounded-mode
   contract, generalized). The manifest is what makes Tier 1–2 autonomy safe *and* fast.
2. **Hard denials before everything** — declarative deny rules evaluated before any tier
   logic or dev-mode bypass (the `approvals.deny` ordering).
3. **One-way valve screening** — an LLM classifier may escalate a Tier 1–2 action to
   Tier 3 or deny it; it can never approve or de-escalate. Model judgment adds caution
   only.
4. **Broker execution** — every Tier 2–3 verb is a typed broker operation; the worker
   composes intent, the broker holds credentials and enforces the manifest. The Hermes
   send-tool gap is the standing proof that tool-side gating misses things and
   broker-side gating cannot be bypassed.
5. **Bake-review promotion** — a verb starts at Tier 3, and after N clean approved
   executions a review (the heal-stack `bake-review.sh` pattern, already proven on the
   homelab) proposes demoting it to Tier 2 for that task class. Promotion is an owner
   decision with evidence attached, never automatic. Demotion back up is one config edit.

This keeps the PNH invariant intact — no worker, plugin, model, or repository authorizes
publication — while making "publication" a graduated set of verbs rather than one cliff.

## Part 4 — Consulting business mapping

Each function becomes a named agent bundle (Part 2, Bot Mode pattern): task templates +
exact route + curated skills + capability manifest, riding the board (kanban pattern) with
scheduler/webhook triggers. Autonomy tiers per function:

| Function | Triggers | Tier 0–1 (autonomous) | Tier 2 (enveloped) | Tier 3 (approved) |
|---|---|---|---|---|
| Lead gen / outreach | cron (daily sweep), webhook (form intake) | Research targets, qualify, draft outreach, stage in CRM | Follow-up inside an existing thread | First-contact sends, sequence starts |
| Proposal / SOW drafting | board card, chat | Draft from templates + engagement context (office skills, grounded citations) | Share to internal review channel | Send to client, e-sign dispatch |
| Invoicing + chasing | Stripe webhooks, cron | Draft invoices, reconcile payments read-only, draft reminders | Reminder N within an approved dunning schedule | Invoice issuance, escalation emails, any payment action |
| Client status reporting | cron routine, continuable delivery | Compile from board evidence + repos | Post to internal channel; reply-driven revisions | Client-facing send (bake toward Tier 2 per client) |
| Contract review | board card | Clause extraction, risk flags, citation-grounded comparisons | — | Nothing: output is advice to Caleb, who decides |
| Bookkeeping / expenses | cron, bank/Stripe feeds via broker | Categorize into staging, flag anomalies, draft month-end summaries | — | Anything that books or moves money |
| Scheduling | msgraph/calendar webhooks, chat | Read calendars, propose slots | Tentative holds on own calendar | External invites and reschedules |

The continuable-delivery pattern does disproportionate work here: the morning
pipeline/invoice/status digests arrive as threads Caleb can reply into ("send #2, hold
#3, soften #4"), which turns Tier 3 approval from a chore into a one-reply batch review.

Vora, ChapterHQ, and Blockdaemon reuse the identical machinery later — different bundles,
manifests, and brokers (e.g. ChapterHQ Stripe live vs. consulting Stripe), zero new
harness code. That is the payoff of doing this as PNH plugins instead of one-off agents.

## Suggested sequencing

Ordering only; each phase gets its own plan and gates before anything is built.

1. **Contracts**: capability-manifest + autonomy-tier schemas, and the task-lifecycle
   event vocabulary (kanban-derived), alongside the existing kernel plan work.
2. **Trigger layer**: scheduler + webhook trusted task sources with proposal-gated job
   creation and continuable-delivery support in the lifecycle observer.
3. **Durable board**: kanban-pattern task state with the full failure lifecycle; wire
   evidence to it.
4. **First business bundles (Tier 0–1 only)**: broker-held Google Workspace + Stripe
   adapters with typed verbs; ship `ledger` (bookkeeping staging) and `pipeline`
   (research/qualify/draft) — nothing outward.
5. **Graduated outward**: one-way valve, Tier 2 envelopes, Tier 3 approval UX via
   continuable deliveries, bake-review promotion; then bounded-manifest browser and
   computer use.

## Source records

- [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs) (fetched 2026-08-19):
  cron, goals, browser, computer-use, bot-mode, kanban, delegation, code-execution,
  webhooks (messaging), memory, skills, security, tool-search, google-workspace,
  deliverable-mode, llms.txt index
- [Hermes releases v0.19.0–v0.20.4](https://github.com/NousResearch/hermes-agent/releases)
  (v2026.7.20 through v2026.8.18; v0.20.4 verified latest 2026-08-19)
- `historical-agent-config/docs/specs/research/11-hermes-subsystem-audit.md` (2026-08-05
  live audit, incl. the send-tool approval gap and iron-proxy status)
- `docs/plans/2026-08-18-x1-hermes-inspired-dsh-followup.md` (prior adopt/reject table,
  five exit gates, proposal pipeline)
- `docs/plans/provider-neutral-harness/architecture.md` (plugin kinds, security
  invariants, broker boundary)
- `docs/plans/provider-neutral-harness/intake-openhands-sdk-2026-08-19.md`
- `docs/ai/workstreams/20260818-homelab-setup-hermes-dsh-followup-a2a7cb/HERMES-INTAKE.md`
- Scope interview with Caleb, 2026-08-19 (this session)
