import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { ToolRegistration } from "@useprism/sdk/registration";
import {
  admitPinnedRegistryBytes,
  renderPluginDisclosureLines,
  runToolOperation,
  withOwnerApprovedSpawnPlugin,
  type PluginLifecycleReceipt,
} from "@useprism/runtime";
import {
  deterministicPinPath,
  deterministicPluginsRoot,
  generateDeterministicPluginRegistry,
} from "./registry.ts";

const pluginId = "text-stats";
const pluginRoot = resolve(deterministicPluginsRoot, pluginId);

export interface TextStats {
  readonly text: string;
  readonly characters: number;
  readonly words: number;
  readonly lines: number;
}

export interface LocalTextStatsRun {
  readonly stats: TextStats;
  readonly registration: ToolRegistration;
  readonly receipt: PluginLifecycleReceipt;
  readonly disclosureLines: readonly string[];
}

function validateStats(value: unknown): TextStats {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("text-stats plugin returned an invalid result");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 4 ||
    !["text", "characters", "words", "lines"].every((key) => keys.includes(key)) ||
    typeof record.text !== "string" ||
    typeof record.characters !== "number" ||
    !Number.isSafeInteger(record.characters) ||
    record.characters < 0 ||
    typeof record.words !== "number" ||
    !Number.isSafeInteger(record.words) ||
    record.words < 0 ||
    typeof record.lines !== "number" ||
    !Number.isSafeInteger(record.lines) ||
    record.lines < 0
  ) {
    throw new Error("text-stats plugin returned an invalid result");
  }
  return Object.freeze({
    text: record.text,
    characters: record.characters,
    words: record.words,
    lines: record.lines,
  });
}

export async function runLocalTextStats(input: string): Promise<LocalTextStatsRun> {
  if (typeof input !== "string") throw new TypeError("text input must be a string");
  const generated = generateDeterministicPluginRegistry();
  if (!generated.ok) throw new Error(`example registry generation failed: ${generated.error.code}`);
  const admitted = admitPinnedRegistryBytes({
    bytes: generated.bytes,
    pinPath: deterministicPinPath,
    pluginsRoot: deterministicPluginsRoot,
  });
  if (!admitted.ok) throw new Error(`example owner-pinned admission failed: ${admitted.code}`);

  return withOwnerApprovedSpawnPlugin({
    ticket: admitted.ticket,
    pluginId,
    pluginRoot,
    async run({ ticket, containerPort }) {
      const operation = await runToolOperation({
        ticket,
        containerPort,
        pluginId,
        operation: "analyze-text",
        input,
        deadlineMs: Date.now() + 15_000,
        requestId: `local-text-stats-${randomBytes(8).toString("hex")}`,
      });
      if (!operation.ok) throw new Error(`example plugin operation failed: ${operation.code}`);
      if (!operation.receipt.confirmedAbsent || operation.receipt.cleanupErrors.length !== 0) {
        throw new Error("example plugin process cleanup was not confirmed");
      }
      return Object.freeze({
        stats: validateStats(operation.result),
        registration: operation.registration,
        receipt: operation.receipt,
        disclosureLines: renderPluginDisclosureLines(admitted.ticket),
      });
    },
  });
}
