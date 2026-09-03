/**
 * Owner-pinned plugin digest record.
 *
 * A caller-owned pin file is the owner-approval artifact behind the
 * owner-approved leg of PNH-INV-29. Changing a pin requires a reviewed
 * commit; no signing mechanism exists yet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const PLUGIN_PIN_RECORD_VERSION = "pnh-plugin-pins-v1";

const DIGEST_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RECORD_KEYS = ["version", "environment", "plugins"] as const;
const ENTRY_KEYS = ["id", "manifestDigest", "sourceDigest"] as const;

export interface PluginPinEntry {
  readonly id: string;
  readonly manifestDigest: string;
  readonly sourceDigest: string;
}

export interface PluginPinRecord {
  readonly version: typeof PLUGIN_PIN_RECORD_VERSION;
  readonly environment: "production";
  readonly plugins: readonly PluginPinEntry[];
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validateEntry(value: unknown): PluginPinEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!exactKeys(value as Record<string, unknown>, ENTRY_KEYS)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !ID_RE.test(entry.id)) return null;
  if (typeof entry.manifestDigest !== "string" || !DIGEST_RE.test(entry.manifestDigest)) return null;
  if (typeof entry.sourceDigest !== "string" || !DIGEST_RE.test(entry.sourceDigest)) return null;
  return Object.freeze({
    id: entry.id,
    manifestDigest: entry.manifestDigest,
    sourceDigest: entry.sourceDigest,
  });
}

function validatePluginPinRecord(value: unknown): PluginPinRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (!exactKeys(value as Record<string, unknown>, RECORD_KEYS)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== PLUGIN_PIN_RECORD_VERSION) return null;
  if (record.environment !== "production") return null;
  if (!Array.isArray(record.plugins)) return null;
  const seen = new Set<string>();
  const plugins: PluginPinEntry[] = [];
  for (const raw of record.plugins) {
    const entry = validateEntry(raw);
    if (entry === null || seen.has(entry.id)) return null;
    seen.add(entry.id);
    plugins.push(entry);
  }
  return Object.freeze({
    version: PLUGIN_PIN_RECORD_VERSION,
    environment: "production",
    plugins: Object.freeze(plugins),
  });
}

/**
 * Reject duplicate object members before semantic validation.
 *
 * `JSON.parse` collapses duplicate members, so owner-reviewed JSON must be
 * checked in raw form. The input has already passed `JSON.parse`; this scan
 * only tracks decoded member names within each object scope.
 */
export function hasDuplicateMembers(text: string): boolean {
  const scopes: Array<Set<string>> = [];
  let pendingName: string | null = null;
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length && text.charAt(index) !== '"') {
        index += text.charAt(index) === "\\" ? 2 : 1;
      }
      index += 1;
      const decoded: unknown = JSON.parse(text.slice(start, index));
      pendingName = typeof decoded === "string" ? decoded : null;
      continue;
    }
    if (char === "{") {
      scopes.push(new Set<string>());
      index += 1;
      continue;
    }
    if (char === "}") {
      scopes.pop();
      index += 1;
      continue;
    }
    if (char === ":") {
      const scope = scopes.at(-1);
      if (scope === undefined || pendingName === null) return true;
      if (scope.has(pendingName)) return true;
      scope.add(pendingName);
      pendingName = null;
      index += 1;
      continue;
    }
    index += 1;
  }
  return false;
}

export function loadPluginPinRecord(path: string): PluginPinRecord {
  const absolutePath = resolve(path);
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absolutePath));
    value = JSON.parse(text);
    if (hasDuplicateMembers(text)) throw new Error("duplicate member");
  } catch {
    throw new Error("invalid committed plugin pin record");
  }
  const record = validatePluginPinRecord(value);
  if (record === null) throw new Error("invalid committed plugin pin record");
  return record;
}
