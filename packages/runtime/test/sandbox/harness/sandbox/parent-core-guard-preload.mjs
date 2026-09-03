import { registerHooks } from "node:module";
import { createParentCoreGuard } from "./parent-core-guard-policy.mjs";

registerHooks(createParentCoreGuard("/sandbox/packages/runtime/src/core"));
