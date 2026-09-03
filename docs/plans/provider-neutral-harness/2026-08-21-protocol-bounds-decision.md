# Decision: the seven protocol resource bounds of PNH-INV-03

Date: 2026-08-21

## Decision

PNH-INV-03 declares seven bounds on the plugin wire protocol, enforced by
`pnh/sdk/protocol.ts`:

| Bound | Value | Enforced by |
|---|---|---|
| `max_frame_bytes` | 1,000,000 | `NdjsonFrameDecoder` (per-line byte length) and `encodePluginFrame` |
| `max_cumulative_bytes` | 8,000,000 | `NdjsonFrameDecoder` (bytes pushed across the life of a connection) |
| `max_message_count` | 256 | `NdjsonFrameDecoder` (frames decoded across the life of a connection) |
| `max_json_depth` | 16 | `validatePluginFrame` (nesting depth of `payload`/`result`) |
| `max_string_bytes` | 65,536 | `validatePluginFrame` (UTF-8 byte length of any JSON string) |
| `max_array_length` | 1,024 | `validatePluginFrame` (element count of any JSON array) |
| `max_object_keys` | 128 | `validatePluginFrame` (key count of any JSON object) |

These exist as a wire-protocol resource-exhaustion defense: a plugin process
is untrusted input on the other end of a pipe, and without hard ceilings on
frame size, cumulative bytes, message rate, nesting depth, string size,
array size, and object breadth, a single hostile or malfunctioning plugin
could exhaust host memory, stack depth, or CPU time before the harness ever
inspects a message's contents. Each bound fails the frame's allocation
closed — the decoder never repairs, truncates, or partially accepts an
over-bound frame.

## Normative home

The registry (`pnh/contracts/invariants.yaml`, PNH-INV-03 `bounds:` block)
is the normative record of these seven values, not the source code. The
source code (`pnh/sdk/protocol.ts`) is expected to match the registry at all
times; drift is a code change that must be accompanied by a deliberate
registry re-pin (`--update-lock`), not a silent divergence.

`pnh/tests/constitution-gate.test.ts` check 7 enforces this tie directly: it
imports the seven `MAX_*` constants from `pnh/sdk/protocol.ts` and the
`bounds` map from the loaded registry and fails, naming every mismatched
bound, if either side changes without the other.

## Conformance

All seven bounds are exercised by `pnh/tests/protocol-bounds.test.ts`, which
drives the real decoder/validator past each bound (asserting fail-closed
behavior) and, where practical, at or just under the bound (asserting
acceptance). This closes the coverage gap identified in PR #27 review that
demoted PNH-INV-03 to `proposed`.
