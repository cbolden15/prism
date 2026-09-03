# Plugin protocol

Version: 1

Wire boundary between a plugin container and the container broker (NDJSON
frames). Schema source of record: `pnh/sdk/protocol.ts` (frame types,
`MAX_FRAME_BYTES`, `MAX_JSON_DEPTH`, encode/validate functions). Field-layout
documentation lives here in a future revision; this stub exists to carry the
version declaration the registry pin enforces. Changing the schema source
requires bumping `Version:` here and the registry pin together.
