#!/usr/bin/env bash
set -euo pipefail

readonly expected_profile=${1:?profile is required}
readonly b4_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
readonly source_root=${B4_SOURCE_ROOT:-$(cd "$b4_root/../.." && pwd -P)}
readonly credential_key_pattern='(^|_)(API_?KEY|AUTH|COOKIE|CREDENTIAL|PASSWORD|PRIVATE_?KEY|SECRET|SESSION|TOKEN)(_|$)'

blocked() {
  printf 'B4-B0-BLOCKED %s\n' "$1" >&2
  exit 1
}

[[ ${B4_QUALIFIED_B0:-} == 1 ]] || blocked not-qualified
[[ ${B4_B0_PROFILE:-} == "$expected_profile" ]] || blocked profile-mismatch
[[ ${B4_SOURCE_BUNDLE_SHA256:-} =~ ^[0-9a-f]{64}$ ]] || blocked source-bundle-digest-missing
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || blocked wrong-platform
[[ $(id -u) -ne 0 ]] || blocked root-identity
[[ ${HOME:-} == /nonexistent ]] || blocked home-visible
[[ $(hostname) == prism-b4 ]] || blocked host-identity-visible
[[ ! -t 0 && ! -t 1 && ! -t 2 ]] || blocked tty-visible

if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  blocked sudo-capable
fi
if env | cut -d= -f1 | grep -Eiq "$credential_key_pattern"; then
  blocked credential-key-visible
fi
mapfile -t network_interfaces < <(find /sys/class/net -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
[[ ${#network_interfaces[@]} -eq 1 && ${network_interfaces[0]} == lo ]] || blocked routable-interface-visible
[[ $(awk 'NR > 1 && NF { count += 1 } END { print count + 0 }' /proc/net/route) -eq 0 ]] || blocked route-visible

[[ -d $source_root && -f $source_root/.b4/source-allowlist.json ]] || blocked source-bundle-not-expanded
[[ ! -e $source_root/.git ]] || blocked git-metadata-visible
if find "$source_root" -perm /222 -print -quit | grep -q .; then
  blocked writable-source
fi
if grep -Eq '/Users/|/home/runner|docker\.sock|podman\.sock|/\.git([ /]|$)' /proc/self/mountinfo; then
  blocked forbidden-host-mount
fi

printf 'B4-B0-ENV-PASS profile=%s source_bundle_sha256=%s\n' \
  "$expected_profile" "$B4_SOURCE_BUNDLE_SHA256"
