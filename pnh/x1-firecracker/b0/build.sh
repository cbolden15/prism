#!/usr/bin/env bash
set -euo pipefail

readonly b4_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
"$b4_root/b0/verify-environment.sh" check

[[ $(rustc --version) == 'rustc 1.98.0 (88d9e12ae 2026-08-20)' ]]
[[ $(cargo --version) == 'cargo 1.98.0 (797e8a9bc 2026-08-05)' ]]
[[ $(node --version) == 'v26.8.1' ]]
rustup target list --installed | grep -Fxq x86_64-unknown-linux-musl

readonly linker=/usr/local/rustup/toolchains/1.98.0-x86_64-unknown-linux-gnu/lib/rustlib/x86_64-unknown-linux-gnu/bin/rust-lld
printf '%s  %s\n' \
  '9d8fba0d687fec562dc316ce65cbf580c184c9586fcab03a2f722bb1748c4fca' \
  "$linker" \
  | sha256sum --check --strict -

node "$b4_root/b0/verify-locks.mjs"
(cd "$b4_root" && cargo metadata --locked --offline --format-version 1 --no-deps >/dev/null)
printf 'B4-CHECK-PASS target=x86_64-unknown-linux-musl dependencies=0\n'
