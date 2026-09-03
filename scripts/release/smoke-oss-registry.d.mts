import type { NpmCommandResult } from "./publish-oss-release.mjs";

export const NPM_PUBLIC_REGISTRY: "https://registry.npmjs.org";
export const NPM_ATTESTATION_MAX_RESPONSE_BYTES: number;
export const NPM_ATTESTATION_TIMEOUT_MS: number;
export const NPM_BUNDLED_SIGSTORE_VERSION: "4.1.1";
export const NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI: "https://github.com/cbolden15/prism/.github/workflows/release.yml@refs/heads/main";
export const NPM_PROVENANCE_CERTIFICATE_ISSUER: "https://token.actions.githubusercontent.com";
export const NPM_SIGSTORE_TIMEOUT_MS: number;
export const NPM_SIGSTORE_RETRIES: 1;

export interface RegistryProvenanceVerificationPolicy {
  readonly certificateIdentityURI: typeof NPM_PROVENANCE_CERTIFICATE_IDENTITY_URI;
  readonly certificateIssuer: typeof NPM_PROVENANCE_CERTIFICATE_ISSUER;
  readonly retry: Readonly<{ readonly retries: typeof NPM_SIGSTORE_RETRIES }>;
  readonly timeout: number;
}

export const NPM_PROVENANCE_VERIFICATION_POLICY: Readonly<RegistryProvenanceVerificationPolicy>;

export interface RegistryAttestationRequest {
  readonly url: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export interface RegistryAttestationResponse {
  readonly status: number;
  readonly url: string;
  readonly redirected: boolean;
  readonly contentType: string;
  readonly body: string | Uint8Array;
}

export type RegistryAttestationFetcher = (
  request: RegistryAttestationRequest,
) => Promise<RegistryAttestationResponse>;

export type RegistryProvenanceVerifier = (
  bundle: Readonly<Record<string, unknown>>,
  policy: Readonly<RegistryProvenanceVerificationPolicy>,
) => void | Promise<void>;

export type RegistryProvenanceVerifierLoader = () => Promise<RegistryProvenanceVerifier>;

export function buildRegistryInstallArguments(version: string): readonly string[];
export function buildRegistrySignatureAuditArguments(): readonly string[];

export function loadNpmBundledProvenanceVerifier(input?: {
  readonly runNpmRoot?: (arguments_: readonly string[]) => NpmCommandResult;
}): Promise<RegistryProvenanceVerifier>;

export function verifyRegistryPackageMetadata(input: {
  readonly candidateRoot: string;
  readonly packages: readonly import("./oss-release-contract.mjs").CandidatePackage[];
  readonly sourceCommit: string;
  readonly runNpm?: (
    arguments_: readonly string[],
    options?: { readonly cwd: string },
  ) => NpmCommandResult;
  readonly fetchAttestations?: RegistryAttestationFetcher;
  readonly verifyProvenanceBundle?: RegistryProvenanceVerifier;
  readonly loadProvenanceVerifier?: RegistryProvenanceVerifierLoader;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly attempts?: number;
}): Promise<void>;

export function smokeRegistryRelease(input: {
  readonly candidateRoot: string;
  readonly packages: readonly import("./oss-release-contract.mjs").CandidatePackage[];
  readonly sourceCommit: string;
  readonly version: string;
  readonly runNpm?: (
    arguments_: readonly string[],
    options: { readonly cwd: string },
  ) => NpmCommandResult;
  readonly fetchAttestations?: RegistryAttestationFetcher;
  readonly verifyProvenanceBundle?: RegistryProvenanceVerifier;
  readonly loadProvenanceVerifier?: RegistryProvenanceVerifierLoader;
  readonly runNode?: (
    arguments_: readonly string[],
    options: { readonly cwd: string },
  ) => NpmCommandResult;
  readonly wait?: (milliseconds: number) => Promise<void>;
}): Promise<void>;
