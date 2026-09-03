import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function createParentCoreGuard(coreDirectory) {
  const coreRoot = realpathSync.native(coreDirectory);
  return {
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (typeof resolved.url === "string" && resolved.url.startsWith("file:")) {
        let canonicalPath;
        try {
          canonicalPath = realpathSync.native(fileURLToPath(resolved.url));
        } catch {
          return resolved;
        }
        if (isInside(coreRoot, canonicalPath)) {
          throw new Error(`PNH parent test import of core denied: ${resolved.url}`);
        }
      }
      return resolved;
    },
  };
}
