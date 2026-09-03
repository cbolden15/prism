import { rmSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
rmSync(resolve(packageRoot, "dist"), { recursive: true, force: true });
rmSync(resolve(packageRoot, "tsconfig.tsbuildinfo"), { force: true });
