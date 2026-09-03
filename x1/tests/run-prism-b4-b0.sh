#!/usr/bin/env bash
set -euo pipefail

readonly repository_root=$(git rev-parse --show-toplevel)
readonly profile=${1:-milestone0}
readonly runner_temp=${RUNNER_TEMP:?RUNNER_TEMP is required}
readonly stage_root=/var/tmp/prism-b4-b0-stage
readonly runtime_artifact_root=/var/tmp/prism-b4-b0-artifacts
readonly artifact_dir="$runner_temp/prism-b4-b0-artifacts"
readonly bootstrap_archive="$stage_root/bootstrap-source.tar"
readonly bootstrap_staging="$runner_temp/prism-b4-bootstrap-source.tar"
readonly build_context="$stage_root/toolchain-context"
readonly input_root="$stage_root/inputs"
readonly b0_user=prism-b4
readonly b0_uid=22045
readonly b0_home=/home/prism-b4
readonly b0_runtime=/run/user/22045
readonly node_image='docker.io/library/node@sha256:27f5e13512830beb5d9a574108daa6701a0a0b91528aeaf1ee84ecdcddaeeaae'
readonly rust_image='docker.io/library/rust@sha256:af0579d28b9a7ec5251aaafcb0c0a23dcde5c97065112aae0cc3abeda42d5394'
readonly toolchain_image=localhost/prism-b4-toolchain:milestone0
readonly rust_std_archive_name=rust-std-1.98.0-x86_64-unknown-linux-musl.tar.xz
readonly rust_std_archive_sha=1a76f782db2d540e1cd16ea47829b323f4a8f4dda64bca4b23be189109c510f8
readonly rust_std_tar_name=rust-std-1.98.0-x86_64-unknown-linux-musl.tar
readonly rust_std_tar_sha=0ad5385c3f64ec3cdc01bc5d4843a698494b92a44e634f8b69784588885adb53
original_root_mode=$(stat -c '%a' "$repository_root")
readonly original_root_mode

cleanup() {
  chmod "$original_root_mode" "$repository_root" 2>/dev/null || true
  sudo rm -rf -- "$stage_root" "$runtime_artifact_root" "$b0_runtime" 2>/dev/null || true
}
trap cleanup EXIT

blocked() {
  printf 'B4-B0-BLOCKED %s\n' "$1" >&2
  exit 1
}

[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || blocked environment-not-linux-x86_64
[[ $profile == milestone0 ]] || {
  printf 'usage: %s milestone0\n' "$0" >&2
  exit 2
}
for tool in cmp curl git podman sha256sum sudo tar xz; do
  command -v "$tool" >/dev/null 2>&1 || blocked "required-tool-unavailable:$tool"
done

if ! id "$b0_user" >/dev/null 2>&1; then
  sudo useradd --uid "$b0_uid" --create-home --home-dir "$b0_home" --shell /usr/sbin/nologin "$b0_user"
fi
grep -q "^${b0_user}:" /etc/subuid || sudo usermod --add-subuids 220450000-220515535 "$b0_user"
grep -q "^${b0_user}:" /etc/subgid || sudo usermod --add-subgids 220450000-220515535 "$b0_user"

sudo rm -rf -- "$stage_root" "$runtime_artifact_root"
rm -rf -- "$artifact_dir"
mkdir -p "$artifact_dir"
printf 'head_sha=%s\nstate=started\n' "$(git rev-parse HEAD)" >"$artifact_dir/run-state.txt"
sudo install -d -o root -g root -m 0755 "$stage_root" "$input_root"
sudo install -d -o "$b0_user" -g "$b0_user" -m 0755 "$runtime_artifact_root"
sudo install -d -o "$b0_user" -g "$b0_user" -m 0700 "$b0_home" "$b0_runtime"

paths=(
  .github/workflows/x1-gate-a.yml
  package.json
  pnh/x1-firecracker
  x1/tests/prism-b4-contract.test.ts
  x1/tests/run-prism-b4-b0.sh
)
git diff --quiet HEAD -- "${paths[@]}" || blocked source-path-differs-from-head
git archive --format=tar HEAD -- "${paths[@]}" >"$bootstrap_staging"
readonly bootstrap_sha=$(sha256sum "$bootstrap_staging" | cut -d' ' -f1)
printf '%s  %s\n' "$bootstrap_sha" bootstrap-source.tar >"$artifact_dir/bootstrap-source.tar.sha256"

while IFS= read -r member; do
  case "$member" in
    ''|/*|../*|*/../*|*/..|.git|.git/*|*/.git|*/.git/*)
      blocked forbidden-bootstrap-member
      ;;
    .github/|.github/workflows/|.github/workflows/x1-gate-a.yml|package.json|pnh/|pnh/x1-firecracker/|pnh/x1-firecracker/*|x1/|x1/tests/|x1/tests/prism-b4-contract.test.ts|x1/tests/run-prism-b4-b0.sh) ;;
    *)
      blocked unlisted-bootstrap-member
      ;;
  esac
done < <(tar -tf "$bootstrap_staging")
if ! tar -tvf "$bootstrap_staging" | awk 'substr($1,1,1) != "-" && substr($1,1,1) != "d" { exit 1 }'; then
  blocked bootstrap-special-file
fi
sudo install -o root -g root -m 0444 "$bootstrap_staging" "$bootstrap_archive"
rm -f -- "$bootstrap_staging"

readonly rust_std_download="$runner_temp/$rust_std_archive_name"
readonly rust_std_tar_staging="$runner_temp/$rust_std_tar_name"
curl --fail --location --proto '=https' --retry 3 --show-error --silent \
  --output "$rust_std_download" \
  "https://static.rust-lang.org/dist/2026-08-20/$rust_std_archive_name"
printf '%s  %s\n' "$rust_std_archive_sha" "$rust_std_download" | sha256sum --check --strict -
xz --decompress --stdout "$rust_std_download" >"$rust_std_tar_staging"
printf '%s  %s\n' "$rust_std_tar_sha" "$rust_std_tar_staging" | sha256sum --check --strict -
sudo install -o root -g root -m 0444 "$rust_std_tar_staging" "$input_root/$rust_std_tar_name"
printf '%s  %s\n%s  %s\n' \
  "$rust_std_archive_sha" "$rust_std_archive_name" \
  "$rust_std_tar_sha" "$rust_std_tar_name" \
  >"$artifact_dir/rust-std-inputs.sha256"
rm -f -- "$rust_std_download" "$rust_std_tar_staging"

# The dedicated B0 identity receives no readable checkout, caller environment,
# credential store, privileged socket, operator home, or network during dynamic
# source execution. Pulls above and below are immutable-image provisioning.
chmod o-rwx "$repository_root"
b0_podman() {
  sudo -u "$b0_user" env -i     HOME="$b0_home"     PATH=/usr/bin:/bin     XDG_RUNTIME_DIR="$b0_runtime"     /bin/sh -c 'cd "$HOME" && exec podman --storage-driver=vfs --events-backend=file --cgroup-manager=cgroupfs "$@"' prism-b4-podman "$@"
}

for image in "$node_image" "$rust_image"; do
  b0_podman pull "$image" >/dev/null
  expected_digest=${image##*@sha256:}
  b0_podman image inspect "$image" | grep -Fq "$expected_digest" || blocked image-digest-mismatch
done

set +e
b0_podman run --rm   --log-driver=k8s-file   --network=none   --read-only   --cap-drop=all   --security-opt=no-new-privileges   --pids-limit=256   --memory=2g   --cpus=2   --userns=keep-id   --user="$b0_uid:$b0_uid"   --hostname=prism-b4   --env B4_B0_PROFILE=unit   --env B4_QUALIFIED_B0=1   --env HOME=/nonexistent   --env LANG=C   --env LC_ALL=C   --env SOURCE_DATE_EPOCH=0   --env TZ=UTC   --volume "$bootstrap_archive:/input/bootstrap-source.tar:ro,nodev,nosuid,noexec"   --volume "$runtime_artifact_root:/artifacts:rw,nodev,nosuid,noexec"   --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m   --tmpfs /work:rw,noexec,nosuid,nodev,size=512m   "$node_image"   /bin/sh -ceu '
    expected_sha=$1
    printf "%s  %s\n" "$expected_sha" /input/bootstrap-source.tar | sha256sum --check --strict -
    mkdir -p /work/source
    tar --extract --file /input/bootstrap-source.tar --directory /work/source --no-same-owner --no-same-permissions
    find /work/source -type d -exec chmod 0555 {} +
    find /work/source -type f -exec chmod 0444 {} +
    cd /work/source
    node --experimental-strip-types --test x1/tests/prism-b4-contract.test.ts
    node pnh/x1-firecracker/b0/make-source-bundle.mjs       --source-root /work/source       --allowlist /work/source/pnh/x1-firecracker/b0/source-allowlist.json       --output /artifacts/closed-source-a.tar
    node pnh/x1-firecracker/b0/make-source-bundle.mjs       --source-root /work/source       --allowlist /work/source/pnh/x1-firecracker/b0/source-allowlist.json       --output /artifacts/closed-source-b.tar
    cmp --silent /artifacts/closed-source-a.tar /artifacts/closed-source-b.tar
  ' prism-bootstrap "$bootstrap_sha"   2>&1 | tee "$artifact_dir/source-closure.log"
bootstrap_status=${PIPESTATUS[0]}
set -e
[[ $bootstrap_status -eq 0 ]] || exit "$bootstrap_status"

sudo chmod 0755 "$runtime_artifact_root"
readonly closed_source="$runtime_artifact_root/closed-source-a.tar"
cmp --silent "$closed_source" "$runtime_artifact_root/closed-source-b.tar"
readonly source_bundle_sha=$(sha256sum "$closed_source" | cut -d' ' -f1)
readonly source_bundle_b_sha=$(sha256sum "$runtime_artifact_root/closed-source-b.tar" | cut -d' ' -f1)
[[ $source_bundle_sha == "$source_bundle_b_sha" ]] || blocked source-bundle-digest-mismatch
printf '%s  %s\n%s  %s\n'   "$source_bundle_sha" closed-source-a.tar   "$source_bundle_b_sha" closed-source-b.tar   >"$artifact_dir/source-bundles.sha256"

sudo install -d -o root -g root -m 0755 "$build_context"
sudo tar --extract --file "$closed_source" --directory "$build_context" --no-same-owner --no-same-permissions
sudo install -d -o root -g root -m 0555 "$build_context/.b0-inputs"
sudo install -o root -g root -m 0444 "$input_root/$rust_std_tar_name" "$build_context/.b0-inputs/$rust_std_tar_name"
sudo find "$build_context" -type d -exec chmod 0555 {} +
sudo find "$build_context" -type f -exec chmod 0444 {} +

set +e
b0_podman build \
  --network=none \
  --no-cache \
  --pull=never \
  --tag "$toolchain_image" \
  --file "$build_context/pnh/x1-firecracker/b0/Containerfile" \
  "$build_context" \
  2>&1 | tee "$artifact_dir/toolchain-build.log"
build_status=${PIPESTATUS[0]}
set -e
[[ $build_status -eq 0 ]] || exit "$build_status"
readonly toolchain_image_id=$(b0_podman image inspect --format '{{.Id}}' "$toolchain_image")
printf '%s\n' "$toolchain_image_id" >"$artifact_dir/toolchain-image-id.txt"

run_profile() {
  local selected_profile=$1
  set +e
  b0_podman run --rm     --log-driver=k8s-file     --network=none     --read-only     --cap-drop=all     --security-opt=no-new-privileges     --pids-limit=256     --memory=2g     --cpus=2     --userns=keep-id     --user="$b0_uid:$b0_uid"     --hostname=prism-b4     --env "B4_B0_PROFILE=$selected_profile"     --env B4_QUALIFIED_B0=1     --env "B4_SOURCE_BUNDLE_SHA256=$source_bundle_sha"     --env CARGO_TARGET_DIR=/tmp/cargo-target     --env HOME=/nonexistent     --env LANG=C     --env LC_ALL=C     --env RUSTUP_TOOLCHAIN=1.98.0-x86_64-unknown-linux-gnu     --env SOURCE_DATE_EPOCH=0     --env TZ=UTC     --volume "$closed_source:/input/source.tar:ro,nodev,nosuid,noexec"     --volume "$runtime_artifact_root:/artifacts:rw,nodev,nosuid,noexec"     --tmpfs /tmp:rw,noexec,nosuid,nodev,size=512m     --tmpfs /work:rw,noexec,nosuid,nodev,size=512m     "$toolchain_image"     /bin/bash -ceu '
      expected_sha=$1
      selected_profile=$2
      printf "%s  %s\n" "$expected_sha" /input/source.tar | sha256sum --check --strict -
      mkdir -p /work/source
      tar --extract --file /input/source.tar --directory /work/source --no-same-owner --no-same-permissions
      find /work/source -type d -exec chmod 0555 {} +
      find /work/source -type f -exec chmod 0444 {} +
      cd /work/source
      B4_SOURCE_ROOT=/work/source B4_ARTIFACT_ROOT=/artifacts         bash pnh/x1-firecracker/b0/run-profile.sh "$selected_profile"
    ' prism-profile "$source_bundle_sha" "$selected_profile"     2>&1 | tee "$artifact_dir/profile-$selected_profile.log"
  local status=${PIPESTATUS[0]}
  set -e
  return "$status"
}

# Fail-closed proof runs inside containment but omits the qualification marker.
set +e
b0_podman run --rm   --log-driver=k8s-file   --network=none   --read-only   --cap-drop=all   --security-opt=no-new-privileges   --userns=keep-id   --user="$b0_uid:$b0_uid"   --hostname=prism-b4   --env B4_B0_PROFILE=check   --env HOME=/nonexistent   --volume "$closed_source:/input/source.tar:ro,nodev,nosuid,noexec"   --tmpfs /work:rw,noexec,nosuid,nodev,size=512m   "$toolchain_image"   /bin/bash -ceu '
    mkdir -p /work/source
    tar --extract --file /input/source.tar --directory /work/source
    find /work/source -type d -exec chmod 0555 {} +
    find /work/source -type f -exec chmod 0444 {} +
    cd /work/source
    B4_SOURCE_ROOT=/work/source bash pnh/x1-firecracker/b0/run-profile.sh check
  '   >"$artifact_dir/fail-closed.stdout" 2>"$artifact_dir/fail-closed.stderr"
outside_status=$?
set -e
[[ $outside_status -ne 0 ]] || blocked unqualified-profile-passed
grep -Fxq 'B4-B0-BLOCKED not-qualified' "$artifact_dir/fail-closed.stderr" || blocked unqualified-profile-wrong-failure

for selected_profile in check unit reproduce scan-public firecracker acceptance; do
  run_profile "$selected_profile"
done

sudo cp -a "$runtime_artifact_root/." "$artifact_dir/"
sudo chown -R "$(id -u):$(id -g)" "$artifact_dir"
printf 'B4-B0-MILESTONE0-PASS source_bundle_sha256=%s toolchain_image_id=%s\n'   "$source_bundle_sha" "$toolchain_image_id"
