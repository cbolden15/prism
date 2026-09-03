#!/usr/bin/env bash
set -euo pipefail

readonly profile=${1:?profile is required}
readonly b4_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
readonly source_root=${B4_SOURCE_ROOT:-$(cd "$b4_root/../.." && pwd -P)}

case "$profile" in
  check)
    "$b4_root/b0/build.sh"
    ;;
  unit)
    "$b4_root/b0/verify-environment.sh" unit
    node --experimental-strip-types --test "$source_root/x1/tests/prism-b4-contract.test.ts"
    ;;
  qemu)
    "$b4_root/b0/verify-environment.sh" qemu
    node "$b4_root/b0/verify-kvm-evidence.mjs" "${B4_KVM_EVIDENCE:-}"
    ;;
  firecracker|acceptance)
    "$b4_root/b0/verify-environment.sh" "$profile"
    printf 'B4-PROFILE-NOT-APPLICABLE milestone=0 profile=%s\n' "$profile"
    ;;
  reproduce)
    "$b4_root/b0/reproduce.sh"
    ;;
  scan-public)
    "$b4_root/b0/verify-environment.sh" scan-public
    node "$b4_root/b0/scan-public.mjs"
    ;;
  verify)
    "$b4_root/b0/verify-environment.sh" verify
    for child in check unit reproduce scan-public qemu firecracker acceptance; do
      B4_B0_PROFILE=$child "$b4_root/b0/run-profile.sh" "$child"
    done
    printf 'B4-00-VERIFY-PASS\n'
    ;;
  *)
    printf 'B4-B0-BLOCKED unknown-profile:%s\n' "$profile" >&2
    exit 2
    ;;
esac
