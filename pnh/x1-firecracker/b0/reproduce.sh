#!/usr/bin/env bash
set -euo pipefail

readonly b4_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
readonly source_root=${B4_SOURCE_ROOT:-$(cd "$b4_root/../.." && pwd -P)}
readonly artifact_root=${B4_ARTIFACT_ROOT:-/artifacts}
readonly allowlist="$source_root/.b4/source-allowlist.json"
readonly first="$artifact_root/source-first.tar"
readonly second="$artifact_root/source-second.tar"

"$b4_root/b0/verify-environment.sh" reproduce
[[ -d $artifact_root && -w $artifact_root ]] || {
  printf 'B4-B0-BLOCKED artifact-root-not-writable\n' >&2
  exit 1
}

node "$b4_root/b0/make-source-bundle.mjs" \
  --source-root "$source_root" \
  --allowlist "$allowlist" \
  --output "$first"
node "$b4_root/b0/make-source-bundle.mjs" \
  --source-root "$source_root" \
  --allowlist "$allowlist" \
  --output "$second"
cmp --silent "$first" "$second"
readonly first_sha=$(sha256sum "$first" | cut -d' ' -f1)
readonly second_sha=$(sha256sum "$second" | cut -d' ' -f1)
[[ $first_sha == "$second_sha" ]]
printf 'B4-SOURCE-REPRODUCE-PASS first_sha256=%s second_sha256=%s\n' "$first_sha" "$second_sha"
