# Prism repository experience recommendations

- Date: 2026-09-03
- Scope: public repository content, onboarding, architecture communication, and community health
- Repository state reviewed: `main` at `2a7506211d8edec5c98085092715629b5aa338a6`

## Recommendation

Prism should lead with one clear promise: it is a provider-neutral TypeScript runtime for bounded, inspectable agent runs with pluggable providers, policies, and tools.

The repository already has the right technical proof for a strong first impression. A user can install the CLI, run a deterministic workflow without a provider account, and inspect a local result. The main problem is presentation. The root README asks readers to process a long project-plugin workflow before it gives them a current architecture, package map, or reason to choose Prism.

The best next release-facing change is a documentation pass with three outcomes:

1. A shorter README that moves from value to first success to architecture.
2. A current architecture section with five focused diagrams.
3. A small set of runnable examples and compatibility information that separates shipped behavior from optional assurance work.

Do not use the superseded architecture plan as the public architecture page. Build the public explanation from current packages, current execution paths, and current limitations.

## What Prism already gets right

- The deterministic CLI path requires no provider account, model download, daemon, or Docker after installation.
- The preview status and exact Node.js and npm versions are stated plainly.
- Security language is unusually honest. Approval binds identity and reviewed bytes, but does not make a plugin safe. The normal project-plugin path has ambient subprocess authority and is not a hostile-code sandbox.
- `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, issue forms, a pull request template, CODEOWNERS, release notes, provenance material, and package READMEs already exist.
- Public package ownership is mostly clear: SDK contracts, Runtime execution, CLI configuration and persistence, and the Ollama adapter.

These strengths should stay. The work is mainly information hierarchy, architecture communication, and filling a few specific gaps.

## Verified gaps

### 1. No current public architecture page

`docs/architecture/` contains only `.gitkeep`. The nearest general architecture document, `docs/plans/provider-neutral-harness/architecture.md`, says it is superseded and retained as historical context. `docs/developer-preview/concepts.md` explains parts of the current system, but there is no page that shows how those parts work together.

This is the largest evaluation gap. A developer should not need to interpret historical plans or the constitution to understand the shipped preview.

### 2. The root README has the wrong reading order

The README is 194 lines. Roughly 120 lines are devoted to the complete project-plugin example before the documentation map appears. That example is useful, but it belongs in a task-focused guide or `examples/` directory. The root should establish the product, prove the first run, show the architecture, and route each reader to the next page.

The current root also omits direct links to support, security, contributing, package documentation, and a current architecture page.

### 3. Two source-checkout commands skip the required build

`pnh/README.md` tells users to run `npm ci` and then `npm run prism:example`. That script executes `packages/cli/dist/deterministic/run-local-text-stats.js`, but `dist/` is not tracked and no install lifecycle builds it.

This was reproduced from a clean Git archive with Node.js 26.8.1 and npm 11.19.0. `npm ci` succeeded, then `npm run prism:example -- "one two three"` exited 1 with `MODULE_NOT_FOUND` for the unbuilt file.

Add `npm run build:packages` to that documented source flow, or point the reader to the installed CLI route. Add a test that runs the exact documented sequence from a clean archive.

`CONTRIBUTING.md` has the same underlying problem. It tells documentation contributors to run `npm run test:compat:run` after `npm ci`, but the `:run` script assumes package output already exists. The command failed after a clean install. The self-contained `npm run test:compat` command built the packages and passed all 99 compatibility tests. Contributor documentation should name the self-contained command.

### 4. Integration and compatibility guidance is thin

The Runtime README shows the shape of `runAgent`, but its `provider`, `policy`, and `tools` values are undefined. It reads like copyable code even though it is an API sketch. Supply a complete deterministic example or label the snippet explicitly.

The repository also needs one compatibility table that answers these questions without making readers combine several files:

- Which Node.js, npm, macOS, and Linux combinations are supported?
- What is the status of Windows and WSL?
- Which provider adapters are published?
- Which paths require Ollama, Docker, KVM, QEMU, or Firecracker?
- Which assurance results are current, optional, blocked, or unverified?

### 5. A few community and discovery pieces are missing

Prism has the core contribution files. It does not currently have `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, or a documentation-specific issue form. These are not substitutes for product documentation, but they matter if the project intends to invite outside contributors.

Repository metadata should also be completed at launch: a concise GitHub description, accurate topics, a social preview image, and a small badge set backed by real checks. Avoid badges or labels that imply “secure,” “sandboxed,” “production-ready,” or supported-platform claims beyond the evidence.

## What the benchmark projects do well

The research covered agent projects including [LangGraph](https://github.com/langchain-ai/langgraph), [OpenHands](https://github.com/OpenHands/OpenHands), [PydanticAI](https://github.com/pydantic/pydantic-ai), [smolagents](https://github.com/huggingface/smolagents), [CrewAI](https://github.com/crewAIInc/crewAI), and [Mastra](https://github.com/mastra-ai/mastra). It also covered runtime and plugin systems including [Temporal](https://docs.temporal.io/workflows), [Deno](https://docs.deno.com/runtime/fundamentals/security/), [Wasmtime](https://docs.wasmtime.dev/security.html), and [Extism](https://extism.org/docs/concepts/manifest/).

Five patterns were consistent:

1. One canonical first success comes before the feature catalog. The strongest examples are short, runnable, and explicit about prerequisites.
2. The project names its abstraction boundary early. Readers learn what the runtime owns, what the host owns, and what belongs to a provider or plugin.
3. Documentation is progressive. A small quickstart leads to concepts, examples, API reference, operations, and security details.
4. Runtime guarantees are tied to mechanisms. Deno explains permissions, Temporal explains event history and replay, Wasmtime explains host configuration and isolation, and Extism makes capabilities visible in the manifest.
5. Dangerous capability and its limitation appear together. A code-execution or plugin example should not make the reader hunt for the fact that it has host authority.

GitHub's own README guidance says the root should explain what the project does, why it is useful, how to get started, where to get help, and who maintains it. It also recommends moving longer material out of the README. GitHub renders Mermaid diagrams directly in Markdown, which makes source-controlled diagrams a good fit for Prism. See [README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes) and [diagram support](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams).

## Recommended README order

1. Project name, one-sentence value proposition, preview status, license, and tested Node.js/npm versions.
2. Three concrete reasons to use Prism: provider-neutral contracts, bounded execution, and inspectable local results.
3. The deterministic first run with expected output.
4. A compact “what works today / what is not included” table.
5. The at-a-glance architecture diagram.
6. A “choose your path” block for CLI users, Runtime integrators, plugin authors, contributors, and security reviewers.
7. The trust warning before any provider or plugin instructions.
8. A table of published packages with install links and ownership boundaries.
9. Compatibility, release evidence, and optional assurance links.
10. Support, security, contributing, changelog, and license links.

Move the full project-plugin implementation out of the root README. Keep a short command sequence and link to the complete example.

## Architecture diagrams

### Recommended: do it properly

Create five diagrams. Each one should answer one reader question and live beside the text that explains it.

| Diagram | Question answered | Required content | Primary location |
| --- | --- | --- | --- |
| System and package map | What is Prism, and where does it stop? | CLI, Runtime, SDK contracts, deterministic/Ollama provider paths, policy, tools, local state, published versus source-only packages | `README.md` and `docs/architecture/README.md` |
| Bounded run sequence | What happens during one run? | Goal, provider turn, tool request, policy admission, one tool call, cleanup, second provider turn, terminal result, ordered events | `docs/developer-preview/concepts.md` |
| Plugin admission and execution | What is approved, and what authority executes? | Declaration, captured bytes, digest, per-user approval, admission ticket, ambient subprocess execution, cleanup receipt, V3 record | `docs/developer-preview/data-and-trust.md` |
| Local data and evidence | What does Prism retain or omit? | Config, trust, approval, artifacts, run record, retained metadata, omitted raw values and paths | `docs/developer-preview/data-and-trust.md` |
| Optional assurance lanes | What is normal execution versus stronger evidence? | Normal local path, optional Docker checks, B4, KVM/QEMU, Firecracker, X1, and current unverified status | `docs/assurance/README.md` |

The bounded run diagram should show the current six-event sequence:

`goal.accepted -> provider.tool-requested -> policy.allowed -> tool.completed -> provider.finalized -> run.completed`

The plugin diagram must label the current public project-plugin path as “ambient subprocess authority.” Docker and Firecracker belong in separate optional lanes. Do not draw either as the normal runtime path. Approval must be labeled “identity and owner approval, not safety.”

Use Mermaid as the canonical source. Keep the source under `docs/architecture/diagrams/`, render SVG as derived output when a stable image is needed, and add an adjacent text description for every diagram. W3C guidance requires an equivalent text alternative for meaningful non-text content, including complex diagrams. See [WCAG non-text content guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html).

Add checks that render the diagrams and verify critical labels. Diagram changes should be reviewed with the same care as public claims because a stale trust-boundary arrow can be more misleading than stale prose.

### Smaller option

Ship two diagrams first:

1. A combined package, execution, local-state, and optional-assurance overview.
2. A combined plugin admission, ambient authority, cleanup, and retained-evidence sequence.

This is faster, but each diagram carries several audiences and is harder to scan. It is acceptable for an initial pass. The five-diagram set is the better architecture and the recommendation.

## Recommended repository additions

Preserve the existing developer-preview structure. Add to it instead of reorganizing everything in the first pass.

```text
README.md
docs/
  README.md
  architecture/
    README.md
    diagrams/
      system-and-packages.mmd
      bounded-run.mmd
      plugin-admission.mmd
      local-data-and-evidence.mmd
      assurance-lanes.mmd
  developer-preview/
    compatibility.md
examples/
  README.md
  deterministic/
  runtime-api/
  project-plugin/
  ollama/
  failures/
CODE_OF_CONDUCT.md
GOVERNANCE.md
.github/ISSUE_TEMPLATE/documentation.yml
```

The examples index should identify prerequisites, network behavior, credentials, expected output, cleanup, and the relevant trust boundary for each example.

## Priority

### P0: next public-facing pass

1. Fix and test the build-dependent commands in `pnh/README.md` and `CONTRIBUTING.md`.
2. Add `docs/architecture/README.md` and the five source-controlled diagrams.
3. Rewrite the root README in the recommended order and move the long plugin body to an example.
4. Add a docs landing page and direct links to package, support, security, contributing, and release material.

### P1: credible developer preview

1. Add a complete Runtime API example and an `examples/` index.
2. Add the compatibility and support matrix.
3. Add CI checks for documented commands, internal links, Mermaid rendering, diagram labels, and package/version drift.
4. Add a documentation issue form, Code of Conduct, and lightweight governance document if outside contributions are expected.
5. Verify that GitHub private vulnerability reporting is enabled, since `SECURITY.md` directs users there.

### P2: maturity work

1. Generate versioned API documentation when the public API shape is ready to support it.
2. Add a migration and deprecation policy before compatibility promises begin.
3. Add repository topics, a social preview, and only the small badge set backed by maintained checks.
4. Add user-facing provenance, checksum, and SBOM verification commands once final artifact URLs are stable.

## Acceptance criteria

The repository experience is ready when a first-time developer can:

- understand Prism's purpose and current limits from the first README screen;
- run and inspect the deterministic path from a clean environment without credentials or Docker;
- identify the provider, policy, tool, event, cleanup, and terminal-result flow without reading a plan document;
- distinguish ambient subprocess execution from optional Docker and Firecracker assurance;
- choose the correct documentation path for using the CLI, embedding Runtime, authoring a plugin, contributing, or reporting a vulnerability; and
- obtain the same information conveyed by every diagram from adjacent text.

## Decisions still needed

1. Whether `pnh/README.md` remains a public entry point or becomes implementation/reference material behind the developer-preview docs.
2. Which macOS and Linux combinations are officially supported for 0.1.x beyond the native prebuild targets.
3. Whether Code of Conduct and governance files are launch requirements or follow immediately after the preview.
4. Whether generated SVG files are committed or produced only by documentation CI.
5. Whether GitHub private vulnerability reporting is enabled on the intended public repository.

## Method

Five independent Codex workers audited Prism, agent-framework repositories, runtime repositories, OSS repository health, and architecture-diagram needs. A sixth adversarial reviewer checked the combined findings against current files and primary sources. The coordinator then reproduced the source-checkout documentation failure and removed findings that contradicted the repository.
