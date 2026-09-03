import { resolve } from "node:path";

export const nodeVersion = "26.8.1";
export const npmVersion = "11.19.0";

export const targets = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-x64-gnu",
  "linux-x64-musl",
]);

export const targetConfigurations = Object.freeze({
  "darwin-arm64": Object.freeze({ architecture: "arm64", family: "darwin" }),
  "darwin-x64": Object.freeze({ architecture: "x86_64", family: "darwin" }),
  "linux-arm64-gnu": Object.freeze({ family: "linux", platform: "linux/arm64", stage: "export_linux_gnu", toolchain: "gnu" }),
  "linux-arm64-musl": Object.freeze({ family: "linux", platform: "linux/arm64", stage: "export_linux_musl", toolchain: "musl" }),
  "linux-x64-gnu": Object.freeze({ family: "linux", platform: "linux/amd64", stage: "export_linux_gnu", toolchain: "gnu" }),
  "linux-x64-musl": Object.freeze({ family: "linux", platform: "linux/amd64", stage: "export_linux_musl", toolchain: "musl" }),
});

const commonCompilerFlags = Object.freeze([
  "-std=c++17",
  "-Wall",
  "-Wextra",
  "-Werror",
  "-Wpedantic",
  "-O2",
  "-fPIC",
  "-DNAPI_VERSION=8",
  "-DNODE_GYP_MODULE_NAME=prism_authoring",
]);

export const prebuildProvenance = Object.freeze({
  version: "prism-native-authoring-provenance-v1",
  node: nodeVersion,
  npm: npmVersion,
  nodeApi: 8,
  sourceDateEpoch: "0",
  commonCompilerFlags,
  darwin: Object.freeze({
    ciBuildRunner: "macos-26",
    targets: Object.freeze({
      "darwin-arm64": Object.freeze({ compilerArchitecture: "arm64", loadTestRunner: "macos-26" }),
      "darwin-x64": Object.freeze({ compilerArchitecture: "x86_64", loadTestRunner: "macos-26-intel" }),
    }),
    xcode: "26.6",
    xcodeBuild: "17F113",
    sdk: "26.5",
    compiler: "Apple clang version 21.0.0 (clang-2100.1.1.101)",
    linker: "@(#)PROGRAM:ld PROJECT:ld-1267",
    deploymentTarget: "13.5",
    compilerCommand: "xcrun clang++",
    stripCommand: "xcrun strip -x",
    linkerFlags: Object.freeze(["-bundle", "-undefined", "dynamic_lookup", "-Wl,-dead_strip"]),
  }),
  linux: Object.freeze({
    ciBuildRunner: "ubuntu-24.04",
    targets: Object.freeze({
      "linux-arm64-gnu": Object.freeze({
        dockerPlatform: "linux/arm64",
        runtimeImage: "node:26.8.1-bookworm@sha256:975403e9d926e56fb2488a2b280757f319b2ab4fc5e9c364b059e395d480e2b2",
        toolchain: "gnu",
      }),
      "linux-arm64-musl": Object.freeze({
        dockerPlatform: "linux/arm64",
        runtimeImage: "node:26.8.1-alpine@sha256:0d642590166d10420a0efa32b0db56987aef75eeca82742305b4ac4cfd0210e0",
        toolchain: "musl",
      }),
      "linux-x64-gnu": Object.freeze({
        dockerPlatform: "linux/amd64",
        runtimeImage: "node:26.8.1-bookworm@sha256:53eaddc9c421e3e33f5365bb605cb4d85477886745573216219933e22ac13ab0",
        toolchain: "gnu",
      }),
      "linux-x64-musl": Object.freeze({
        dockerPlatform: "linux/amd64",
        runtimeImage: "node:26.8.1-alpine@sha256:ad6400dee476b06e82d0ee3a088e2d7555f6e6569c346e61d69e14d0f19e8c2b",
        toolchain: "musl",
      }),
    }),
    images: Object.freeze({
      nodeBookworm: "node:26.8.1-bookworm@sha256:9f94d34c787165dca03b74e5bf9c3bf90e8de79b19aa3d87fe1fa1694bf75c89",
      rockyLinux: "rockylinux:8@sha256:9794037624aaa6212aeada1d28861ef5e0a935adaf93e4ef79837119f2a2d04c",
      nodeAlpine: "node:26.8.1-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3",
    }),
    gnu: Object.freeze({
      packages: Object.freeze([
        "gcc-c++-8.5.0-28.el8_10",
        "libstdc++-devel-8.5.0-28.el8_10",
        "binutils-2.30-128.el8_10",
        "glibc-devel-2.28-251.el8_10.40",
      ]),
      compiler: "c++ (GCC) 8.5.0 20210514 (Red Hat 8.5.0-28)",
      linker: "GNU ld version 2.30-128.el8_10",
      strip: "GNU strip version 2.30-128.el8_10",
    }),
    musl: Object.freeze({
      packages: Object.freeze([
        "g++=15.2.0-r5",
        "gcc=15.2.0-r5",
        "binutils=2.45.1-r1",
        "musl=1.2.6-r2",
        "musl-dev=1.2.6-r2",
      ]),
      compiler: "c++ (Alpine 15.2.0) 15.2.0",
      linker: "GNU ld (GNU Binutils) 2.45.1",
      strip: "GNU strip (GNU Binutils) 2.45.1",
    }),
    linkerFlags: Object.freeze(["-shared", "-Wl,--build-id=none"]),
  }),
  workflow: Object.freeze({
    buildx: "v0.36.1",
    qemuImage: "docker.io/tonistiigi/binfmt:qemu-v10.2.3@sha256:400a4873b838d1b89194d982c45e5fb3cda4593fbfd7e08a02e76b03b21166f0",
    buildkitImage: "docker.io/moby/buildkit:v0.30.0@sha256:0168606be2315b7c807a03b3d8aa79beefdb31c98740cebdffdfeebf31190c9f",
  }),
});

export function serializePrebuildProvenance() {
  return `${JSON.stringify(prebuildProvenance, null, 2)}\n`;
}

const targetsByFamily = Object.freeze({
  all: targets,
  darwin: Object.freeze(targets.filter((target) => target.startsWith("darwin-"))),
  linux: Object.freeze(targets.filter((target) => target.startsWith("linux-"))),
});

export function targetsForFamily(family) {
  const selected = targetsByFamily[family];
  if (selected === undefined) throw new Error("native-prebuild-family-invalid");
  return [...selected];
}

export function parseBuildArguments(arguments_, defaultOutputRoot) {
  let family = "all";
  let outputRoot = defaultOutputRoot;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--family") {
      family = arguments_[index + 1];
      index += 1;
    } else if (argument.startsWith("--family=")) {
      family = argument.slice("--family=".length);
    } else if (argument === "--output-root") {
      outputRoot = arguments_[index + 1];
      index += 1;
    } else if (argument.startsWith("--output-root=")) {
      outputRoot = argument.slice("--output-root=".length);
    } else {
      throw new Error("native-prebuild-argument-invalid");
    }
  }

  targetsForFamily(family);
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new Error("native-prebuild-output-root-required");
  }
  return { family, outputRoot: resolve(outputRoot) };
}
