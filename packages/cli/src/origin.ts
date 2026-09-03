import { isIP } from "node:net";

export function normalizeOrigin(value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Endpoint must be an HTTP(S) origin.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Endpoint must be an HTTP(S) origin.");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
    || url.hostname.endsWith(".")
  ) {
    throw new Error("Endpoint must be an HTTP(S) origin.");
  }
  return url.origin;
}

export function isLoopbackOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  const hostname = new URL(normalized).hostname.toLowerCase();
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const ipVersion = isIP(unwrapped);
  if (ipVersion === 4) return unwrapped.split(".")[0] === "127";
  if (ipVersion === 6) return unwrapped === "::1";
  return unwrapped === "localhost" || unwrapped.endsWith(".localhost");
}
