import type {
  AmendmentKind,
  LawStatus,
  ProofStatus,
} from "./registry.ts";
import {
  consumeDecisionAuthority,
  consumeProofAuthority,
  type ValidatedDecisionAuthority,
  type ValidatedProofAuthority,
} from "./transition-authority.ts";

export interface InvariantTransitionAuthorities {
  readonly law?: ValidatedDecisionAuthority;
  readonly proofInvalidation?: ValidatedDecisionAuthority;
  readonly proof?: ValidatedProofAuthority;
}

export interface InvariantTransitionInput {
  readonly id: string;
  readonly oldLawStatus: LawStatus;
  readonly newLawStatus: LawStatus;
  readonly oldProofStatus: ProofStatus;
  readonly newProofStatus: ProofStatus;
  readonly lockedHash: string;
  readonly newBindingHash: string;
  readonly proofReason: string | undefined;
  readonly authorities?: InvariantTransitionAuthorities;
}

const LEGAL_LAW_TRANSITIONS = new Set([
  "proposed->ratified",
  "proposed->retired",
  "ratified->retired",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateDecisionAuthority(
  input: InvariantTransitionInput,
  authority: ValidatedDecisionAuthority | undefined,
  kind: Extract<AmendmentKind, "law-transition" | "proof-invalidation">,
  reasonLabel: string,
  requirePriorProofStatus: boolean,
): string[] {
  if (authority === undefined) {
    return [`${input.id}: ${reasonLabel} requires validated ${kind} authority`];
  }

  const errors: string[] = [];
  errors.push(...consumeDecisionAuthority(authority).map((error) =>
    `${input.id}: ${error}`));
  if (authority.invariantId !== input.id) {
    errors.push(
      `${input.id}: ${kind} authority invariant ${authority.invariantId} does not match invariant ${input.id}`,
    );
  }
  if (authority.amendmentKind !== kind) {
    errors.push(`${input.id}: ${reasonLabel} requires amendment kind ${kind}`);
  }
  if (authority.priorBindingHash !== input.lockedHash) {
    errors.push(
      `${input.id}: authority prior binding hash ${authority.priorBindingHash} does not match locked hash ${input.lockedHash}`,
    );
  }
  if (authority.newBindingHash !== input.newBindingHash) {
    errors.push(
      `${input.id}: authority new binding hash ${authority.newBindingHash} does not match target hash ${input.newBindingHash}`,
    );
  }
  if (!isNonEmptyString(authority.reason)) {
    const requirement = kind === "proof-invalidation"
      ? "evidence-invalidation reason"
      : "amendment reason";
    errors.push(`${input.id}: ${reasonLabel} requires a non-empty ${requirement}`);
  }
  if (requirePriorProofStatus &&
      authority.priorProofStatus !== input.oldProofStatus) {
    errors.push(
      `${input.id}: authority prior proof status ${String(authority.priorProofStatus)} does not match prior proof status ${input.oldProofStatus}`,
    );
  }
  return errors;
}

function validateProofAuthority(
  input: InvariantTransitionInput,
  expectedKind: ValidatedProofAuthority["authorityKind"],
): string[] {
  const authority = input.authorities?.proof;
  if (authority === undefined) {
    return [
      `${input.id}: transition ${input.oldProofStatus}->${input.newProofStatus} requires validated ${expectedKind} authority`,
    ];
  }

  const errors: string[] = [...consumeProofAuthority(authority)];
  if (errors.length > 0) {
    return errors.map((error) => `${input.id}: ${error}`);
  }
  if (authority.authorityKind !== expectedKind) {
    errors.push(
      `${input.id}: proof authority kind ${authority.authorityKind} does not match required ${expectedKind}`,
    );
  }
  if (authority.invariantId !== input.id) {
    errors.push(
      `${input.id}: proof authority invariant ${authority.invariantId} does not match invariant ${input.id}`,
    );
  }
  if (authority.invariantBindingHash !== input.lockedHash) {
    errors.push(
      `${input.id}: proof authority binding hash ${authority.invariantBindingHash} does not match locked hash ${input.lockedHash}`,
    );
  }
  if (authority.priorProofStatus !== input.oldProofStatus) {
    errors.push(
      `${input.id}: proof authority prior status ${authority.priorProofStatus} does not match ${input.oldProofStatus}`,
    );
  }
  if (authority.newProofStatus !== input.newProofStatus) {
    errors.push(
      `${input.id}: proof authority new status ${authority.newProofStatus} does not match ${input.newProofStatus}`,
    );
  }
  return errors;
}

export function validateInvariantTransition(
  input: InvariantTransitionInput,
): string[] {
  const errors: string[] = [];
  const lawChanged = input.oldLawStatus !== input.newLawStatus;
  const proofChanged = input.oldProofStatus !== input.newProofStatus;

  if (input.newProofStatus === "proven") {
    if (input.proofReason !== undefined) {
      errors.push(`${input.id}: proof_reason is forbidden when proof status is proven`);
    }
  } else if (!isNonEmptyString(input.proofReason)) {
    errors.push(
      `${input.id}: proof status ${input.newProofStatus} requires a non-empty proof_reason`,
    );
  }

  if (lawChanged) {
    const transition = `${input.oldLawStatus}->${input.newLawStatus}`;
    if (!LEGAL_LAW_TRANSITIONS.has(transition)) {
      errors.push(`${input.id}: illegal law status transition ${transition}`);
    } else {
      errors.push(...validateDecisionAuthority(
        input,
        input.authorities?.law,
        "law-transition",
        `law transition ${transition}`,
        false,
      ));
    }
  }

  if (proofChanged) {
    if (input.oldProofStatus === "proven" &&
        input.newProofStatus !== "proven") {
      errors.push(...validateDecisionAuthority(
        input,
        input.authorities?.proofInvalidation,
        "proof-invalidation",
        `proof transition ${input.oldProofStatus}->${input.newProofStatus}`,
        true,
      ));
    } else if (input.newProofStatus === "proven") {
      errors.push(...validateProofAuthority(input, "proof-upgrade"));
    } else if (input.oldProofStatus === "unproven" &&
               input.newProofStatus === "partial") {
      errors.push(...validateProofAuthority(input, "partial-evidence"));
    }
  }

  if (lawChanged || proofChanged) {
    errors.push(
      `stale lock: ${input.id} law/proof status changed (run generate-constitution --update-lock)`,
    );
  }
  return errors;
}
